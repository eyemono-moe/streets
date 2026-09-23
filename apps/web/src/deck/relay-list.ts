import type { EventStore } from "@streets/core/read/event-store";
import { parseRelayList } from "@streets/core/read/relay-list";
import type { RelayListState } from "@streets/core/settings/relay-list-state";

const RELAY_LIST_KIND = 10002;

/**
 * 自分の NIP-65 リレーリストの状態。取得中と「無い」を潰さない ——
 * 通知カラムは前者で待ち、後者では既定のリレーへ落ちる。
 */
export const relayListState = (
  store: Pick<EventStore, "latestReplaceable">,
  viewer: string,
  settled: boolean,
): RelayListState => {
  const event = store.latestReplaceable(RELAY_LIST_KIND, viewer);
  if (event) return { phase: "ready", entries: parseRelayList(event) };
  return settled ? { phase: "missing" } : { phase: "loading" };
};
