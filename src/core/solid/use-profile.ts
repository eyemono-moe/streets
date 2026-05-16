import { type NostrEvent, kinds } from "nostr-tools";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { CacheDataBase } from "../../context/eventCache";
import {
  type ParsedEventPacket,
  parseNostrEvent,
} from "../../shared/libs/parser";
import type { Metadata } from "../../shared/libs/parser/0_metadata";
import type { NostrProfileRow } from "../db/types";
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

  const syncFromCollection = (profilePubkey: string) => {
    const row = core.collections.profiles.get(profilePubkey);
    if (!row) {
      setCache((prev) => ({ ...prev, data: undefined }));
      return undefined;
    }

    const data = toParsedProfilePacket<T>(
      profileRowToEvent(row),
      row.seenRelays[0],
    );
    setCache({
      data,
      dataUpdatedAt: row.receivedAt,
      isFetching: false,
      isInvalidated: false,
    });
    return data;
  };

  // Keep the legacy cache-shaped accessor synchronized with the v1 profile collection
  // and issue a profile metadata query through the core query client when missing.
  createEffect(() => {
    const profilePubkey = pubkey();
    if (!profilePubkey) {
      setCache(createCacheData<T>());
      return;
    }

    const subscription = core.collections.profiles.subscribeChanges(
      () => {
        syncFromCollection(profilePubkey);
      },
      { includeInitialState: true },
    );

    if (!syncFromCollection(profilePubkey)) {
      setCache((prev) => ({ ...prev, isFetching: true }));
      void core.queryClient
        .ensureProfile({ pubkey: profilePubkey, relays: relays?.() })
        .then((event) => {
          if (pubkey() !== profilePubkey) {
            return;
          }
          if (event) {
            setCache({
              data: toParsedProfilePacket<T>(event, relays?.()?.[0]),
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
