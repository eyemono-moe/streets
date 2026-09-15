import type { NostrEvent } from "../nostr/event";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import type { ConnectionPool, PooledSubscription } from "./connection-pool";
import type { EventStore } from "./event-store";
import { matchesAnyFilter } from "./filter-match";

export type CollectOptions = {
  /**
   * 予算チェックを丸ごと迂回する `bootstrap.ts` 専用フラグ。インデクサは
   * ルーティング表そのものを作る処理なので、予算に阻まれると循環する。
   */
  reserved?: boolean;
  /**
   * 捨てたイベントを URL 単位で都度通知する。戻り値の合計とは呼び出し元
   * ごとに欲しい粒度が違うため、別経路にしている。
   */
  onUnrequested?: (url: RelayUrl) => void;
  /**
   * URL 1 本が片付くたびに経過 ms と片付き方を添えて呼ばれる。所要時間は
   * 最も遅い 1 本で決まるため、合計値だけでは遅いリレーを特定できない。
   */
  onRelaySettled?: (settle: RelaySettle) => void;
};

export type RelaySettle = {
  url: RelayUrl;
  ms: number;
  /**
   * `rejected` は予算切れで購読そのものが張れなかった場合、`timeout` は
   * `timeoutMs` までに EOSE も CLOSED も返さなかった場合。
   */
  reason: "eose" | "closed" | "rejected" | "timeout";
};

/**
 * 複数のリレーへ同じフィルタを投げ、全 URL が片付く (EOSE/CLOSED) かタイム
 * アウトするまで待つ。EOSE の後に CLOSED が届くリレーが実在するため、1 URL
 * の片付きは 1 回しか数えない。`open` は collect() が両終了経路で必ず空に
 * するので、呼び出し元の `finally` は安全網に過ぎない。
 */
export const collect = (
  pool: ConnectionPool,
  urls: readonly RelayUrl[],
  filters: RelayFilter[],
  store: EventStore,
  timeoutMs: number,
  open: Map<RelayUrl, PooledSubscription>,
  options?: CollectOptions,
): Promise<number> =>
  new Promise((resolve) => {
    const startedAt = performance.now();
    let unrequested = 0;
    let pending = urls.length;
    let done = false;
    const settled = new Set<RelayUrl>();

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // 未 settle の URL も「応答なし」として報告する —— 知りたい相手だけ記録漏れになる。
      for (const url of urls) {
        if (settled.has(url)) continue;
        settled.add(url);
        options?.onRelaySettled?.({
          url,
          ms: performance.now() - startedAt,
          reason: "timeout",
        });
      }
      for (const subscription of open.values()) subscription.close();
      open.clear();
      resolve(unrequested);
    };
    const timer = setTimeout(finish, timeoutMs);

    if (urls.length === 0) {
      finish();
      return;
    }

    const settleOnce = (url: RelayUrl, reason: RelaySettle["reason"]) => {
      if (settled.has(url)) return;
      settled.add(url);
      options?.onRelaySettled?.({
        url,
        ms: performance.now() - startedAt,
        reason,
      });
      // 二重に閉じても安全 (close() は冪等)。
      open.get(url)?.close();
      open.delete(url);
      pending -= 1;
      if (pending <= 0) finish();
    };

    for (const url of urls) {
      const subscription = pool.subscribe(
        url,
        filters,
        {
          // 信頼境界。呼んでいない相手の無関係な kind/著者はここで落とす。
          onEvent: (event: NostrEvent) => {
            if (!matchesAnyFilter(event, filters)) {
              unrequested += 1;
              options?.onUnrequested?.(url);
              return;
            }
            store.put(event, url);
          },
          onEose: () => settleOnce(url, "eose"),
          onClosed: () => settleOnce(url, "closed"),
        },
        { reserved: options?.reserved ?? false },
      );

      if (!subscription) {
        // `reserved: true` は予算チェックを飛ばすので、そちらでは undefined
        // は起きないはず。`fetchOnce` は予算切れで普通にここへ来る ——
        // 取れなかった URL をハングさせず即座に片付いたものとして扱う。
        settleOnce(url, "rejected");
        continue;
      }

      // subscribe() が同期的に onClosed を呼ぶ実装がある。その場合まだ
      // `open` に無い url を settleOnce が閉じられず、finish() も既に
      // 走り切っている (done=true) ことがある —— ここで拾って即座に閉じる。
      if (done) subscription.close();
      else open.set(url, subscription);
    }
  });
