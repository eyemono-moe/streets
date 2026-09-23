import type { RelayUrl } from "../relay/relay-connection";

export type RelayProgress = {
  relay: RelayUrl;
  state: "pending" | "accepted" | "rejected";
  /** 断られた理由。`rejected` のときだけ。 */
  reason?: string;
};

/**
 * 1 回の書き込みがどこまで進んだか。`checking` は置換の前に最新の版を確かめて
 * いる間（`replace` だけ）、`signing` は署名を待つ間、`sending` はリレーへ送って
 * いる間で、リレーごとの結果が届くたびに更新される。
 */
export type WriteProgress =
  | { phase: "checking" }
  | { phase: "signing" }
  | { phase: "sending"; relays: RelayProgress[] };

export const pendingRelays = (relays: readonly RelayUrl[]): RelayProgress[] =>
  relays.map((relay) => ({ relay, state: "pending" }));

/** 1 本の結果を当てる。元の配列は書き換えない（受け取った側が持ち続ける）。 */
export const settleRelay = (
  relays: readonly RelayProgress[],
  relay: RelayUrl,
  outcome: { accepted: true } | { accepted: false; reason: string },
): RelayProgress[] =>
  relays.map((entry) =>
    entry.relay !== relay
      ? entry
      : outcome.accepted
        ? { relay, state: "accepted" }
        : { relay, state: "rejected", reason: outcome.reason },
  );

export type ProgressSummary = {
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
  /** 1 本でも受け取った。自分の書いたものは、もうどこかに残っている。 */
  saved: boolean;
  /** 全部の結果が出た。 */
  finished: boolean;
};

export const summarizeRelays = (
  relays: readonly RelayProgress[],
): ProgressSummary => {
  const accepted = relays.filter((entry) => entry.state === "accepted").length;
  const rejected = relays.filter((entry) => entry.state === "rejected").length;
  const pending = relays.length - accepted - rejected;
  return {
    total: relays.length,
    accepted,
    rejected,
    pending,
    saved: accepted > 0,
    finished: pending === 0,
  };
};
