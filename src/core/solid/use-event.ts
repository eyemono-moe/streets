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

  const syncFromEventStore = (eventId: string) => {
    const event = core.eventStore.getEvent(eventId);
    if (!event) {
      setCache((prev) => ({ ...prev, data: undefined }));
      return undefined;
    }

    const data = toParsedEventPacket<T>(
      event,
      core.eventStore.getSeenRelays(event.id)[0],
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
    const eventId = id();
    if (!eventId) {
      setCache(createCacheData<T>());
      return;
    }

    const unsubscribe = core.eventStore.subscribe(() => {
      syncFromEventStore(eventId);
    });

    if (!syncFromEventStore(eventId)) {
      setCache((prev) => ({ ...prev, isFetching: true }));
      void core.queryClient
        .ensureEvent({ id: eventId, relays: relays?.() })
        .then((event) => {
          if (id() !== eventId) {
            return;
          }
          if (event) {
            syncFromEventStore(eventId);
            return;
          }
          setCache((prev) => ({ ...prev, isFetching: false }));
        })
        .catch(() => {
          setCache((prev) => ({ ...prev, isFetching: false }));
        });
    }

    onCleanup(unsubscribe);
  });

  return cache;
};
