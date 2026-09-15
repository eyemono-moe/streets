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

export const useCoreEventRelations = <T = ReturnType<typeof parseNostrEvent>>(
  query: () => NostrEventQuery | undefined,
  relays?: () => readonly RelayUrl[] | undefined,
) => {
  const core = useNostrCore();
  const [cache, setCache] = createSignal<CacheDataBase<ParsedEventPacket<T>[]>>(
    createCacheData<T>(),
  );
  let requestVersion = 0;

  const syncFromEventStore = (currentQuery: NostrEventQuery) => {
    const events = core.eventStore
      .queryEvents({
        ids: currentQuery.ids ? [...currentQuery.ids] : undefined,
        authors: currentQuery.authors ? [...currentQuery.authors] : undefined,
        kinds: currentQuery.kinds ? [...currentQuery.kinds] : undefined,
        limit: currentQuery.limit,
        ...Object.fromEntries(
          Object.entries(currentQuery.tags ?? {}).map(([name, values]) => [
            `#${name}`,
            [...values],
          ]),
        ),
      })
      .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
    const limited = currentQuery.limit
      ? events.slice(0, currentQuery.limit)
      : events;
    const data = limited.map((event) =>
      toParsedEventPacket<T>(event, core.eventStore.getSeenRelays(event.id)[0]),
    );
    setCache({
      data,
      dataUpdatedAt: Date.now(),
      isFetching: false,
      isInvalidated: false,
    });
    return data;
  };

  createEffect(() => {
    const currentQuery = query();
    const currentRelays = relays?.();
    const currentRequestVersion = ++requestVersion;
    if (!currentQuery) {
      setCache(createCacheData<T>());
      return;
    }

    const unsubscribe = core.eventStore.subscribe(() => {
      syncFromEventStore(currentQuery);
    });

    syncFromEventStore(currentQuery);
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

    onCleanup(unsubscribe);
  });

  return cache;
};
