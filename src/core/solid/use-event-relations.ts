import type { NostrEvent } from "nostr-tools";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { CacheDataBase } from "../../context/eventCache";
import {
  type ParsedEventPacket,
  parseNostrEvent,
} from "../../shared/libs/parser";
import type { NostrEventQuery, RelayUrl } from "../repository/nostr-repository";
import { useNostrCore } from "./provider";

const createCacheData = <T>(
  data?: ParsedEventPacket<T>[],
  isFetching = false,
): CacheDataBase<ParsedEventPacket<T>[]> => ({
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

export const useCoreEventRelations = <T = ReturnType<typeof parseNostrEvent>>(
  query: () => NostrEventQuery | undefined,
  relays?: () => readonly RelayUrl[] | undefined,
) => {
  const core = useNostrCore();
  const [cache, setCache] = createSignal<CacheDataBase<ParsedEventPacket<T>[]>>(
    createCacheData<T>(),
  );
  let requestVersion = 0;

  const syncFromCollection = (currentQuery: NostrEventQuery) => {
    const rows = [...core.collections.events.values()]
      .filter((row) => eventMatchesQuery(row.raw, currentQuery))
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
      .slice(0, currentQuery.limit);
    const data = rows.map((row) =>
      toParsedEventPacket<T>(row.raw, row.seenRelays[0]),
    );
    setCache({
      data,
      dataUpdatedAt:
        rows.reduce((latest, row) => Math.max(latest, row.receivedAt), 0) ||
        Date.now(),
      isFetching: false,
      isInvalidated: false,
    });
    return data;
  };

  // Keep a legacy array-shaped relation accessor synchronized with the v1 event collection
  // and issue relation filters through the core query client instead of direct rx-nostr emits.
  createEffect(() => {
    const currentQuery = query();
    const currentRelays = relays?.();
    const currentRequestVersion = ++requestVersion;
    if (!currentQuery) {
      setCache(createCacheData<T>());
      return;
    }

    const subscription = core.collections.events.subscribeChanges(
      () => {
        syncFromCollection(currentQuery);
      },
      { includeInitialState: true },
    );

    syncFromCollection(currentQuery);
    setCache((prev) => ({ ...prev, isFetching: true }));
    void core.queryClient
      .ensureEventRelations({ query: currentQuery, relays: currentRelays })
      .then((events) => {
        if (requestVersion !== currentRequestVersion) {
          return;
        }
        if (events.length > 0) {
          setCache({
            data: events.map((event) =>
              toParsedEventPacket<T>(event, currentRelays?.[0]),
            ),
            dataUpdatedAt: Date.now(),
            isFetching: false,
            isInvalidated: false,
          });
          return;
        }
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
