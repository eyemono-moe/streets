import type { ReadRouting } from "../read/read-routing";
import type { RelayUrl } from "../relay/relay-connection";
import type { RelayListState } from "./relay-list-state";

/**
 * 投稿を読むリレーの決め方。端末ごとの設定 —— ローカルリレーや一時的な
 * 障害のように、効くかどうかがその端末の繋がり方で決まるため。
 */
export type ReadRoutingMode = ReadRouting["mode"];

export const READ_ROUTING_STORAGE_KEY = "streets.v1.readRouting";

/** 未保存・読めない値は Outbox。 */
export const loadReadRoutingMode = (raw: string | null): ReadRoutingMode =>
  raw === "direct" ? "direct" : "outbox";

export const saveReadRoutingMode = (mode: ReadRoutingMode): string => mode;

/**
 * `direct` で読むリレー。自分の読み込みリレーが無ければ fallback を読む。
 * 一覧を取りに行っている間は 0 本で待つ —— fallback へ一瞬繋いでから
 * 張り直すことになるため。
 */
export const readRoutingFor = (
  mode: ReadRoutingMode,
  relayList: RelayListState,
  fallback: readonly RelayUrl[],
): ReadRouting => {
  if (mode === "outbox") return { mode: "outbox" };
  if (relayList.phase === "signed-out" || relayList.phase === "loading") {
    return { mode: "direct", relays: [] };
  }
  const read =
    relayList.phase === "ready"
      ? relayList.entries
          .filter((entry) => entry.read)
          .map((entry) => entry.url)
      : [];
  return { mode: "direct", relays: read.length > 0 ? read : [...fallback] };
};
