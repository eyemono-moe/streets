import type { NostrEvent } from "../nostr/event";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import type { ConnectionPool, PooledSubscription } from "./connection-pool";
import type { EventStore } from "./event-store";
import { matchesAnyFilter } from "./filter-match";

/**
 * `collect()` の省略可能なオプション。
 *
 * `reserved` は ADR-0011 の予算チェックを丸ごと迂回する
 * `ConnectionPool.SubscribeOptions.reserved` をそのまま下へ通す口 ——
 * **`bootstrap.ts` の `warmUpRouting` 専用であり、それ以外の呼び出し元
 * (`SubscriptionManager.fetchOnce` を含む) では絶対に `true` を渡さないこと。**
 * 理由は `connection-pool.ts` の `SubscribeOptions` のコメントと同じ:
 * インデクサはルーティング表そのものを作る処理なので、Outbox の選択が
 * 埋めた予算に阻まれて自分が走れないと循環する。一般の呼び出し元がこれを
 * 真似し始めた瞬間、30 接続という上限は数字の意味を失う。
 *
 * `onUnrequested` は、要求していないのに届いて捨てたイベントが 1 件出る
 * たびに、その URL を添えて呼ばれる。戻り値の `Promise<number>` (合計件数)
 * とは別の経路として用意してあるのは、呼び出し元によって欲しい粒度が違う
 * ため —— `warmUpRouting` は合計だけで足りる (`WarmUpResult.unrequested`)
 * が、`SubscriptionManager.fetchOnce` は既存の `unrequestedEventsByRelay`
 * (リレーごとの内訳) へそのまま積みたい。
 */
export type CollectOptions = {
  reserved?: boolean;
  onUnrequested?: (url: RelayUrl) => void;
};

/**
 * 複数のリレーへ同じフィルタを投げ、全 URL が片付く (EOSE か CLOSED を
 * 報告する) かタイムアウトするまで待つ。届いたイベントは EventStore に
 * 入れるだけで、呼び出し元へは返さない —— 呼び出し元は store 経由で読む。
 *
 * 1 URL につき「片付いた」判定は 1 回だけしか数えない。EOSE の後に CLOSED
 * が届く (あるいはその逆) リレーが実在し、素直にカウントダウンするだけだと
 * 同じ URL で 2 回減算されて、他の URL の応答を待たずに終わってしまう。
 *
 * 片付いた URL はその場で購読を閉じる。全部の片付きを待ってからまとめて
 * 閉じると、先に応答した速いリレーの購読が、遅いリレーのぶんだけ
 * (最悪 timeoutMs いっぱい) 無駄に開いたままになる。タイムアウトで
 * finish() した場合は、まだ片付いていない URL の購読をそこで閉じる。
 *
 * `open` は呼び出し元が持つ Map で、ここが開いた `PooledSubscription` を
 * 記録する —— `collect()` が例外なく正常に終わる限り、この呼び出しが返る
 * 時点で空になっている (settle か finish() のどちらかが必ず閉じるため)。
 * 呼び出し元の `finally` はこれを安全網として使えるが、必須ではない
 * (`collect()` 自身が両方の終了経路で閉じ切るため)。
 *
 * 戻り値は「要求していないのに送られてきて捨てたイベントの件数」の合計。
 * 全 URL の settle で終わろうとタイムアウトで finish() が発火しようと、
 * この時点までにカウントした `unrequested` をそのまま返す —— finish() は
 * 単一の resolve 経路であり、どちらの終わり方でも数え漏れ・数え過ぎは
 * 起きない。
 *
 * 元は `bootstrap.ts` の module-local な関数だった。`SubscriptionManager`
 * (フェッチ一回きりの `fetchOnce`) と `bootstrap.ts` (`warmUpRouting`) の
 * 両方が同じ settle 判定を必要としたため、ここへ引き上げて共有した ——
 * 両者とも `ConnectionPool` と `EventStore` だけを見ればよく、互いには
 * 依存しないので、`SubscriptionManager` の下 (このモジュール) に置いても
 * `bootstrap.ts` → `subscription-manager.ts` のような逆方向の依存を
 * 作らずに済む。
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
    let unrequested = 0;
    let pending = urls.length;
    let done = false;
    const settled = new Set<RelayUrl>();

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const subscription of open.values()) subscription.close();
      open.clear();
      resolve(unrequested);
    };
    const timer = setTimeout(finish, timeoutMs);

    if (urls.length === 0) {
      finish();
      return;
    }

    const settleOnce = (url: RelayUrl) => {
      if (settled.has(url)) return;
      settled.add(url);
      // ここで閉じておけば finish() 側で二重に閉じても安全
      // (PooledSubscription.close() は冪等)。
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
          // 信頼境界 (ADR-0023)。呼んでいない相手が要求と無関係な kind/著者を
          // 寄越しても、ここで落とす。
          onEvent: (event: NostrEvent) => {
            if (!matchesAnyFilter(event, filters)) {
              unrequested += 1;
              options?.onUnrequested?.(url);
              return;
            }
            store.put(event, url);
          },
          onEose: () => settleOnce(url),
          onClosed: () => settleOnce(url),
        },
        { reserved: options?.reserved ?? false },
      );

      if (!subscription) {
        // `reserved: true` は予算チェックそのものを飛ばすので、そちらの
        // 呼び出し元では pool.subscribe() が undefined を返す経路 (予算切れ)
        // は構造的に起こらないはず。`reserved` を使わない呼び出し元
        // (`fetchOnce`) では、予算が埋まっていれば普通にここへ来る ——
        // それは正しい振る舞い (ADR-0011) であり、取れなかった URL を
        // ハングさせず即座に片付いたものとして扱う。
        settleOnce(url);
        continue;
      }

      // subscribe() が同期的に onClosed を呼ぶ実装がある (connect() の失敗、
      // あるいは connection.subscribe() 自体の失敗を pool が同期的に
      // handlers.onClosed(...) へ変換する)。その場合 settleOnce はまだ
      // `open` に載っていない url を閉じられず、単一 URL なら finish() も
      // この時点で既に走り切ってしまっている (done=true) ので、もう誰も
      // `open` を見に来ない。ここで拾って即座に閉じ、迷子にしない。
      if (done) subscription.close();
      else open.set(url, subscription);
    }
  });
