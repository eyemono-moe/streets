import type { NostrEvent } from "nostr-tools";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { CacheDataBase } from "../../context/eventCache";
import {
  type ParsedEventPacket,
  parseNostrEvent,
} from "../../shared/libs/parser";
import type { RelayUrl } from "../repository/nostr-repository";
import { useNostrCore } from "./provider";

const createCacheData = <T>(
  data?: ParsedEventPacket<T>,
  isFetching = false,
): CacheDataBase<ParsedEventPacket<T>> => ({
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

export const useCoreEventByID = <T = ReturnType<typeof parseNostrEvent>>(
  id: () => string | undefined,
  relays?: () => readonly RelayUrl[] | undefined,
) => {
  const core = useNostrCore();
  const [cache, setCache] = createSignal<CacheDataBase<ParsedEventPacket<T>>>(
    createCacheData<T>(),
  );

  const syncFromCollection = (eventId: string) => {
    const row = core.collections.events.get(eventId);
    if (!row) {
      setCache((prev) => ({ ...prev, data: undefined }));
      return undefined;
    }

    const data = toParsedEventPacket<T>(row.raw, row.seenRelays[0]);
    setCache({
      data,
      dataUpdatedAt: row.receivedAt,
      isFetching: false,
      isInvalidated: false,
    });
    return data;
  };

  // Keep the legacy cache-shaped accessor synchronized with the v1 event collection
  // and issue an id query through the core query client when the event is missing.
  createEffect(() => {
    const eventId = id();
    if (!eventId) {
      setCache(createCacheData<T>());
      return;
    }

    const subscription = core.collections.events.subscribeChanges(
      () => {
        syncFromCollection(eventId);
      },
      { includeInitialState: true },
    );

    if (!syncFromCollection(eventId)) {
      setCache((prev) => ({ ...prev, isFetching: true }));
      void core.queryClient
        .ensureEvent({ id: eventId, relays: relays?.() })
        .then((event) => {
          if (id() !== eventId) {
            return;
          }
          if (event) {
            setCache({
              data: toParsedEventPacket<T>(event, relays?.()?.[0]),
              dataUpdatedAt: Date.now(),
              isFetching: false,
              isInvalidated: false,
            });
            return;
          }
          setCache((prev) => ({ ...prev, isFetching: false }));
        })
        .catch(() => {
          setCache((prev) => ({ ...prev, isFetching: false }));
        });
    }

    onCleanup(() => {
      subscription.unsubscribe();
    });
  });

  return cache;
};
