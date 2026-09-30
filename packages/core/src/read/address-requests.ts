import { type EventAddress, formatEventAddress } from "../nostr/address";
import type { RelayFilter } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventStore } from "./event-store";
import type { SubscriptionManager } from "./subscription-manager";

export type AddressRequests = {
  /** この住所の最新版を要求する（取得済みなら何もしない）。 */
  request(address: EventAddress): void;
  /** 要求済みでバッチも片付いたのに store に無い、を表す（未要求なら `false`）。 */
  isUnresolved(address: EventAddress): boolean;
  /** バッチが片付くたびに呼ぶ。どの住所かは知らせないので、読む側が store から引き直す。 */
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

export type CreateAddressRequestsOptions = {
  store: EventStore;
  manager: SubscriptionManager;
  scheduler?: Scheduler;
};

/** 引用やリンクの住所は、id の要求と同じく描画の波に合わせてまとめる。 */
export const ADDRESS_BATCH_MS = 200;

/**
 * 住所で指されたイベント（引用された記事やリストなど）の要求をまとめる。
 * id の要求と分けるのは、置換可能イベントは id では最新版に辿り着けないため。
 */
export const createAddressRequests = (
  options: CreateAddressRequestsOptions,
): AddressRequests => {
  const scheduler = options.scheduler ?? defaultScheduler;
  let pending = new Map<string, EventAddress>();
  let timer: ReturnType<Scheduler["setTimeout"]> | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const settled = new Set<string>();

  const stored = (address: EventAddress) =>
    options.store.latestReplaceable(
      address.kind,
      address.pubkey,
      address.identifier,
    );

  const flush = (): void => {
    timer = null;
    const addresses = [...pending.values()];
    pending = new Map();
    if (addresses.length === 0) return;

    // kind ごとに 1 つのフィルタへまとめる。著者と `d` の組み合わせで余分に
    // 届くものがあっても、store が住所ごとに最新版だけを残す。
    const byKind = new Map<number, { authors: Set<string>; d: Set<string> }>();
    for (const address of addresses) {
      const group = byKind.get(address.kind) ?? {
        authors: new Set(),
        d: new Set(),
      };
      group.authors.add(address.pubkey);
      group.d.add(address.identifier);
      byKind.set(address.kind, group);
    }
    const filters: RelayFilter[] = [...byKind].map(([kind, group]) => ({
      kinds: [kind],
      authors: [...group.authors],
      "#d": [...group.d],
    }));

    void options.manager.fetchOnce(filters).then(() => {
      if (disposed) return;
      for (const address of addresses) {
        options.store.markReplaceableFetched(
          address.kind,
          address.pubkey,
          address.identifier,
        );
        settled.add(formatEventAddress(address));
      }
      for (const listener of listeners) listener();
    });
  };

  return {
    request(address) {
      if (disposed) return;
      if (stored(address)) return;
      const key = formatEventAddress(address);
      settled.delete(key);
      pending.set(key, address);
      if (timer === null) {
        timer = scheduler.setTimeout(flush, ADDRESS_BATCH_MS);
      }
    },

    isUnresolved(address) {
      return settled.has(formatEventAddress(address)) && !stored(address);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      disposed = true;
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
      pending = new Map();
      listeners.clear();
    },
  };
};
