import type { RelayUrl } from "./relay-connection";
import { type RelayInfo, fetchRelayInfo } from "./relay-info";

/**
 * リレーごとの同時購読の上限（NIP-11 の `max_subscriptions`）を引く関数を作る。
 * 初めて引かれた URL について NIP-11 を一度だけ取りに行き、取れるまでと、書いて
 * いないリレー・答えないリレーは `undefined`（枠なし）を返す。
 */
export const createSubscriptionLimits = (
  fetcher: (url: RelayUrl) => Promise<RelayInfo | undefined> = fetchRelayInfo,
): ((url: RelayUrl) => number | undefined) => {
  const limits = new Map<RelayUrl, number | undefined>();
  return (url) => {
    if (!limits.has(url)) {
      limits.set(url, undefined);
      void fetcher(url).then((info) =>
        limits.set(url, info?.limitation?.maxSubscriptions),
      );
    }
    return limits.get(url);
  };
};
