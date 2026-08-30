import type { RelayListEntry } from "../read/relay-list";

/**
 * アクティブアカウントの NIP-65 リレーリスト。
 *
 * `loading` と `missing` を空配列へ潰さない。通知カラムでは前者が
 * 「まだ外部へ接続しない」、後者が「fallback で待つ」という別の動作に
 * なるため、件数だけでは正しく分岐できない。
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
