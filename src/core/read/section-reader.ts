import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelaySubscription,
  RelayUrl,
} from "../relay/relay-connection";
import type { EventStore } from "./event-store";
import {
  MAX_ITEMS_PER_SECTION,
  type NostrSource,
  type Order,
  type SectionStatus,
} from "./source";

export type SectionReaderOptions = {
  source: NostrSource;
  order: Order;
  store: EventStore;
  openRelay: (url: RelayUrl) => RelayConnection;
};

type RelayState = {
  url: RelayUrl;
  subscription: RelaySubscription | null;
  eose: boolean;
  unreachable: boolean;
};

export class SectionReader {
  readonly #options: SectionReaderOptions;
  readonly #listeners = new Set<() => void>();
  readonly #ids = new Set<string>();
  #relays: RelayState[] = [];
  #items: NostrEvent[] = [];
  #started = false;

  constructor(options: SectionReaderOptions) {
    this.#options = options;
  }

  get items(): NostrEvent[] {
    return this.#items;
  }

  get status(): SectionStatus {
    const unreachableRelays = this.#relays.filter((r) => r.unreachable).length;
    const live = this.#relays.filter((r) => !r.unreachable);
    const allSettled = live.length > 0 && live.every((r) => r.eose);

    const phase: SectionStatus["phase"] = allSettled
      ? "settled"
      : this.#items.length > 0
        ? "streaming"
        : "initial";

    // unroutableAuthors は Outbox ルーティングを入れる計画で埋まる (ADR-0016)
    return unreachableRelays > 0
      ? { phase, incomplete: { unreachableRelays, unroutableAuthors: 0 } }
      : { phase };
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;

    for (const url of this.#options.source.relays ?? []) {
      const state: RelayState = {
        url,
        eose: false,
        unreachable: false,
        subscription: null,
      };
      this.#relays.push(state);

      const connection = this.#options.openRelay(url);
      state.subscription = connection.subscribe(this.#options.source.filters, {
        onEvent: (event) => this.#onEvent(event, url),
        onEose: () => {
          state.eose = true;
          this.#notify();
        },
        onClosed: () => {
          state.unreachable = true;
          this.#notify();
        },
      });
    }
  }

  stop(): void {
    for (const relay of this.#relays) relay.subscription?.close();
    this.#relays = [];
    this.#started = false;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #onEvent(event: NostrEvent, relay: RelayUrl): void {
    if (this.#options.store.put(event, relay) !== "inserted") return;
    if (this.#ids.has(event.id)) return;

    this.#ids.add(event.id);
    this.#items = this.#sorted([...this.#items, event]).slice(
      0,
      MAX_ITEMS_PER_SECTION,
    );

    // 上限を超えて落ちた分は id 集合からも外す
    if (this.#ids.size > this.#items.length) {
      const kept = new Set(this.#items.map((e) => e.id));
      for (const id of this.#ids) if (!kept.has(id)) this.#ids.delete(id);
    }

    this.#notify();
  }

  #sorted(events: NostrEvent[]): NostrEvent[] {
    // "thread-tree" はスレッドカラムの計画で足す。それまでは降順で扱う。
    const ascending = this.#options.order === "created-at-asc";
    return [...events].sort((a, b) =>
      ascending ? a.created_at - b.created_at : b.created_at - a.created_at,
    );
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
