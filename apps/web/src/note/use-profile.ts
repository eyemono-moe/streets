import { type Profile, parseProfile } from "@streets/core/nostr/profile";
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { useReadLayer } from "../read-layer";

export const useProfile = (
  pubkey: Accessor<string>,
): Accessor<Profile | undefined> => {
  const { store, profiles } = useReadLayer();
  const [profile, setProfile] = createSignal<Profile>();

  createEffect(() => {
    // この effect では pubkey だけを追跡する。profile を読むと set のたびに再実行されて止まらない。
    const key = pubkey();
    const load = () => {
      const event = store.latestReplaceable(0, key);
      setProfile(event ? parseProfile(event.content) : undefined);
      return event !== undefined;
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

  return profile;
};
