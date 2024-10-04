import {
  type QueryKey,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { type Filter, kinds } from "nostr-tools";
import {
  type EventPacket,
  compareEvents,
  createRxBackwardReq,
  uniq,
} from "rx-nostr";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { useRxNostr } from "../context/rxNostr";
import { useRxQuery } from "../context/rxQuery";
import { type ParsedEventPacket, parseEventPacket } from "./parser";
import type { Metadata } from "./parser/0_metadata";
import type { ShortTextNote } from "./parser/1_shortTextNote";
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

            // TODO: 各イベントについて自動でemitする関数を作る
            const ps = e.event.tags
              .filter((t) => t[0] === "p")
              .map((t) => t[1]);
            ps.push(e.event.pubkey);
            if (ps.length) {
              emit({ kinds: [kinds.Metadata], authors: ps });
            }

            const es = e.event.tags
              .filter((t) => t[0] === "e")
              .map((t) => t[1]);
            if (es.length) {
              emit({ kinds: [kinds.ShortTextNote], "#e": es });
            }
            emit({ kinds: [kinds.Repost, kinds.Reaction], "#e": [e.event.id] });

            queryClient.prefetchQuery({
              queryKey: [e.event.kind, e.event.id],
              queryFn: () => {
                return parseEventPacket(e);
              },
            });
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

  if (isStale(queryKey())) {
    const _id = id();
    if (_id) {
      emit(
        { kinds: [kinds.ShortTextNote], ids: [_id], limit: 1 },
        {
          relays: relays?.() ?? [],
        },
      );
    }
  }

  return createQuery<ParsedEventPacket<ShortTextNote>>(() => ({
    queryKey: queryKey(),
    enabled: !!id(),
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
