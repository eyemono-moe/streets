import type { Profile } from "@streets/core/nostr/profile";
import type { ProfileDetails } from "@streets/core/read/lookups";
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { useReadLayer } from "../read-layer";

/** kind:0 を読み、解析したプロフィールと NIP-30 の emoji タグを返す。 */
export const useProfileDetails = (
  pubkey: Accessor<string | undefined>,
): Accessor<ProfileDetails | undefined> => {
  const { lookups } = useReadLayer();
  const [details, setDetails] = createSignal<ProfileDetails>();

  createEffect(() => {
    // この effect では pubkey だけを追跡する。details を読むと set のたびに再実行されて止まらない。
    const key = pubkey();
    if (key === undefined) {
      setDetails(undefined);
      return;
    }
    onCleanup(lookups.watchProfile(key, setDetails));
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
