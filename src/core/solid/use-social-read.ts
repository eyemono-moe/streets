import { type NostrEvent, kinds } from "nostr-tools";
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { CacheDataBase } from "../../context/eventCache";
import {
  type ParsedEventPacket,
  parseNostrEvent,
} from "../../shared/libs/parser";
import type { Metadata } from "../../shared/libs/parser/0_metadata";
import type { FollowList } from "../../shared/libs/parser/3_contacts";
import type { EmojiList } from "../../shared/libs/parser/10030_emojiList";
import type { EmojiSet } from "../../shared/libs/parser/30030_emojiSet";
import type { NostrEventQuery, RelayUrl } from "../repository/nostr-repository";
import { useNostrCore } from "./provider";

type EmojiSetReference = {
  pubkey: string;
  tag: string;
};

const createCacheData = <T>(
  data?: T,
  isFetching = false,
): CacheDataBase<T> => ({
  data,
  dataUpdatedAt: data ? Date.now() : 0,
  isFetching,
  isInvalidated: false,
});

const toParsedEventPacket = <T>(
  event: NostrEvent,
  relay?: RelayUrl,
): ParsedEventPacket<T> => ({
  from: relay ?? "",
  raw: event,
  parsed: parseNostrEvent(event) as T,
});

const eventsForQuery = (
  eventStore: ReturnType<typeof useNostrCore>["eventStore"],
  query: NostrEventQuery,
) => {
  const events = eventStore
    .queryEvents({
      ids: query.ids ? [...query.ids] : undefined,
      authors: query.authors ? [...query.authors] : undefined,
      kinds: query.kinds ? [...query.kinds] : undefined,
      limit: query.limit,
      ...Object.fromEntries(
        Object.entries(query.tags ?? {}).map(([name, values]) => [
          `#${name}`,
          [...values],
        ]),
      ),
    })
    .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
  return query.limit ? events.slice(0, query.limit) : events;
};

const querySignature = (query: NostrEventQuery) =>
  JSON.stringify({
    ids: query.ids ? [...query.ids].sort() : undefined,
    authors: query.authors ? [...query.authors].sort() : undefined,
    kinds: query.kinds ? [...query.kinds].sort((a, b) => a - b) : undefined,
    tags: query.tags
      ? Object.fromEntries(
          Object.entries(query.tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, values]) => [name, [...values].sort()]),
        )
      : undefined,
    limit: query.limit,
  });

const queriesAreEqual = (
  previous: readonly NostrEventQuery[],
  next: readonly NostrEventQuery[],
) =>
  previous.length === next.length &&
  previous.every((query, index) => {
    const nextQuery = next[index];
    return (
      nextQuery !== undefined &&
      querySignature(query) === querySignature(nextQuery)
    );
  });

export const useCoreEventList = <T = ReturnType<typeof parseNostrEvent>>(
  query: () => NostrEventQuery | undefined,
  relays?: () => readonly RelayUrl[] | undefined,
) => {
  const packets = useCoreEventPackets<T>(query, relays);

  return createMemo<CacheDataBase<ParsedEventPacket<T>>>(() => {
    const data = packets().data?.[0];
    return {
      data,
      dataUpdatedAt: packets().dataUpdatedAt,
      isFetching: packets().isFetching,
      isInvalidated: packets().isInvalidated,
    };
  });
};

export const useCoreEventPackets = <T = ReturnType<typeof parseNostrEvent>>(
  query: () => NostrEventQuery | undefined,
  relays?: () => readonly RelayUrl[] | undefined,
) => {
  return useCoreEventPacketsForQueries<T>(() => {
    const currentQuery = query();
    return currentQuery ? [currentQuery] : [];
  }, relays);
};

const useCoreEventPacketsForQueries = <T = ReturnType<typeof parseNostrEvent>>(
  queries: () => readonly NostrEventQuery[],
  relays?: () => readonly RelayUrl[] | undefined,
) => {
  const core = useNostrCore();
  const [cache, setCache] = createSignal<CacheDataBase<ParsedEventPacket<T>[]>>(
    createCacheData<ParsedEventPacket<T>[]>(),
  );
  const stableQueries = createMemo(() => [...queries()], undefined, {
    equals: queriesAreEqual,
  });
  let requestVersion = 0;

  const syncFromEventStore = (currentQueries: readonly NostrEventQuery[]) => {
    const eventById = new Map(
      currentQueries
        .flatMap((currentQuery) =>
          eventsForQuery(core.eventStore, currentQuery),
        )
        .map((event) => [event.id, event]),
    );
    const events = [...eventById.values()].sort(
      (a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id),
    );
    const data = events.map((event) =>
      toParsedEventPacket<T>(event, core.eventStore.getSeenRelays(event.id)[0]),
    );

    setCache({
      data: data.length > 0 ? data : undefined,
      dataUpdatedAt: Date.now(),
      isFetching: false,
      isInvalidated: false,
    });
    return data;
  };

  // Keep legacy accessor data synchronized with v1 events while query issuance goes through
  // the core query client instead of the removed legacy event-cache getter helpers.
  createEffect(() => {
    const currentQueries = stableQueries();
    const currentRelays = relays?.();
    const currentRequestVersion = ++requestVersion;
    if (currentQueries.length === 0) {
      setCache(createCacheData<ParsedEventPacket<T>[]>());
      return;
    }

    const unsubscribe = core.eventStore.subscribe(() => {
      syncFromEventStore(currentQueries);
    });

    syncFromEventStore(currentQueries);
    setCache((prev) => ({ ...prev, isFetching: true }));
    void Promise.all(
      currentQueries.map((currentQuery) =>
        core.queryClient.ensureEventRelations({
          query: currentQuery,
          relays: currentRelays,
        }),
      ),
    )
      .then(async (eventGroups) => {
        if (requestVersion !== currentRequestVersion) {
          return;
        }
        eventGroups;
        if (requestVersion !== currentRequestVersion) {
          return;
        }
        syncFromEventStore(currentQueries);
        setCache((prev) => ({ ...prev, isFetching: false }));
      })
      .catch(() => {
        if (requestVersion === currentRequestVersion) {
          setCache((prev) => ({ ...prev, isFetching: false }));
        }
      });

    onCleanup(() => {
      unsubscribe();
    });
  });

  return cache;
};

export const useCoreFollowees = (pubkey: () => string | undefined) =>
  useCoreEventList<FollowList>(() => {
    const _pubkey = pubkey();
    return _pubkey
      ? { kinds: [kinds.Contacts], authors: [_pubkey], limit: 1 }
      : undefined;
  });

export const useCoreFollowers = (pubkey: () => string | undefined) => {
  const core = useNostrCore();
  const matchingContacts = useCoreEventPackets<FollowList>(() => {
    const _pubkey = pubkey();
    return _pubkey
      ? { kinds: [kinds.Contacts], tags: { p: [_pubkey] } }
      : undefined;
  });
  const candidateAuthors = createMemo(
    () =>
      [
        ...new Set(matchingContacts().data?.map((packet) => packet.raw.pubkey)),
      ].sort(),
    undefined,
    {
      equals: (previous, next) =>
        previous.length === next.length &&
        previous.every((author, index) => author === next[index]),
    },
  );
  const authorContacts = useCoreEventPackets<FollowList>(() => {
    const authors = candidateAuthors();
    return authors.length > 0
      ? { kinds: [kinds.Contacts], authors }
      : undefined;
  });

  return createMemo<CacheDataBase<string[]>>(() => {
    const _pubkey = pubkey();
    authorContacts();
    const latestContactByAuthor = new Map<string, NostrEvent>();
    for (const event of core.eventStore.queryEvents({
      kinds: [kinds.Contacts],
    })) {
      const current = latestContactByAuthor.get(event.pubkey);
      if (
        !current ||
        event.created_at > current.created_at ||
        (event.created_at === current.created_at &&
          event.id.localeCompare(current.id) > 0)
      ) {
        latestContactByAuthor.set(event.pubkey, event);
      }
    }
    const followers = _pubkey
      ? [...latestContactByAuthor.values()]
          .filter((event) =>
            event.tags.some((tag) => tag[0] === "p" && tag[1] === _pubkey),
          )
          .map((event) => event.pubkey)
      : undefined;

    return {
      data: followers && followers.length > 0 ? followers : undefined,
      dataUpdatedAt: Math.max(
        matchingContacts().dataUpdatedAt,
        authorContacts().dataUpdatedAt,
      ),
      isFetching: matchingContacts().isFetching || authorContacts().isFetching,
      isInvalidated:
        matchingContacts().isInvalidated || authorContacts().isInvalidated,
    };
  });
};

export const useCoreEmojiList = (pubkey: () => string | undefined) =>
  useCoreEventList<EmojiList>(() => {
    const _pubkey = pubkey();
    return _pubkey
      ? { kinds: [kinds.UserEmojiList], authors: [_pubkey], limit: 1 }
      : undefined;
  });

export const useCoreUserList = () => {
  const core = useNostrCore();
  const [users, setUsers] = createSignal<
    CacheDataBase<ParsedEventPacket<Metadata>>[]
  >([]);

  const syncFromProfileView = () => {
    setUsers(
      core.profileView.listProfiles().map((event) => ({
        data: toParsedEventPacket<Metadata>(
          event,
          core.eventStore.getSeenRelays(event.id)[0],
        ),
        dataUpdatedAt: Date.now(),
        isFetching: false,
        isInvalidated: false,
      })),
    );
  };

  // User listing is derived from kind:0 events in EventStore through ProfileView.
  createEffect(() => {
    const unsubscribe = core.profileView.subscribe(syncFromProfileView);
    syncFromProfileView();

    onCleanup(unsubscribe);
  });

  return users;
};

export const useCoreEmojiSets = (
  references: () => readonly EmojiSetReference[],
) => {
  const packets = useCoreEventPacketsForQueries<EmojiSet>(() =>
    references().map((reference) => ({
      kinds: [kinds.Emojisets],
      authors: [reference.pubkey],
      tags: { d: [reference.tag] },
      limit: 1,
    })),
  );

  return createMemo<CacheDataBase<ParsedEventPacket<EmojiSet>>[]>(() =>
    references().map((reference) => {
      const data = packets().data?.find(
        (packet) =>
          packet.raw.pubkey === reference.pubkey &&
          packet.raw.tags.some(
            (tag) => tag[0] === "d" && tag[1] === reference.tag,
          ),
      );
      return {
        data,
        dataUpdatedAt: packets().dataUpdatedAt,
        isFetching: packets().isFetching,
        isInvalidated: packets().isInvalidated,
      };
    }),
  );
};
