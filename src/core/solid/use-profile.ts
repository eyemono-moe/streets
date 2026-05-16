import { type NostrEvent, kinds } from "nostr-tools";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { CacheDataBase } from "../../context/eventCache";
import {
  type ParsedEventPacket,
  parseNostrEvent,
} from "../../shared/libs/parser";
import type { Metadata } from "../../shared/libs/parser/0_metadata";
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

const toParsedProfilePacket = <T>(
  event: NostrEvent,
  relay?: RelayUrl,
): ParsedEventPacket<T> => ({
  from: relay ?? "",
  raw: event,
  parsed: parseNostrEvent(event) as T,
});

export const useCoreProfile = <T = Metadata>(
  pubkey: () => string | undefined,
  relays?: () => readonly RelayUrl[] | undefined,
) => {
  const core = useNostrCore();
  const [cache, setCache] = createSignal<CacheDataBase<ParsedEventPacket<T>>>(
    createCacheData<T>(),
  );

  const syncFromProfileView = (profilePubkey: string) => {
    const event = core.profileView.getProfile(profilePubkey);
    if (!event) {
      setCache((prev) => ({ ...prev, data: undefined }));
      return undefined;
    }

    const data = toParsedProfilePacket<T>(
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

  // Keep the cache-shaped Solid accessor synchronized with ProfileView, which derives
  // metadata from raw kind:0 events in EventStore instead of a profile collection.
  createEffect(() => {
    const profilePubkey = pubkey();
    if (!profilePubkey) {
      setCache(createCacheData<T>());
      return;
    }

    const unsubscribe = core.profileView.subscribe(() => {
      syncFromProfileView(profilePubkey);
    });

    if (!syncFromProfileView(profilePubkey)) {
      setCache((prev) => ({ ...prev, isFetching: true }));
      void core.queryClient
        .ensureProfile({ pubkey: profilePubkey, relays: relays?.() })
        .then((event) => {
          if (pubkey() !== profilePubkey) {
            return;
          }
          if (event?.kind === kinds.Metadata) {
            syncFromProfileView(profilePubkey);
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
