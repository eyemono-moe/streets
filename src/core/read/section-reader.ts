import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { EventStore } from "./event-store";
import {
  MAX_ITEMS_PER_SECTION,
  type NostrSource,
  type Order,
  type SectionStatus,
} from "./source";
import type {
  SectionHandle,
  SubscriptionManager,
} from "./subscription-manager";

export type SectionReaderOptions = {
  source: NostrSource;
  order: Order;
  store: EventStore;
  /** 接続と購読は manager が所有する (ADR-0023) */
  manager: SubscriptionManager;
};

type RelayState = {
  complete: boolean;
  unreachable: boolean;
};

export class SectionReader {
  readonly #options: SectionReaderOptions;
  readonly #listeners = new Set<() => void>();
  readonly #ids = new Set<string>();
  #relays = new Map<RelayUrl, RelayState>();
  #handle: SectionHandle | null = null;
  #items: NostrEvent[] = [];
  #started = false;
  // manager.subscribe() のコールバックは同期的に発火しうる
  // (WebSocketRelayConnection はソケットが既に閉じていると subscribe() の
  // 中で同期的に onClosed する)。start() が全リレー分の状態を作り終える前に
  // #notify() が走ると、#relays に一部のリレーしか載っていない状態で
  // live.every(complete) が空配列に対する自明な真になり、settled→initial の
  // 一瞬のちらつきを observer に見せてしまう。start() の間だけ抑制する。
  #starting = false;

  constructor(options: SectionReaderOptions) {
    this.#options = options;
  }

  get items(): NostrEvent[] {
    return [...this.#items];
  }

  get status(): SectionStatus {
    const states = [...this.#relays.values()];
    const unreachableRelays = states.filter((r) => r.unreachable).length;
    const live = states.filter((r) => !r.unreachable);
    const allSettled = this.#started && live.every((r) => r.complete);

    const phase: SectionStatus["phase"] = allSettled
      ? "settled"
      : this.#items.length > 0
        ? "streaming"
        : "initial";

    const unroutableAuthors = this.#handle?.unroutableAuthors ?? 0;
    return unreachableRelays > 0 || unroutableAuthors > 0
      ? { phase, incomplete: { unreachableRelays, unroutableAuthors } }
      : { phase };
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#starting = true;

    const { source, manager } = this.#options;
    try {
      this.#handle = manager.subscribe(source.filters, source.relays, {
        onEvent: (id, relay) => this.#onEvent(id, relay),
        onRelayComplete: (relay) => {
          this.#relayState(relay).complete = true;
          this.#notify();
        },
        onRelayUnreachable: (relay) => {
          this.#relayState(relay).unreachable = true;
          this.#notify();
        },
      });

      for (const relay of this.#handle.relays) this.#relayState(relay);
    } finally {
      this.#starting = false;
    }
    // start() が確定させた最終状態を、抑制していた分まとめて 1 回だけ通知する。
    this.#notify();
  }

  /**
   * 接続が開いた直後に EOSE が来る実装もありうるため、subscribe() が返る前に
   * コールバックが発火しても取りこぼさないよう、無ければその場で作る。
   */
  #relayState(relay: RelayUrl): RelayState {
    const existing = this.#relays.get(relay);
    if (existing) return existing;
    const created: RelayState = { complete: false, unreachable: false };
    this.#relays.set(relay, created);
    return created;
  }

  stop(): void {
    this.#handle?.close();
    this.#handle = null;
    this.#relays = new Map();
    this.#started = false;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #onEvent(id: string, _relay: RelayUrl): void {
    if (this.#ids.has(id)) return;
    // 本体は EventStore が持つ。ここに載せるのは検証済みのコピー (ADR-0024)
    const stored = this.#options.store.get(id);
    if (!stored) return;

    this.#ids.add(id);
    // 上限は表示順に関わらず「新しい順」で決める。表示順でスライスすると
    // 昇順表示時に古い方から採用してしまい、上限到達後キャップが凍結してしまう。
    const mostRecent = [...this.#items, stored]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, MAX_ITEMS_PER_SECTION);
    this.#items = this.#sorted(mostRecent);

    // 上限を超えて落ちた分は id 集合からも外す
    if (this.#ids.size > this.#items.length) {
      const kept = new Set(this.#items.map((e) => e.id));
      for (const kid of this.#ids) if (!kept.has(kid)) this.#ids.delete(kid);
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
    if (this.#starting) return;
    for (const listener of this.#listeners) listener();
  }
}
