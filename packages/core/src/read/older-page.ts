import type { RelayUrl } from "../relay/relay-connection";
import type { RelaySettle } from "./collect";

/** 古い投稿を 1 ページ取り足したときの、リレー 1 本の返事。 */
export type OlderPageRelay = {
  url: RelayUrl;
  reason: RelaySettle["reason"];
  /** 受け取った件数。すでに持っていたものも数える。 */
  received: number;
  /** 受け取ったうち、いちばん古い `created_at`。1 件も無ければ無い。 */
  oldest?: number;
};

export type OlderPage = { relays: OlderPageRelay[] };

export type NextOlder =
  | { paging: "idle"; until: number }
  | { paging: "exhausted" }
  | { paging: "failed" };

/**
 * 次に取る `until` を、リレーごとの返事から決める。
 *
 * リレーは `until` 以下を新しい順に返すので、返したリレーはそれぞれ「自分の最古から
 * `until` まで」を渡し終えている。どのリレーについても取りこぼしが無いのは、その最古の
 * うちいちばん新しい時刻まで。一覧の最古をそのまま使うと、`limit` より少なく返した
 * リレーの区間を、ほかのリレーの古い 1 件で飛び越える（NIP-01 は少ない返事を認めている）。
 * 窓から押し出した分があるので、一覧の最古（`keptOldest`）より古くはしない。
 *
 * EOSE は「保存しているものを送り終えた」合図で、0 件の EOSE だけが「これより前は無い」と
 * 言える。CLOSED・予算切れ・時間切れは何も言っていないので、末尾とみなさず失敗にする。
 */
export const nextOlder = (
  page: OlderPage,
  request: { until: number; limit: number },
  keptOldest: number,
): NextOlder => {
  const { relays } = page;
  const allEose =
    relays.length > 0 && relays.every((relay) => relay.reason === "eose");
  const answered = relays.filter(
    (relay): relay is OlderPageRelay & { oldest: number } =>
      relay.oldest !== undefined,
  );
  if (answered.length === 0) {
    return allEose ? { paging: "exhausted" } : { paging: "failed" };
  }
  const covered = Math.max(keptOldest, ...answered.map((r) => r.oldest));
  const until = Math.min(covered, request.until);
  if (until < request.until) return { paging: "idle", until };
  // どのリレーも `until` と同じ秒のものしか返さなかった。1 ページぶん返したリレーは
  // その秒にまだ持っているかもしれないが、秒より細かく指せないので次の秒へ進む。
  if (answered.some((relay) => relay.received >= request.limit)) {
    return { paging: "idle", until: request.until - 1 };
  }
  return allEose ? { paging: "exhausted" } : { paging: "failed" };
};
