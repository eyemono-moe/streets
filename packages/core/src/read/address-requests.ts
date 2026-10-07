import { type EventAddress, formatEventAddress } from "../nostr/address";
import { createBatchedLookup } from "./batched-lookup";
import { isStale, policyFor } from "./cache-policy";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventStore } from "./event-store";
import type { SubscriptionManager } from "./subscription-manager";

export type AddressRequests = {
  /**
   * この住所の最新版を要求する。取ってから古くなっていなければ何もしない
   * （古さは kind ごとの方針で決める。既定では一度取れば取り直さない）。
   * `refresh` なら古さに関係なく取り直す。
   */
  request(address: EventAddress, options?: RequestOptions): void;
  /** 要求済みでバッチも片付いたのに store に無い、を表す（未要求なら `false`）。 */
  isUnresolved(address: EventAddress): boolean;
  /** バッチが片付くたびに呼ぶ。どの住所かは知らせないので、読む側が store から引き直す。 */
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

export type RequestOptions = { refresh?: boolean };

const HEX_64 = /^[0-9a-f]{64}$/;

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
  const settled = new Set<string>();
  const lookup = createBatchedLookup<EventAddress>({
    manager: options.manager,
    scheduler,
    windowMs: ADDRESS_BATCH_MS,
    keyOf: formatEventAddress,
    plan: (addresses) => {
      // kind ごとに 1 つのフィルタへまとめる。著者と `d` の組み合わせで余分に
      // 届くものがあっても、store が住所ごとに最新版だけを残す。
      const byKind = new Map<
        number,
        { authors: Set<string>; d: Set<string> }
      >();
      for (const address of addresses) {
        const group = byKind.get(address.kind) ?? {
          authors: new Set(),
          d: new Set(),
        };
        group.authors.add(address.pubkey);
        group.d.add(address.identifier);
        byKind.set(address.kind, group);
      }
      return {
        filters: [...byKind].map(([kind, group]) => ({
          kinds: [kind],
          authors: [...group.authors],
          "#d": [...group.d],
        })),
      };
    },
    onFetched: (addresses) => {
      for (const address of addresses) {
        options.store.markReplaceableFetched(
          address.kind,
          address.pubkey,
          address.identifier,
        );
        settled.add(formatEventAddress(address));
      }
    },
  });

  const stored = (address: EventAddress) =>
    options.store.latestReplaceable(
      address.kind,
      address.pubkey,
      address.identifier,
    );

  return {
    request(address, requestOptions) {
      if (lookup.disposed) return;
      const key = formatEventAddress(address);
      // 公開鍵でない値を著者に入れると、リレーは同じ束の REQ ごと断る。
      // 束ねたほかの住所まで取れなくなるので、問い合わせずに無かったことにする。
      if (!HEX_64.test(address.pubkey)) {
        settled.add(key);
        return;
      }
      // 取ってから古くなっていなければ取り直さない。無かったものも、取った時刻を
      // 残してあるので、画面に出し直すたびに問い合わせることはない。
      const fetchedAt = options.store.replaceableFetchedAt(
        address.kind,
        address.pubkey,
        address.identifier,
      );
      if (
        !requestOptions?.refresh &&
        fetchedAt !== undefined &&
        !isStale(policyFor(address.kind), fetchedAt, scheduler.now())
      ) {
        settled.add(key);
        return;
      }
      // 取りにいっている最中なら重ねない。
      if (lookup.isInflight(key)) return;
      settled.delete(key);
      lookup.enqueue(address);
    },

    isUnresolved(address) {
      return settled.has(formatEventAddress(address)) && !stored(address);
    },

    subscribe: lookup.subscribe,
    dispose: lookup.dispose,
  };
};
