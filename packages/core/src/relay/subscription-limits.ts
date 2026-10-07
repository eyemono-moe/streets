import type { RelayUrl } from "./relay-connection";
import { type RelayInfo, fetchRelayInfo } from "./relay-info";

/**
 * リレーごとの同時購読の上限（NIP-11 の `max_subscriptions`）を引く関数を作る。
 * 初めて引かれた URL について NIP-11 を一度だけ取りに行く。返すのは、書いてあれば
 * その数、NIP-11 は取れたが上限が書いていなければ `null`（枠なし）、取れるまでと
 * 取れなかったリレーは `undefined`（呼ぶ側が既定の枠を使う）。
 */
export const createSubscriptionLimits = (
  fetcher: (url: RelayUrl) => Promise<RelayInfo | undefined> = fetchRelayInfo,
): ((url: RelayUrl) => number | null | undefined) => {
  const limits = new Map<RelayUrl, number | null | undefined>();
  return (url) => {
    if (!limits.has(url)) {
      limits.set(url, undefined);
      void fetcher(url).then((info) => {
        if (info) limits.set(url, info.limitation?.maxSubscriptions ?? null);
      });
    }
    return limits.get(url);
  };
};
