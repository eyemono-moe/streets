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

/**
 * 多くの人について、bot と名乗っているかを引く（まだ分からなければ
 * undefined）。並びをふるう関数の中から呼べるよう、初めて引いた人をその場で
 * 見張り始め、呼んだ部品が消えるまで見張り続ける。
 */
export const useBotLookup = (): ((pubkey: string) => boolean | undefined) => {
  const { lookups } = useReadLayer();
  const known = new Map<string, boolean | undefined>();
  const stops: (() => void)[] = [];
  const [version, bump] = createSignal(0);
  onCleanup(() => {
    for (const stop of stops) stop();
  });

  return (pubkey) => {
    version();
    if (!known.has(pubkey)) {
      known.set(pubkey, undefined);
      // 見張り始めた瞬間の知らせは、いま読んでいる計算の中で返す。ここで
      // bump すると、読んでいる計算を自分で作り直させてしまう。
      let starting = true;
      stops.push(
        lookups.watchBot(pubkey, (bot) => {
          if (known.get(pubkey) === bot) return;
          known.set(pubkey, bot);
          if (!starting) bump((count) => count + 1);
        }),
      );
      starting = false;
    }
    return known.get(pubkey);
  };
};
