import { type Filter, kinds } from "nostr-tools";
import type { EventParameters } from "nostr-typedef";
import {
  type EventPacket,
  type LazyFilter,
  type RxReqEmittable,
  compareEvents,
  createRxBackwardReq,
  uniq,
} from "rx-nostr";
import { createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import {
  type CacheKey,
  createGetter,
  createGetters,
  eventCacheSetter,
} from "../context/eventCache";
import { useRxNostr } from "../context/rxNostr";
import { useRxQuery } from "../context/rxQuery";
import { type ParsedEventPacket, parseEventPacket } from "./parser";
import type { Metadata } from "./parser/0_metadata";
import type { ShortTextNote } from "./parser/1_shortTextNote";
import type { FollowList } from "./parser/3_contacts";
import type { Repost } from "./parser/6_repost";
import type { Reaction } from "./parser/7_reaction";
import type { EmojiList } from "./parser/10030_emojiList";
import type { EmojiSet } from "./parser/30030_emojiSet";

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
  const setter = eventCacheSetter();

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
            cacheAndEmitRelatedEvent(e, emit, setter);
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

export const getCacheKey = (
  parsed: ReturnType<typeof parseEventPacket>,
): {
  single?: CacheKey[];
  multiple?: CacheKey[];
} => {
  switch (parsed.parsed.kind) {
    case kinds.Metadata:
      return { single: [[kinds.Metadata, parsed.parsed.pubkey]] };
    case kinds.ShortTextNote:
      return { single: [[kinds.ShortTextNote, parsed.parsed.id]] };
    case kinds.Contacts:
      return { single: [[kinds.Contacts, parsed.parsed.pubkey]] };
    case kinds.UserEmojiList:
      return { single: [[kinds.UserEmojiList, parsed.parsed.pubkey]] };
    case kinds.Emojisets:
      return {
        single: [
          [kinds.Emojisets, parsed.parsed.pubkey, parsed.parsed.identifier],
        ],
      };
    case kinds.Repost: {
      // そのidのShortTextNoteのリポスト一覧
      const repostsOf = parsed.parsed.tags
        .filter((tag) => tag.kind === "e")
        .map((tag) => ["repostsOf", tag.id]);
      return { multiple: repostsOf };
    }
    case kinds.Reaction: {
      // そのidのShortTextNoteのリアクション一覧
      // そのユーザーのリアクション一覧
      return {
        multiple: [
          ["reactionsOf", parsed.parsed.targetEvent.id],
          ["reactionsBy", parsed.parsed.pubkey],
        ],
      };
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
    // 何もemitしないkind
    case kinds.Contacts:
    case kinds.Emojisets:
      return [];
    case kinds.Metadata:
      return [
        {
          kinds: [kinds.Contacts],
          authors: [parsed.parsed.pubkey],
        },
      ];
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
    case kinds.UserEmojiList: {
      const referencedSets = parsed.parsed.emojiSets;
      return referencedSets.map((set) => ({
        kinds: [kinds.Emojisets],
        authors: [set.pubkey],
        "#d": [set.tag],
      }));
    }
    default:
      console.warn(`[relatedEventFilters] unknown kind: ${parsed.raw.kind}`);
      return [];
  }
};

export const cacheAndEmitRelatedEvent = (
  e: EventPacket,
  emit: RxReqEmittable<{ relays: string[] }>["emit"],
  cacheSetter: ReturnType<typeof eventCacheSetter>,
) => {
  const parsed = parseEventPacket(e);
  const queryKeys = getCacheKey(parsed);

  // 最新1件のみをcacheに保存する
  for (const queryKey of queryKeys.single ?? []) {
    cacheSetter(queryKey, parsed);
  }

  // すべてのイベントをcacheに保存する
  for (const queryKey of queryKeys.multiple ?? []) {
    cacheSetter<ReturnType<typeof parseEventPacket>[]>(queryKey, (prev) => {
      if (prev) {
        // todo sort and uniq
        return [...prev, parsed];
      }
      return [parsed];
    });
  }

  const relatedEventFilters = getRelatedEventFilters(parsed);
  emit(relatedEventFilters);
};

export const useShortTextByID = (
  id: () => string | undefined,
  relays?: () => string[] | undefined,
) => {
  const queryKey = () => [kinds.ShortTextNote, id()];

  const {
    actions: { emit },
  } = useRxQuery();

  const emitter = () => {
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
  };

  return createGetter<ParsedEventPacket<ShortTextNote>>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useFollowees = (pubkey: () => string | undefined) => {
  const queryKey = () => [kinds.Contacts, pubkey()];

  const {
    actions: { emit },
  } = useRxQuery();

  const emitter = () => {
    const _pubkey = pubkey();
    if (_pubkey) {
      emit({
        kinds: [kinds.Contacts],
        authors: [_pubkey],
      });
    }
  };

  return createGetter<ParsedEventPacket<FollowList>>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useProfile = (pubkey: () => string | undefined) => {
  const queryKey = () => [kinds.Metadata, pubkey()];

  const {
    actions: { emit },
  } = useRxQuery();

  const emitter = () => {
    const _pubkey = pubkey();
    if (_pubkey) {
      emit({
        kinds: [kinds.Metadata],
        authors: [_pubkey],
      });
    }
  };

  return createGetter<ParsedEventPacket<Metadata>>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useReactionsOfEvent = (eventID: () => string | undefined) => {
  const queryKey = () => ["reactionsOf", eventID()];

  const {
    actions: { emit },
  } = useRxQuery();

  const emitter = () => {
    const _eventID = eventID();
    if (_eventID) {
      emit({
        kinds: [kinds.Reaction],
        "#e": [_eventID],
      });
    }
  };

  return createGetter<ParsedEventPacket<Reaction>[]>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useReactionsByPubkey = (pubkey: () => string | undefined) => {
  const queryKey = () => ["reactionsBy", pubkey()];

  const {
    actions: { emit },
  } = useRxQuery();

  const emitter = () => {
    const _pubkey = pubkey();
    if (_pubkey) {
      emit({
        kinds: [kinds.Reaction],
        authors: [_pubkey],
      });
    }
  };

  return createGetter<ParsedEventPacket<Reaction>[]>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useRepostsOfEvent = (eventID: () => string | undefined) => {
  const queryKey = () => ["repostsOf", eventID()];

  const {
    actions: { emit },
  } = useRxQuery();
  const emitter = () => {
    const _eventID = eventID();
    if (_eventID) {
      emit({
        kinds: [kinds.Repost],
        "#e": [_eventID],
      });
    }
  };

  return createGetter<ParsedEventPacket<Repost>[]>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useEmojis = (pubkey: () => string | undefined) => {
  const queryKey = () => [kinds.UserEmojiList, pubkey()];

  const {
    actions: { emit },
  } = useRxQuery();
  const emojiListEmitter = () => {
    const _pubkey = pubkey();
    if (_pubkey) {
      emit({
        kinds: [kinds.UserEmojiList],
        authors: [_pubkey],
      });
    }
  };
  const emojiList = createGetter<ParsedEventPacket<EmojiList>>(() => ({
    queryKey: queryKey(),
    emitter: emojiListEmitter,
  }));

  const emojiSets = createGetters<ParsedEventPacket<EmojiSet>>(() => {
    return (
      emojiList().data?.parsed.emojiSets?.map((set) => ({
        queryKey: [kinds.Emojisets, set.pubkey, set.tag],
        emitter: () => {
          emit({
            kinds: [kinds.Emojisets],
            authors: [set.pubkey],
            "#d": [set.tag],
          });
        },
      })) ?? []
    );
  });

  const emoji = createMemo(() => {
    const emojisFromList = emojiList().data?.parsed.emojis.map((e) => ({
      name: e.name,
      url: e.url,
    }));

    const emojisFromSets = emojiSets().flatMap(
      (set) =>
        set().data?.parsed.emojis.map((e) => ({
          name: e.name,
          url: e.url,
        })) ?? [],
    );

    return emojisFromList?.concat(emojisFromSets);
  });

  return emoji;
};

const createSender = () => {
  const rxNostr = useRxNostr();
  const [sendState, setSendState] = createStore<{
    sending: boolean;
    successAny: boolean;
    error: unknown;
    relayStates: {
      [relay: string]:
        | {
            done: boolean;
            notice?: string;
          }
        | undefined;
    };
  }>({
    sending: false,
    successAny: false,
    relayStates: {},
    error: undefined,
  });

  const sender = (event: EventParameters) => {
    setSendState("sending", true);
    setSendState("successAny", false);
    return new Promise<void>((resolve) => {
      rxNostr.send(event).subscribe({
        next: (e) => {
          if (e.ok && e.done) {
            setSendState("successAny", true);
            setSendState("relayStates", e.from, {
              done: true,
            });
          }
          if (e.notice) {
            setSendState("relayStates", e.from, {
              notice: e.notice,
            });
          }
        },
        error(err) {
          console.error("[send] error on sending", err);
          setSendState("error", err);
        },
        complete: () => {
          setSendState("sending", false);
          resolve();
        },
      });
    });
  };

  return {
    sendState,
    sender,
  };
};

export const useSendShortText = () => {
  const { sender, sendState } = createSender();

  const sendShortText = (props: {
    content: string;
  }) =>
    sender({
      kind: kinds.ShortTextNote,
      content: props.content,
    });

  return {
    sendShortText,
    sendState,
  };
};
