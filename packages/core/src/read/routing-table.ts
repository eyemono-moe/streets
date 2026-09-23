import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { EventStore } from "./event-store";
import { parseRelayList } from "./relay-list";

const RELAY_LIST_KIND = 10002;

type Routes = { read: readonly RelayUrl[]; write: readonly RelayUrl[] };

/**
 * 著者 → 取得先リレーの対応表。EventStore の kind:10002 から毎回導出し、
 * 永続化・鮮度も EventStore 側 (保存/created_at) に委ねる。
 */
export class RoutingTable {
  readonly #store: EventStore;
  // 購読の組み直しのたびに著者の数だけ引かれるので、解釈の結果だけを導出元の
  // イベントに結び付けて残す。版が変われば別のイベントになり、ストアから
  // 消えれば一緒に消えるので、鮮度は EventStore が持つままになる。
  readonly #parsed = new WeakMap<NostrEvent, Routes>();

  constructor(store: EventStore) {
    this.#store = store;
  }

  /** その著者のイベントを取りに行くべきリレー */
  writeRelaysFor(pubkey: string): readonly RelayUrl[] {
    return this.#routesFor(pubkey)?.write ?? [];
  }

  /** その著者宛のイベントを送るべきリレー */
  readRelaysFor(pubkey: string): readonly RelayUrl[] {
    return this.#routesFor(pubkey)?.read ?? [];
  }

  #routesFor(pubkey: string): Routes | undefined {
    const event = this.#store.latestReplaceable(RELAY_LIST_KIND, pubkey);
    if (!event) return undefined;
    const cached = this.#parsed.get(event);
    if (cached) return cached;
    const entries = parseRelayList(event);
    const routes: Routes = {
      read: entries.filter((entry) => entry.read).map((entry) => entry.url),
      write: entries.filter((entry) => entry.write).map((entry) => entry.url),
    };
    this.#parsed.set(event, routes);
    return routes;
  }
}
