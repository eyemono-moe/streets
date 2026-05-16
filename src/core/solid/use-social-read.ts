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
import { projectRepositoryEvent } from "../db/projectors/project-event";
import type { NostrEventRow, NostrProfileRow } from "../db/types";
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

const profileRowToEvent = (row: NostrProfileRow): NostrEvent => ({
  id: row.sourceEventId,
  pubkey: row.pubkey,
  kind: kinds.Metadata,
  content: JSON.stringify({
    name: row.name,
    display_name: row.displayName,
    about: row.about,
    picture: row.picture,
    nip05: row.nip05,
    lud16: row.lud16,
  }),
  tags: [],
  created_at: row.updatedAt,
  sig: "",
});

const eventMatchesQuery = (event: NostrEvent, query: NostrEventQuery) => {
  if (query.ids && !query.ids.includes(event.id)) {
    return false;
  }
  if (query.authors && !query.authors.includes(event.pubkey)) {
    return false;
  }
  if (query.kinds && !query.kinds.includes(event.kind)) {
    return false;
  }
  if (query.tags) {
    for (const [name, values] of Object.entries(query.tags)) {
      const hasTagValue = event.tags.some(
        (tag) =>
          tag[0] === name && tag[1] !== undefined && values.includes(tag[1]),
      );
      if (!hasTagValue) {
        return false;
      }
    }
  }
  return true;
};

const rowsForQuery = (
  events: ReturnType<
    ReturnType<typeof useNostrCore>["collections"]["events"]["values"]
  >,
  query: NostrEventQuery,
) => {
  const rows = [...events]
    .filter((candidate) => eventMatchesQuery(candidate.raw, query))
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  return query.limit ? rows.slice(0, query.limit) : rows;
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

  const syncFromCollection = (currentQueries: readonly NostrEventQuery[]) => {
    const rowById = new Map(
      currentQueries
        .flatMap((currentQuery) =>
          rowsForQuery(core.collections.events.values(), currentQuery),
        )
        .map((row) => [row.id, row]),
    );
    const rows = [...rowById.values()].sort(
      (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
    );
    const data = rows.map((row) =>
      toParsedEventPacket<T>(row.raw, row.seenRelays[0]),
    );

    setCache({
      data: data.length > 0 ? data : undefined,
      dataUpdatedAt:
        rows.reduce((latest, row) => Math.max(latest, row.receivedAt), 0) ||
        Date.now(),
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

    const subscription = core.collections.events.subscribeChanges(
      () => {
        syncFromCollection(currentQueries);
      },
      { includeInitialState: true },
    );

    syncFromCollection(currentQueries);
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
        await Promise.all(
          eventGroups.flat().map(async (event) => {
            await projectRepositoryEvent(core.collections, event, {
              receivedAt: Date.now(),
              seenRelays: await core.repository.getSeenRelays(event.id),
            });
          }),
        );
        if (requestVersion !== currentRequestVersion) {
          return;
        }
        syncFromCollection(currentQueries);
        setCache((prev) => ({ ...prev, isFetching: false }));
      })
      .catch(() => {
        if (requestVersion === currentRequestVersion) {
          setCache((prev) => ({ ...prev, isFetching: false }));
        }
      });

    onCleanup(() => {
      subscription.unsubscribe();
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
    const latestContactRowByAuthor = new Map<string, NostrEventRow>();
    for (const row of core.collections.events.values()) {
      if (row.kind !== kinds.Contacts) {
        continue;
      }
      const current = latestContactRowByAuthor.get(row.pubkey);
      if (
        !current ||
        row.createdAt > current.createdAt ||
        (row.createdAt === current.createdAt &&
          row.id.localeCompare(current.id) > 0)
      ) {
        latestContactRowByAuthor.set(row.pubkey, row);
      }
    }
    const followers = _pubkey
      ? [...latestContactRowByAuthor.values()]
          .filter((row) =>
            row.raw.tags.some((tag) => tag[0] === "p" && tag[1] === _pubkey),
          )
          .map((row) => row.pubkey)
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

  const syncFromCollection = () => {
    setUsers(
      [...core.collections.profiles.values()]
        .sort(
          (a, b) =>
            b.receivedAt - a.receivedAt || b.pubkey.localeCompare(a.pubkey),
        )
        .map((row) => {
          const raw =
            core.collections.events.get(row.sourceEventId)?.raw ??
            profileRowToEvent(row);
          return {
            data: toParsedEventPacket<Metadata>(raw, row.seenRelays[0]),
            dataUpdatedAt: row.receivedAt,
            isFetching: false,
            isInvalidated: false,
          };
        }),
    );
  };

  // Keep the legacy user-list accessor backed by v1 profile projections instead of
  // scanning the removed legacy event-cache store.
  createEffect(() => {
    const subscription = core.collections.profiles.subscribeChanges(
      syncFromCollection,
      { includeInitialState: true },
    );
    syncFromCollection();

    onCleanup(() => {
      subscription.unsubscribe();
    });
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
