import { type Filter, kinds } from "nostr-tools";
import type { Event, EventParameters } from "nostr-typedef";
import {
  type EventPacket,
  type LazyFilter,
  type RxReqEmittable,
  batch,
  compareEvents,
  createRxBackwardReq,
  latestEach,
  uniq,
} from "rx-nostr";
import { bufferWhen, interval, map, tap } from "rxjs";
import stringify from "safe-stable-stringify";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import {
  type CacheDataBase,
  type CacheKey,
  createGetter,
  createGetters,
  eventCacheSetter,
  useEventCacheStore,
  useInvalidateEventCache,
} from "../../context/eventCache";
import { useRxNostr } from "../../context/rxNostr";
import { mergeSimilarAndRemoveEmptyFilters } from "./mergeFilters";
import {
  type ParsedEventPacket,
  parseEventPacket,
  type parseNostrEvent,
} from "./parser";
import type { Metadata } from "./parser/0_metadata";
import type { ShortTextNote } from "./parser/1_shortTextNote";
import type { FollowList } from "./parser/3_contacts";
import type { Repost } from "./parser/6_repost";
import type { Reaction } from "./parser/7_reaction";
import type { EmojiList } from "./parser/10030_emojiList";
import type { EmojiSet } from "./parser/30030_emojiSet";

export const createInfiniteRxQuery = (
  props: () => {
    filter: Filter;
    limit: number;
    relays?: string[];
  },
) => {
  // TODO: propsが変化したら再取得する
  // TODO: abort controller

  const {
    rxNostr,
    actions: { emit },
  } = useRxNostr();
  const setter = eventCacheSetter();

  const [data, setData] = createStore<{
    pages: ParsedEventPacket[][];
  }>({
    pages: [],
  });
  const [isFetching, setIsFetching] = createSignal(false);
  const [hasNextPage, setHasNextPage] = createSignal(false);

  /** 取得済みイベントの中で最も古いイベントのcreated_at */
  let oldestCreatedAt: number | undefined = Math.min(
    // 現在時刻とprops.filter.untilの小さい方で初期化
    Math.floor(new Date().getTime() / 1000),
    props().filter.until ?? Number.POSITIVE_INFINITY,
  );

  const fetchNextPage = async () => {
    const rxReq = createRxBackwardReq();
    setIsFetching(true);

    const page = await new Promise<ParsedEventPacket[]>((resolve) => {
      const events: ParsedEventPacket[] = [];
      rxNostr
        .use(rxReq, {
          on: {
            relays: props().relays,
            defaultReadRelays: !props().relays,
          },
        })
        .pipe(
          uniq(),
          tap((e) => cacheAndEmitRelatedEvent(e, emit, setter)),
          map((e) => parseEventPacket(e)),
        )
        .subscribe({
          next: (e) => {
            events.push(e);
          },
          complete: () => {
            const sliced = events
              .sort((a, b) => -compareEvents(a.raw, b.raw))
              .slice(0, props().limit);

            oldestCreatedAt = sliced.at(-1)?.raw.created_at;

            resolve(sliced);
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

// TODO: ここで各kindのstaleTimeも設定する
const getCacheKey = (
  parsed: ReturnType<typeof parseEventPacket>,
): {
  single?: CacheKey[];
  multiple?: CacheKey[];
} => {
  switch (parsed.parsed.kind) {
    case kinds.ShortTextNote: {
      const replyTarget = parsed.parsed.replyOrRoot
        ? ["repliesOf", parsed.parsed.replyOrRoot.id]
        : [];

      return {
        single: [["event", parsed.parsed.id]],
        multiple: [replyTarget],
      };
    }
    case kinds.Metadata:
    case kinds.Contacts:
    case kinds.UserEmojiList:
      // 特定ユーザーについて最新1件を取得できれば良いもの
      return { single: [[parsed.raw.kind, parsed.parsed.pubkey]] };
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
      return {
        multiple: [["reactionsOf", parsed.parsed.targetEvent.id]],
      };
    }
    default:
      console.warn(`[getQueryKey] unknown kind: ${parsed.raw.kind}`);
      return {
        multiple: [["event", parsed.raw.id]],
      };
  }
};

const getRelatedEventFilters = (
  parsed: ReturnType<typeof parseEventPacket>,
): LazyFilter[] => {
  switch (parsed.parsed.kind) {
    // 何もemitしないkind
    case kinds.Contacts:
    case kinds.Emojisets:
      return [];
    case kinds.Metadata:
      return [
        // {
        //   kinds: [kinds.Contacts],
        //   authors: [parsed.parsed.pubkey],
        // },
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
    cacheSetter<ReturnType<typeof parseEventPacket>>(queryKey, (prev) => {
      if (prev && prev.raw.created_at > parsed.raw.created_at) {
        return prev;
      }
      return parsed;
    });
  }

  // すべてのイベントをcacheに保存する
  for (const queryKey of queryKeys.multiple ?? []) {
    cacheSetter<ReturnType<typeof parseEventPacket>[]>(queryKey, (prev) => {
      if (prev) {
        // 既に同じイベントがあれば追加しない
        if (prev.some((p) => p.raw.id === parsed.raw.id)) {
          return prev;
        }

        // TODO: sort
        return [parsed, ...prev];
      }
      return [parsed];
    });
  }

  const relatedEventFilters = getRelatedEventFilters(parsed);
  emit(relatedEventFilters);
};

export const useEventByID = <T = ReturnType<typeof parseNostrEvent>>(
  id: () => string | undefined,
  relays?: () => string[] | undefined,
) => {
  const queryKey = () => ["event", id()];

  const {
    actions: { emit },
  } = useRxNostr();

  const emitter = () => {
    const _id = id();
    if (_id) {
      const _relays = relays?.() ?? [];
      emit(
        { ids: [_id] },
        _relays.length > 0
          ? {
              relays: _relays,
            }
          : undefined,
      );
    }
  };

  return createGetter<ParsedEventPacket<T>>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useFollowees = (pubkey: () => string | undefined) => {
  const queryKey = () => [kinds.Contacts, pubkey()];

  const {
    actions: { emit },
  } = useRxNostr();

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

export const useFollowers = (pubkey: () => string | undefined) => {
  // フォロワー取得は個別に行う
  // TODO: refactoring

  const queryKey = () => ["followers", pubkey()];
  const { rxNostr } = useRxNostr();
  const setter = eventCacheSetter();

  const req = createRxBackwardReq();

  const emitter = () => {
    const _pubkey = pubkey();
    if (_pubkey) {
      req.emit({
        kinds: [kinds.Contacts],
        "#p": [_pubkey],
      });
    }
  };

  rxNostr
    .use(
      req.pipe(
        bufferWhen(() => interval(1000)),
        batch((a, b) => mergeSimilarAndRemoveEmptyFilters([...a, ...b])),
      ),
    )
    .pipe(
      uniq(),
      latestEach((e) => e.event.pubkey),
    )
    .subscribe({
      next: (e) => {
        setter<string[]>(queryKey(), (prev) => {
          if (prev) {
            if (prev.includes(e.event.pubkey)) {
              return prev;
            }

            return [...prev, e.event.pubkey];
          }
          return [e.event.pubkey];
        });
      },
    });

  return createGetter<string[]>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useProfile = (pubkey: () => string | undefined) => {
  const queryKey = () => [kinds.Metadata, pubkey()];

  const {
    actions: { emit },
  } = useRxNostr();

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
  } = useRxNostr();

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

export const useRepostsOfEvent = (eventID: () => string | undefined) => {
  const queryKey = () => ["repostsOf", eventID()];

  const {
    actions: { emit },
  } = useRxNostr();
  const emitter = () => {
    const _eventID = eventID();
    if (_eventID) {
      emit({
        kinds: [kinds.Repost, kinds.GenericRepost],
        "#e": [_eventID],
      });
    }
  };

  return createGetter<ParsedEventPacket<Repost>[]>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useRepliesOfEvent = (eventID: () => string | undefined) => {
  const queryKey = () => ["repliesOf", eventID()];

  const {
    actions: { emit },
  } = useRxNostr();
  const emitter = () => {
    const _eventID = eventID();
    if (_eventID) {
      emit({
        kinds: [kinds.ShortTextNote],
        "#e": [_eventID],
      });
    }
  };

  return createGetter<ParsedEventPacket<ShortTextNote>[]>(() => ({
    queryKey: queryKey(),
    emitter,
  }));
};

export const useEmojis = (pubkey: () => string | undefined) => {
  const queryKey = () => [kinds.UserEmojiList, pubkey()];

  const {
    actions: { emit },
  } = useRxNostr();
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

  return {
    emojiList,
    emojiSets,
  };
};

const useCacheByQueryKey = <T>(queryKey: () => CacheKey) => {
  const cache = useEventCacheStore();

  return () =>
    Object.entries(cache)
      .filter(
        ([key, value]) =>
          key.startsWith(stringify(queryKey()).slice(0, -1)) && !!value?.data,
      )
      .map(([_, value]) => value as CacheDataBase<T>);
};

export const useUserList = () =>
  useCacheByQueryKey<ParsedEventPacket<Metadata>>(() => [0]);

const createSender = () => {
  const { rxNostr } = useRxNostr();
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

  const sender = (event: EventParameters, onComplete?: () => void) => {
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
          onComplete?.();
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
    // TODO: typing
    tags?: string[][];
  }) =>
    sender({
      kind: kinds.ShortTextNote,
      content: props.content,
      tags: props.tags ?? [],
    });

  return {
    sendShortText,
    sendState,
  };
};

export const useSendReaction = () => {
  const { sender, sendState } = createSender();
  const invalidate = useInvalidateEventCache();

  const sendReaction = (props: {
    content: Reaction["content"];
    targetEventId: string;
    targetEventPubkey: string;
    kind?: number;
  }) => {
    const tags = [
      ["e", props.targetEventId, ""],
      ["p", props.targetEventPubkey],
      ["k", props.kind?.toString() ?? "1"],
    ];
    if (props.content.type === "emoji") {
      tags.push(["emoji", props.content.name, props.content.url]);
    }
    const content =
      props.content.type === "emoji"
        ? `:${props.content.name}:`
        : props.content.type === "like"
          ? "+"
          : props.content.content;

    return sender(
      {
        kind: kinds.Reaction,
        content,
        tags,
      },
      () => {
        invalidate(["reactionsOf", props.targetEventId]);
      },
    );
  };

  return {
    sendReaction,
    sendState,
  };
};

export const useSendRepost = () => {
  const { sender, sendState } = createSender();
  const invalidate = useInvalidateEventCache();

  const sendRepost = (props: {
    targetEvent: Event;
    relay: string;
  }) => {
    const tags = [
      ["e", props.targetEvent.id, props.relay],
      ["p", props.targetEvent.pubkey],
    ];

    // ShortTextNote以外のイベントの場合はkindを追加
    if (props.targetEvent.kind !== kinds.ShortTextNote) {
      tags.push(["k", props.targetEvent.kind.toString()]);
    }

    return sender(
      {
        // ShortTextNote以外のイベントの場合はGenericRepostにする
        kind:
          props.targetEvent.kind === kinds.ShortTextNote
            ? kinds.Repost
            : kinds.GenericRepost,
        tags,
        content: JSON.stringify(props.targetEvent),
      },
      () => {
        invalidate(["repostsOf", props.targetEvent.id]);
      },
    );
  };

  return {
    sendRepost,
    sendState,
  };
};

export const useSendContacts = () => {
  const { sender, sendState } = createSender();
  const invalidate = useInvalidateEventCache();

  const sendContacts = (props: {
    pubkey: string;
    newFollowees: string[];
    content: string;
  }) => {
    const tags = props.newFollowees.map((pubkey) => ["p", pubkey]);

    return sender(
      {
        kind: kinds.Contacts,
        tags,
        content: props.content,
      },
      () => {
        invalidate([kinds.Contacts, props.pubkey]);
      },
    );
  };

  return {
    sendContacts,
    sendState,
  };
};
