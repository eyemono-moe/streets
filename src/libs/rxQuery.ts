import {
  type QueryClient,
  type QueryKey,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { type Filter, kinds } from "nostr-tools";
import {
  type EventPacket,
  type LazyFilter,
  type RxReqEmittable,
  compareEvents,
  createRxBackwardReq,
  uniq,
} from "rx-nostr";
import { createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { useRxNostr } from "../context/rxNostr";
import { useRxQuery } from "../context/rxQuery";
import { type ParsedEventPacket, parseEventPacket } from "./parser";
import type { Metadata } from "./parser/0_metadata";
import type { ShortTextNote } from "./parser/1_shortTextNote";
import type { FollowList } from "./parser/3_contacts";
import type { Repost } from "./parser/6_repost";
import type { Reaction } from "./parser/7_reaction";

export const createInfiniteRxQuery = <T>(
  props: () => {
    parser: (e: EventPacket) => T;
    filter: Filter;
    limit: number;
  },
) => {
  const rxNostr = useRxNostr();

  const {
    actions: { emit },
  } = useRxQuery();
  const queryClient = useQueryClient();

  const [data, setData] = createStore<{
    pages: T[][];
  }>({
    pages: [],
  });
  const [isFetching, setIsFetching] = createSignal(false);
  const [hasNextPage, setHasNextPage] = createSignal(false);
  let oldestCreatedAt: number | undefined = Math.floor(
    new Date().getTime() / 1000,
  );

  const fetchNextPage = async () => {
    const rxReq = createRxBackwardReq();
    setIsFetching(true);

    const page = await new Promise<T[]>((resolve) => {
      const events: EventPacket[] = [];
      rxNostr
        .use(rxReq)
        .pipe(uniq())
        .subscribe({
          next: (e) => {
            events.push(e);
            cacheAndEmitRelatedEvent(e, emit, queryClient);
          },
          complete: () => {
            const sliced = events
              .sort((a, b) => -compareEvents(a.event, b.event))
              .slice(0, props().limit);

            oldestCreatedAt = sliced.at(-1)?.event.created_at;

            resolve(sliced.map(props().parser));
          },
        });

      if (oldestCreatedAt) {
        rxReq.emit({
          ...props().filter,
          limit: props().limit,
          until: oldestCreatedAt - 1,
        });
      }
      rxReq.over();
    });
    if (page.length > 0) {
      setData("pages", data.pages.length, page);
    }
    setIsFetching(false);

    if (page.length < props().limit) {
      setHasNextPage(false);
    } else {
      setHasNextPage(true);
    }
  };

  fetchNextPage();

  return {
    data,
    isFetching,
    hasNextPage,
    fetchNextPage,
  };
};

export const getQueryKey = (
  parsed: ReturnType<typeof parseEventPacket>,
): {
  single?: QueryKey[];
  multiple?: QueryKey[];
} => {
  switch (parsed.parsed.kind) {
    case kinds.Metadata:
      return { single: [[kinds.Metadata, parsed.parsed.pubkey]] };
    case kinds.ShortTextNote:
      return { single: [[kinds.ShortTextNote, parsed.parsed.id]] };
    case kinds.Contacts:
      return { single: [[kinds.Contacts, parsed.parsed.pubkey]] };
    case kinds.Repost: {
      // そのidのShortTextNoteのリポスト一覧
      const repostsOf = parsed.parsed.tags
        .filter((tag) => tag.kind === "e")
        .map((tag) => ["repostsOf", tag.id]);
      return { multiple: repostsOf };
    }
    case kinds.Reaction: {
      // そのidのShortTextNoteのリアクション一覧
      return { multiple: [["reactionsOf", parsed.parsed.targetEvent.id]] };
    }
    default:
      console.warn(`[getQueryKey] unknown kind: ${parsed.raw.kind}`);
      return {
        multiple: [[parsed.raw.kind, parsed.raw.id]],
      };
  }
};

export const getRelatedEventFilters = (
  parsed: ReturnType<typeof parseEventPacket>,
): LazyFilter[] => {
  switch (parsed.parsed.kind) {
    case kinds.Metadata:
      return [];
    case kinds.ShortTextNote: {
      const authors = parsed.parsed.tags
        .filter((tag) => tag.kind === "p")
        .map((tag) => tag.pubkey);
      authors.push(parsed.parsed.pubkey);

      // const relatedEvents = parsed.parsed.tags
      //   .filter((tag) => tag.kind === "e" || tag.kind === "q")
      //   .map((tag) => tag.id);

      return [
        {
          kinds: [kinds.Metadata],
          authors: authors,
        },
        // TODO: これを入れると無限ループする?
        // {
        //   kinds: [kinds.ShortTextNote],
        //   ids: relatedEvents,
        // },
        {
          kinds: [kinds.Reaction, kinds.Repost],
          "#e": [parsed.parsed.id],
        },
      ];
    }
    case kinds.Contacts:
      // TODO: 一旦なにもemitしない
      // 本来ならpubkey一覧をemitしたいが、staleTimeを使った実装をできていないので無限ループしそう
      return [];
    case kinds.Repost: {
      return [
        {
          kinds: [kinds.ShortTextNote],
          ids: [parsed.parsed.targetEventID],
          // limit: 1,
        },
      ];
    }
    case kinds.Reaction:
      return [
        {
          kinds: [kinds.Metadata],
          authors: [parsed.parsed.pubkey],
        },
      ];
    default:
      console.warn(`[relatedEventFilters] unknown kind: ${parsed.raw.kind}`);
      return [];
  }
};

export const cacheAndEmitRelatedEvent = (
  e: EventPacket,
  emit: RxReqEmittable<{ relays: string[] }>["emit"],
  queryClient: QueryClient,
) => {
  const parsed = parseEventPacket(e);
  const queryKeys = getQueryKey(parsed);

  // 最新1件のみをcacheに保存する
  for (const queryKey of queryKeys.single ?? []) {
    queryClient.prefetchQuery({
      queryKey,
      queryFn: () => {
        return parsed;
      },
    });
  }

  // すべてのイベントをcacheに保存する
  for (const queryKey of queryKeys.multiple ?? []) {
    // queryClient.prefetchQuery({
    //   queryKey,
    //   queryFn: () => {
    //     const prev = queryClient.getQueryData<
    //       ReturnType<typeof parseEventPacket>[] | undefined
    //     >(queryKey);
    //     if (prev) {
    //       // TODO: sort?
    //       return [...prev, parsed];
    //     }
    //     return [parsed];
    //   },
    // });

    // prefetchを使うとprevをうまく取得できないのでsetQueryDataを使う
    // TODO: fixme
    queryClient.setQueryData<ReturnType<typeof parseEventPacket>[] | undefined>(
      queryKey,
      (prev) => {
        if (prev) {
          return [...prev, parsed];
        }
        return [parsed];
      },
    );
  }

  const relatedEventFilters = getRelatedEventFilters(parsed);
  emit(relatedEventFilters);
};

const isStale = (queryKey: QueryKey) => {
  const queryClient = useQueryClient();
  const state = queryClient.getQueryState(queryKey);
  // TODO: stale timeをちゃんと見る
  return state === undefined || state.data === undefined;
};

export const useShortTextByID = (
  id: () => string | undefined,
  relays?: () => string[] | undefined,
) => {
  const queryKey = () => [kinds.ShortTextNote, id()];

  const {
    actions: { emit },
  } = useRxQuery();

  createEffect(() => {
    if (isStale(queryKey())) {
      const _id = id();
      if (_id) {
        const _relays = relays?.() ?? [];
        emit(
          { kinds: [kinds.ShortTextNote], ids: [_id] },
          _relays.length > 0
            ? {
                relays: _relays,
              }
            : undefined,
        );
      }
    }
  });

  return createQuery<ParsedEventPacket<ShortTextNote>>(() => ({
    queryKey: queryKey(),
    enabled: !!id(),
  }));
};

export const useFollowees = (pubkey: () => string | undefined) => {
  const queryKey = () => [kinds.Contacts, pubkey()];

  const {
    actions: { emit },
  } = useRxQuery();

  createEffect(() => {
    if (isStale(queryKey())) {
      const _pubkey = pubkey();
      if (_pubkey) {
        emit({
          kinds: [kinds.Contacts],
          authors: [_pubkey],
        });
      }
    }
  });

  return createQuery<ParsedEventPacket<FollowList>>(() => ({
    queryKey: queryKey(),
    enabled: !!pubkey(),
  }));
};

export const useProfile = (pubkey: () => string | undefined) => {
  const queryKey = () => [kinds.Metadata, pubkey()];
  // TODO: staleかどうか判定し、staleならemitする

  return createQuery<ParsedEventPacket<Metadata>>(() => ({
    queryKey: queryKey(),
    enabled: !!pubkey(),
  }));
};

export const useReactionsOfEvent = (eventID: () => string | undefined) => {
  const queryKey = () => ["reactionsOf", eventID()];
  // const queryClient = useQueryClient();
  // TODO: staleかどうか判定し、staleならemitする

  return createQuery<ParsedEventPacket<Reaction>[]>(() => ({
    queryKey: queryKey(),
    enabled: !!eventID(),
  }));
};

export const useRepostsOfEvent = (eventID: () => string | undefined) => {
  const queryKey = () => ["repostsOf", eventID()];
  // const queryClient = useQueryClient();
  // TODO: staleかどうか判定し、staleならemitする

  return createQuery<ParsedEventPacket<Repost>[]>(() => ({
    queryKey: queryKey(),
    enabled: !!eventID(),
  }));
};
