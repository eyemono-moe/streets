import type { RelayListEntry } from "../read/relay-list";

/**
 * アクティブアカウントの NIP-65 リレーリスト。`loading`/`missing` を空配列に
 * 潰さない —— 通知カラムでは前者「まだ接続しない」、後者「fallback で待つ」で動作が違う。
 */
export type RelayListState =
  | { phase: "signed-out" }
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "ready"; entries: readonly RelayListEntry[] };

export const readRelayCount = (state: RelayListState): number =>
  state.phase === "ready"
    ? state.entries.filter((entry) => entry.read).length
    : 0;
