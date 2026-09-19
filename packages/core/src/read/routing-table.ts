import type { RelayUrl } from "../relay/relay-connection";
import type { EventStore } from "./event-store";
import { parseRelayList } from "./relay-list";

const RELAY_LIST_KIND = 10002;

/**
 * 著者 → 取得先リレーの対応表。EventStore の kind:10002 から毎回導出し、
 * 永続化・鮮度も EventStore 側 (保存/created_at) に委ねる。
 */
export class RoutingTable {
  readonly #store: EventStore;

  constructor(store: EventStore) {
    this.#store = store;
  }

  /** その著者のイベントを取りに行くべきリレー */
  writeRelaysFor(pubkey: string): RelayUrl[] {
    return this.#relaysFor(pubkey, "write");
  }

  /** その著者宛のイベントを送るべきリレー */
  readRelaysFor(pubkey: string): RelayUrl[] {
    return this.#relaysFor(pubkey, "read");
  }

  #relaysFor(pubkey: string, direction: "read" | "write"): RelayUrl[] {
    const event = this.#store.latestReplaceable(RELAY_LIST_KIND, pubkey);
    if (!event) return [];
    return parseRelayList(event)
      .filter((entry) => entry[direction])
      .map((entry) => entry.url);
  }
}
