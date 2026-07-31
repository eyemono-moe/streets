import type { RelayUrl } from "../relay/relay-connection";
import { MAX_RELAYS_PER_AUTHOR } from "./default-relays";
import type { EventStore } from "./event-store";
import { parseRelayList } from "./relay-list";

const RELAY_LIST_KIND = 10002;

/**
 * 著者 → 取得先リレーの対応表。
 *
 * 表を自分で保持せず、EventStore の kind:10002 から毎回導出する (ADR-0016)。
 * 専用の永続化も TTL も持たない — 永続化は EventStore 側 (ADR-0018/0019) が
 * kind:10002 を普通のイベントとして保存すれば自動的に得られ、鮮度は
 * 置換可能イベントの created_at 後勝ちで決まる。
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
      .map((entry) => entry.url)
      .slice(0, MAX_RELAYS_PER_AUTHOR);
  }
}
