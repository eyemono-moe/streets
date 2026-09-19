import type { NostrEvent } from "@streets/core/nostr/event";
import { type Profile, parseProfile } from "@streets/core/nostr/profile";
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { useReadLayer } from "../read-layer";

/** kind:0 をタグごと読む。表示名だけでなく NIP-30 の emoji タグを使う場所向け。 */
export const useProfileEvent = (
  pubkey: Accessor<string | undefined>,
): Accessor<NostrEvent | undefined> => {
  const { store, profiles } = useReadLayer();
  const [event, setEvent] = createSignal<NostrEvent>();

  createEffect(() => {
    // この effect では pubkey だけを追跡する。event を読むと set のたびに再実行されて止まらない。
    const key = pubkey();
    if (key === undefined) {
      setEvent(undefined);
      return;
    }
    const load = () => {
      const latest = store.latestReplaceable(0, key);
      setEvent(latest);
      return latest !== undefined;
    };

    onCleanup(
      store.onReplaceableChanged((change) => {
        if (change.kind === 0 && change.pubkey === key) load();
      }),
    );
    if (load()) return;

    profiles.request(key);
    const unsubscribe = profiles.subscribe(() => {
      if (load()) unsubscribe();
    });
    onCleanup(unsubscribe);
  });

  return event;
};

/** `pubkey` が undefined の間は何も取りに行かない（人に紐づかないカラムの題名など）。 */
export const useProfile = (
  pubkey: Accessor<string | undefined>,
): Accessor<Profile | undefined> => {
  const event = useProfileEvent(pubkey);
  return createMemo(() => {
    const current = event();
    return current ? parseProfile(current.content) : undefined;
  });
};
