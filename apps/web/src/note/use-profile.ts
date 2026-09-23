import { type Profile, parseProfile } from "@streets/core/nostr/profile";
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { useReadLayer } from "../read-layer";

export type ProfileDetails = {
  profile: Profile | undefined;
  tags: readonly string[][];
  /** kind:0 の content そのもの。読む側が扱う項目（Zap の送り先など）を取り出すため。 */
  content: string;
};

/** kind:0 を一度だけ読み、解析したプロフィールと NIP-30 の emoji タグを返す。 */
export const useProfileDetails = (
  pubkey: Accessor<string | undefined>,
): Accessor<ProfileDetails | undefined> => {
  const { store, profiles } = useReadLayer();
  const [details, setDetails] = createSignal<ProfileDetails>();

  createEffect(() => {
    // この effect では pubkey だけを追跡する。details を読むと set のたびに再実行されて止まらない。
    const key = pubkey();
    if (key === undefined) {
      setDetails(undefined);
      return;
    }
    const load = () => {
      const latest = store.latestReplaceable(0, key);
      setDetails(
        latest
          ? {
              profile: parseProfile(latest.content),
              tags: latest.tags,
              content: latest.content,
            }
          : undefined,
      );
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

  return details;
};

/** `pubkey` が undefined の間は何も取りに行かない（人に紐づかないカラムの題名など）。 */
export const useProfile = (
  pubkey: Accessor<string | undefined>,
): Accessor<Profile | undefined> => {
  const details = useProfileDetails(pubkey);
  return createMemo(() => details()?.profile);
};
