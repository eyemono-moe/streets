import type {
  RelayConnection,
  RelayFilter,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import {
  ConnectionPool,
  type ConnectionPoolOptions,
  type PooledSubscription,
  type Scheduler,
  defaultScheduler,
} from "./connection-pool";
import {
  FALLBACK_RELAYS,
  MAX_CONNECTIONS,
  RELAY_REDUNDANCY,
} from "./default-relays";
import type { EventStore } from "./event-store";
import { matchesAnyFilter } from "./filter-match";
import { planQuery } from "./query-plan";
import { selectRelays } from "./relay-selector";
import type { RoutingTable } from "./routing-table";

/**
 * セクションが今どのリレーを待っているかのスナップショット。
 * `start()` 時点だけでなく、張り直し後も同じ形で運ばれる (ADR-0016)。
 */
export type SectionPlan = {
  /** このセクションが待っているリレー。完了判定の母集合になる */
  readonly relays: readonly RelayUrl[];
  readonly unroutableAuthors: number;
  /**
   * 接続予算に収まらず、宣言はあるのにどこへも割り当てられなかった著者数
   * (`selectRelays` / `planQuery` 由来)。`unroutableAuthors` と違い、こちらは
   * こちら側の接続上限を上げれば直る欠落である (ADR-0015)。
   */
  readonly uncoveredAuthors: number;
};

/**
 * 配信されるのはイベント本体ではなく id (ADR-0024)。
 * 本体は EventStore にあり、セクションは store.get(id) で引く。
 */
export type SectionDelivery = {
  onEvent: (id: string, relay: RelayUrl) => void;
  onRelayComplete: (relay: RelayUrl) => void;
  onRelayUnreachable: (relay: RelayUrl) => void;
  /** 張り直しでリレー集合が変わった (ADR-0016) */
  onPlanChanged: (plan: SectionPlan) => void;
  /**
   * リレー自体は前回の計画から生き残ったが、そのリレーへ送る REQ (担当著者)
   * が変わったため、同じ接続の上で購読を張り直した (fix round 1, Critical 1)。
   * 新しい EOSE が来るまでこのリレーについては何も分かっていない — 呼び出し側は
   * `complete` / `unreachable` を両方とも未知に戻すこと。`onRelayUnreachable`
   * を代用してはいけない (意味が違う — こちらは接続の失敗ではない)。
   */
  onRelayRestarted: (relay: RelayUrl) => void;
};

export type SectionHandle = {
  /**
   * start() 時点の計画のスナップショット。以後の変化は onPlanChanged 経由で
   * 届く — この型自体は「あとで変わりうる」ことを表すために生きたフィールド
   * を持たない。
   */
  readonly initialPlan: SectionPlan;
  close(): void;
};

export type SubscriptionManagerOptions = {
  store: EventStore;
  routing: RoutingTable;
  connect: (url: RelayUrl) => RelayConnection;
  fallbackRelays?: readonly RelayUrl[];
  /** アプリ全体で同時に開く接続の上限 (ADR-0011)。既定は MAX_CONNECTIONS */
  maxConnections?: number;
  /** 1 著者あたり何本のリレーから取るか。既定は RELAY_REDUNDANCY */
  redundancy?: number;
  /** ConnectionPool へそのまま渡す再接続タイマーの注入口 (テスト用)。 */
  scheduler?: ConnectionPoolOptions["scheduler"];
  /** ConnectionPool へそのまま渡すジッタの注入口 (テスト用)。 */
  random?: ConnectionPoolOptions["random"];
};

/**
 * `#runReplan()` の `do/while` を打ち切るまでの最大反復回数 (final review,
 * finding 1)。この巡が収束せず `#dirty` が立ち続ける状況は、通常運用では
 * 数パス (経験的には 2〜3 パス) で解消するはずのもの — 拒否状態への遷移
 * ガード (`SectionEntry.refused`) がある以上、無限に回り続けるとしたら
 * それ自体がバグ (呼び出し側が毎パス新しい需要を作り続けている、など) で
 * ある。ハングでアプリを道連れにするより、ここで打ち切って報告する方が
 * 安全 (下の `#runReplan` 参照)。
 */
const REPLAN_MAX_ITERATIONS = 10;

/** 1 本のリレーへ張っている購読と、それが今どんな filters で開かれているか。 */
type OpenSubscription = {
  subscription: PooledSubscription;
  filters: RelayFilter[];
};

/**
 * 登録済みの 1 セクション分の状態。マネージャはこの集合を持ち、`replan()` の
 * たびに全エントリの需要をプールしてから 1 回だけ `selectRelays` を呼ぶ
 * (予算は大域なので選択も大域でなければならない)。
 */
type SectionEntry = {
  readonly id: number;
  filters: RelayFilter[];
  /**
   * `undefined` = Outbox ルーティングに任せる。配列 (空配列を含む) =
   * 明示指定で選択をバイパスする (ADR-0005)。空配列は「指定した結果ゼロ本」
   * であり、正規化に失敗した URL を除いた後の値がここに入る。
   */
  explicitRelays: readonly RelayUrl[] | undefined;
  delivery: SectionDelivery;
  /** 直近の replan() が実際に開いている購読。リレーごとに filters も覚えておく
   * — 同じリレーが両方の計画に残っていても、担当著者 (filters) が変わって
   * いたら張り直す必要があるため (fix round 1, Critical 1)。 */
  opened: Map<RelayUrl, OpenSubscription>;
  plan: SectionPlan;
  /**
   * このエントリを作った `subscribe()` 呼び出しが、まだ handle を呼び出し元に
   * 返していないか。true の間は `onPlanChanged` を絶対に呼ばない — 呼び出し
   * 側がまだ handle を持っていない。`subscribe()` 自身だけがこれを false に
   * 落とす (`#runReplan()` が返った直後、`entry.plan` を initialPlan として
   * 読み取った後)。再入 (fix round 1, Critical 2) によって、このエントリの
   * 最初の実際の計算が `subscribe()` 呼び出しそのものの中では終わらず、後で
   * 遅延実行されるパスに回ることがある — その場合、`subscribe()` は
   * まだ何も計算されていない空の計画を initialPlan として返し、後から正しい
   * 計画が (今度は正当に) onPlanChanged 経由で届く。
   */
  pendingInitialDelivery: boolean;
  closed: boolean;
  /**
   * このパスで budget 切れにより拒否された (`pool.subscribe()` が
   * `undefined` を返した) URL の集合 (final review, finding 1)。
   *
   * `#applyEntryDiff` はここに載っている URL について `onRelayUnreachable`
   * を呼ばない — 呼ぶのは**拒否状態への遷移**のときだけ。この集合が無いと、
   * 予算切れで拒否された URL は決して `entry.opened` に入らないので、次の
   * `replan()` のたびに同じ URL への `pool.subscribe()` が再試行され、
   * 再び拒否され、再び `onRelayUnreachable` が発火する。呼び出し側が
   * `onRelayUnreachable` を受けて `replan()` を呼び返す (このマネージャが
   * 公然とサポートするパターン、上の Critical 2(b) 参照) と、これは
   * 定常状態の存在しない同期的な無限ループになる。
   *
   * `perRelay` に無くなった URL はこの集合からも取り除く
   * (`#applyEntryDiff` の先頭) — 需要が引っ込んだ後にまた戻ってきたときは
   * 新しい遷移として扱う。
   */
  refused: Set<RelayUrl>;
};

const EMPTY_PLAN: SectionPlan = {
  relays: [],
  unroutableAuthors: 0,
  uncoveredAuthors: 0,
};

/**
 * 2 つの計画が観測可能な意味で同じかを判定する。リレーの集合は**順不同**で
 * 比較する — `selectRelays` の貪欲法は同点タイブレークの都合で無関係な変化
 * (他セクションの需要が動いただけ) でも `picks` の並びが変わりうるが、それは
 * `SectionReader` にとって意味のある変化ではない。並び違いだけで
 * `onPlanChanged` を呼ぶと、実際には何も変わっていないのに購読を張り直したと
 * 誤解させる不要な通知になる。
 */
export const planEqual = (a: SectionPlan, b: SectionPlan): boolean => {
  if (a.unroutableAuthors !== b.unroutableAuthors) return false;
  if (a.uncoveredAuthors !== b.uncoveredAuthors) return false;
  if (a.relays.length !== b.relays.length) return false;
  const relaysA = new Set(a.relays);
  return b.relays.every((url) => relaysA.has(url));
};

/** 2 つの RelayFilter が構造的に同じか (参照ではなく中身で比較する)。 */
const filterEqual = (a: RelayFilter, b: RelayFilter): boolean => {
  const keysA = Object.keys(a) as (keyof RelayFilter)[];
  if (keysA.length !== Object.keys(b).length) return false;
  for (const key of keysA) {
    if (!(key in b)) return false;
    const va = a[key];
    const vb = b[key];
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length) return false;
      for (let i = 0; i < va.length; i++) {
        if (va[i] !== vb[i]) return false;
      }
    } else if (va !== vb) {
      return false;
    }
  }
  return true;
};

/**
 * 2 つの RelayFilter[] が構造的に同じか。あるリレーが両方の計画に残っていて
 * も、そのリレーへ送る filters (担当著者など) が変わっていれば違う扱いにする
 * — これが変わらないと、URL だけで「触らない」を決める差分は、著者の割り当て
 * が変わったことを見逃す (fix round 1, Critical 1)。
 */
const filtersEqual = (a: RelayFilter[], b: RelayFilter[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((filter, i) => filterEqual(filter, b[i]));
};

/**
 * すべてのリレー接続と購読を所有する (ADR-0023)。
 * セクションは自分で接続しない。
 *
 * 予算はアプリ全体の値なので、選択も全セクションの需要をまとめて 1 回だけ
 * 行う (`replan()`)。各セクションは自分の需要だけを見て個別に選ぶことはない
 * — そうすると同じ人をフォローする複数カラムがそれぞれ予算を消費し、
 * 大域の 30 接続をすぐに使い切ってしまう。
 */
export class SubscriptionManager {
  readonly #options: SubscriptionManagerOptions;
  // すべての接続の所有・予算の強制・購読レジストリは ConnectionPool に
  // 一本化されている (Task 7)。マネージャはもう connect()/refCount を直接
  // 扱わない。PooledSubscription.close() はエントリのオブジェクト同一性で
  // 迷子ハンドルを検出するので、dispose() 後の孤児化対策として世代カウンタ
  // を自前で持つ必要も無くなった (旧 #generation は削除した — 詳細は
  // ConnectionPool のコメント参照)。
  readonly #pool: ConnectionPool;
  readonly #entries = new Map<number, SectionEntry>();
  #nextEntryId = 0;
  /**
   * 要求していないのに送られてきたイベントの、リレーごとの件数
   * (仕様 5.1)。**単調増加でリセットしない** —— 押し込んだ後に静かになった
   * リレーが潔白に見えてはいけない。`ConnectionPool.peakSize` と同じ理屈。
   */
  readonly #unrequested = new Map<RelayUrl, number>();
  // #replanOnce() の再入を防ぐガード (fix round 1, Critical 2)。
  // connection.subscribe() は死んだ接続に対して同期的に onClosed を発火させ
  // ることがあり (Task 1)、その配信コールバックがマネージャへ再入する
  // (replan()/subscribe() を呼ぶ) ことがある。素朴に再帰すると:
  //   (a) まだ処理し終えていない #entries を、外側のループが stale な
  //       selection のまま処理してしまい、あとから登録されたセクションへ
  //       間違った計画を配ってしまう
  //   (b) 同じ URL への pool.subscribe() が再帰のたびに繰り返され、
  //       無制限なら RangeError: Maximum call stack size exceeded に至る
  // #replanning が立っている間の replan() 要求は #dirty を立てるだけに留め、
  // 一番外側の呼び出しが「変化がなくなるまでトップレベルで回す」ループに
  // 一本化する。これにより、ネストした呼び出しの中で新しく登録された
  // エントリは、そのパスでは一切処理されず (stale な selection で触られる
  // ことがない)、外側の呼び出しが一巡し終えた直後の新しいパスで正しく
  // 処理される。
  #replanning = false;
  #dirty = false;
  // ConnectionPool へそのまま渡す再接続タイマーの注入口 (下記コンストラクタ
  // 参照)。マネージャ自身はもう独自のタイマーを持たない —— #scheduler を
  // 経由するのは pool への受け渡しのみ。
  readonly #scheduler: Scheduler;

  constructor(options: SubscriptionManagerOptions) {
    this.#options = options;
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#pool = new ConnectionPool({
      connect: options.connect,
      maxConnections: options.maxConnections,
      scheduler: this.#scheduler,
      random: options.random,
    });
  }

  get connectionCount(): number {
    return this.#pool.size;
  }

  /**
   * 観測史上の同時接続数の最大値 (ADR-0011 の高水位マーク, Task 12 fix round 1)。
   * `connectionCount` は「今」の値なので、予算超過が一瞬でも settled 判定の
   * 前に自己解消してしまうと (到達不能リレーの接続失敗はミリ秒単位で起こる)
   * 見えなくなる。予算そのものを検証するにはこちらを読む。
   */
  get peakConnectionCount(): number {
    return this.#pool.peakSize;
  }

  /**
   * マネージャが所有する ConnectionPool そのもの (Task 11)。`warmUpRouting`
   * (`src/core/read/bootstrap.ts`) がブートストラップ用のインデクサ接続を
   * 同じ予算の中で開けるようにするための公開口 — マネージャの外に別系統の
   * `connect()` を持たせると、ADR-0011 の 30 接続という上限が意味を失う
   * (このマネージャと呼び出し元が別々に予算を数えることになるため)。
   */
  get pool(): ConnectionPool {
    return this.#pool;
  }

  /** 手動再試行 (ADR-0021)。プールへそのまま委譲する。 */
  retryNow(): void {
    this.#pool.retryNow();
  }

  /**
   * リレーごとに分けるのは、合計値だけでは行動に移せないため —— 「どこかが
   * 嘘をついている」は情報だが「どのリレーが」は判断材料になる。合計は
   * 呼び出し側で足すこと。
   *
   * 内部の Map をそのまま返さずコピーを返す (`SectionReader.items` と同じ規約)。
   */
  get unrequestedEventsByRelay(): ReadonlyMap<RelayUrl, number> {
    return new Map(this.#unrequested);
  }

  #recordUnrequested(url: RelayUrl): void {
    this.#unrequested.set(url, (this.#unrequested.get(url) ?? 0) + 1);
  }

  subscribe(
    filters: RelayFilter[],
    relays: RelayUrl[] | undefined,
    delivery: SectionDelivery,
  ): SectionHandle {
    const explicitRelays =
      relays === undefined
        ? undefined
        : this.#normalizeExplicit(relays, delivery);

    const entry: SectionEntry = {
      id: this.#nextEntryId++,
      filters,
      explicitRelays,
      delivery,
      opened: new Map(),
      plan: EMPTY_PLAN,
      pendingInitialDelivery: true,
      closed: false,
      refused: new Set(),
    };
    this.#entries.set(entry.id, entry);

    try {
      this.#runReplan();
    } catch (error) {
      this.#entries.delete(entry.id);
      throw error;
    }

    // #runReplan() が (再入で) 遅延されていた場合、entry.plan はまだ
    // EMPTY_PLAN のことがある — その場合は、まもなく (このメソッドが返った
    // 直後、まだ同じ同期的な呼び出し連鎖の中で) 正しい計画が onPlanChanged
    // 経由で届く。ここで false に落とすことで、その後続の適用が「初回だから
    // 抑制する」ではなく正当な通知として扱われるようになる。
    const initialPlan = entry.plan;
    entry.pendingInitialDelivery = false;

    return {
      initialPlan,
      close: () => this.#close(entry),
    };
  }

  /**
   * 登録済みセクションの需要を大域でプールし直し、選択と割り当てをやり直す
   * (ADR-0025)。セクションの追加・削除、`kind:10002` の到着、接続の生死など
   * 「需要か供給が変わったとき」に呼ぶ。この Task では公開するだけで、
   * 自動では呼ばれない — 呼ぶのは `subscribe()` / `handle.close()` と、
   * 将来のルーティング変化を検知する後続 Task。
   */
  replan(): void {
    this.#runReplan();
  }

  dispose(): void {
    // #pool.dispose() より前に全エントリを閉じたことにする (final review,
    // finding 3)。#pool.dispose() は各接続を close() するが、
    // FakeRelayConnection の close() はハンドラへ同期的に onClosed を配る
    // (実装によっては — WebSocketRelayConnection.fail() は非同期にこれを
    // 行うが、いずれにせよ配られる)。#handlersFor の onClosed ガードは
    // `entry.closed` だけを見ているので、ここで先に立てておかないと、
    // まさに dispose() させている最中の接続の死が、dispose() 済みのはずの
    // セクションへ onRelayUnreachable として届いてしまう。
    for (const entry of this.#entries.values()) entry.closed = true;
    this.#pool.dispose();
    // 生きている handle が孤児化しても構わない — PooledSubscription.close()
    // はエントリのオブジェクト同一性で判定するので、dispose() 後の孤児化した
    // handle.close() は自動的に無害な no-op になる (ConnectionPool のコメント
    // 参照)。それでもエントリの登録は丸ごと捨てる: 捨てないと、後段の
    // replan() がその「もう存在しない」エントリを生きたセクションとして扱い、
    // 需要をもう一度プールして再接続してしまう。
    this.#entries.clear();
  }

  #normalizeExplicit(
    relays: readonly RelayUrl[],
    delivery: SectionDelivery,
  ): RelayUrl[] {
    const normalized: RelayUrl[] = [];
    for (const raw of relays) {
      const url = normalizeRelayUrl(raw);
      if (url) {
        normalized.push(url);
      } else {
        // 正規化できない URL を黙って捨てると「どこも見ていないのに
        // settled」という区別のつかない劣化になる (ADR-0011: 黙って
        // 欠落させてはならない)。最初から到達不能だったものとして報告する。
        delivery.onRelayUnreachable(raw);
      }
    }
    return normalized;
  }

  #close(entry: SectionEntry): void {
    if (entry.closed) return;
    entry.closed = true;
    this.#entries.delete(entry.id);

    // dispose() が挟まっていたら、これらの PooledSubscription はもう現在の
    // プール状態には属していない — 各々の close() 自身がそれを検出して
    // 無害な no-op になる (ConnectionPool のオブジェクト同一性チェック)。
    // ここで世代を確認する必要は無い。
    for (const [, open] of entry.opened) {
      open.subscription.close();
    }
    entry.opened.clear();

    // 閉じたセクション自身には onPlanChanged を呼ばない (もう handle を
    // 誰も持っていない)。他のセクションは、このセクションが解放した予算を
    // 受け取れるかもしれないので、必ず replan() し直す。
    this.replan();
  }

  /**
   * `#replanOnce()` への一本化された入口。再入を検知したら実行を遅延する
   * (上の `#replanning`/`#dirty` のコメント参照)。
   */
  #runReplan(): void {
    if (this.#replanning) {
      this.#dirty = true;
      return;
    }
    this.#replanning = true;
    try {
      let iterations = 0;
      do {
        this.#dirty = false;
        this.#replanOnce();
        iterations += 1;
        if (iterations >= REPLAN_MAX_ITERATIONS && this.#dirty) {
          // 収束しなかった (final review, finding 1)。原因は呼び出し側が
          // 毎パス新しい需要を作り続けているなど、このマネージャの外側に
          // ある可能性が高い — が、専用の報告チャネルが無いので
          // console.error に落とす。ここで回り続けるとタブ全体が同期的な
          // 無限ループでハングするので、打ち切って現状の (収束していない
          // 可能性がある) 計画のまま返る方を選ぶ。
          console.error(
            `SubscriptionManager: replan() did not converge after ${REPLAN_MAX_ITERATIONS} iterations; giving up for this call instead of looping forever. This usually means a delivery callback keeps triggering replan() without ever reaching a stable plan.`,
          );
          break;
        }
      } while (this.#dirty);
    } finally {
      this.#replanning = false;
    }
  }

  /**
   * 1 つのセクションへの配信コールバックを孤立させて呼ぶ (final review,
   * finding 4)。呼び出し先は任意の消費者コード — `#replanOnce` は複数
   * エントリを 1 つの for ループで処理しており、ここで無防備に呼ぶと
   * 1 エントリのコールバックが投げただけで、まだ処理していない残りの
   * エントリが古い計画のまま取り残される (ADR-0011 が禁じる隠れた劣化)。
   * 専用の報告チャネルは無いので `console.error` に落とす — 黙って握り
   * 潰すよりはましだが、ここでの主目的は隔離であって報告ではない。
   */
  #deliver(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      console.error(
        "SubscriptionManager: a delivery callback threw; isolating it so other sections keep receiving updates.",
        error,
      );
    }
  }

  /**
   * 登録済み全エントリの需要を 1 つにプールし、選択・割り当て・張り直しを
   * 1 回だけ行う。ブリーフの「構造」節そのままの手順:
   *
   * 1. 大域の需要を作る (著者 → routing.writeRelaysFor(author))
   * 2. pinned を作る (fallback + 全エントリの明示リレー)
   * 3. selectRelays を 1 回だけ呼ぶ
   * 4. エントリごとに perRelay を組む (明示指定はバイパス)
   * 5. エントリごとに前回の opened と差分する
   * 6. 計画が変わったエントリにだけ onPlanChanged を呼ぶ
   *
   * `#entries` のスナップショットを先頭で 1 回だけ取る (fix round 1,
   * Critical 2)。ライブな Map をそのまま反復すると、この一巡の途中で
   * (差分適用が引き起こす同期的なコールバック経由で) 新しく登録された
   * エントリまで、この巡のために計算した stale な selection で処理して
   * しまう。スナップショットに無いエントリは単にこの巡では触らない —
   * それを登録した `#runReplan()` 呼び出しが `#dirty` を立てて戻っている
   * ので、この巡の後にもう一巡フレッシュな状態で回り、そこで正しく処理
   * される。
   */
  #replanOnce(): void {
    const fallbackRelays = this.#options.fallbackRelays ?? FALLBACK_RELAYS;
    const budget = this.#options.maxConnections ?? MAX_CONNECTIONS;
    const redundancy = this.#options.redundancy ?? RELAY_REDUNDANCY;

    const entries = [...this.#entries.values()];

    // 1. 大域の需要。著者ごとに writeRelaysFor を 1 回だけ呼ぶ
    // (RoutingTable は呼ぶたびに kind:10002 のパースをやり直すので、
    // 著者数 × エントリ数だけ走らせない)。
    const demand = new Map<string, readonly RelayUrl[]>();
    const seenAuthors = new Set<string>();
    for (const entry of entries) {
      if (entry.explicitRelays !== undefined) continue; // バイパス経路は需要に入らない
      for (const filter of entry.filters) {
        for (const author of filter.authors ?? []) {
          if (seenAuthors.has(author)) continue;
          seenAuthors.add(author);
          const declared = this.#options.routing.writeRelaysFor(author);
          if (declared.length > 0) demand.set(author, declared);
        }
      }
    }

    // 2. pinned。ユーザーが名指ししたものを先に確保してから fallback を足す
    // — budget が小さいときに一般的な fallback が明示指定を押し出さないため。
    const pinnedSet = new Set<RelayUrl>();
    for (const entry of entries) {
      if (entry.explicitRelays === undefined) continue;
      for (const url of entry.explicitRelays) pinnedSet.add(url);
    }
    for (const url of fallbackRelays) pinnedSet.add(url);
    const pinned = [...pinnedSet];

    // 粘着性のため、選び直し前に「いま開いているリレー」を集める。
    // 差分適用でこの後の状態が変わっていくので、必ず選択の前に読む。
    const currentSet = new Set<RelayUrl>();
    for (const entry of entries) {
      for (const url of entry.opened.keys()) currentSet.add(url);
    }
    const current = [...currentSet];

    // 3. 大域で 1 回だけ選ぶ
    const selection = selectRelays({
      demand,
      pinned,
      current,
      budget,
      redundancy,
    });

    // 4-6. エントリごとに割り当て、差分適用し、変わったものだけ通知する
    for (const entry of entries) {
      // このスナップショットを取った後に close() されたエントリ (差分適用中
      // の同期的なコールバックが引き起こした) は、もう存在しないものとして
      // 扱う — #close() が既に opened を空にして pool から外している。
      if (entry.closed) continue;

      let perRelay: Map<RelayUrl, RelayFilter[]>;
      let unroutableAuthors = 0;
      let uncoveredAuthors = 0;

      if (entry.explicitRelays !== undefined) {
        // 明示リレーのセクションは選択を経由しない (ADR-0005 のバイパス)。
        // pinned には入れて予算は消費するが、実際に開くかどうかは選択結果に
        // 左右されない — ユーザーが名指ししたリレーを予算都合で落とさない。
        perRelay = new Map();
        for (const url of entry.explicitRelays) {
          // planQuery と同じく、リレーごとに配列を分ける。同じ配列インスタンス
          // を複数リレーで共有すると、一方への変更が他方に漏れる。
          perRelay.set(url, [...entry.filters]);
        }
      } else {
        const assignment = new Map<string, readonly RelayUrl[]>();
        for (const filter of entry.filters) {
          for (const author of filter.authors ?? []) {
            if (assignment.has(author)) continue;
            const assigned = selection.assignment.get(author);
            // author が demand に無かった (宣言リレー無し) 場合は
            // selection.assignment にも無い — assignment に入れず
            // planQuery 側で「未知」= unroutableAuthors に回す。
            if (assigned !== undefined) assignment.set(author, assigned);
          }
        }
        const plan = planQuery({
          filters: entry.filters,
          assignment,
          fallbackRelays,
        });
        perRelay = plan.perRelay;
        unroutableAuthors = plan.unroutableAuthors.length;
        uncoveredAuthors = plan.uncoveredAuthors.length;
      }

      const suppressCallback = entry.pendingInitialDelivery;
      this.#applyEntryDiff(entry, perRelay);

      const newPlan: SectionPlan = {
        relays: [...perRelay.keys()],
        unroutableAuthors,
        uncoveredAuthors,
      };
      const changed = !suppressCallback && !planEqual(entry.plan, newPlan);
      entry.plan = newPlan;
      // subscribe() の中では呼ばない (呼び出し側がまだ handle を持っていない
      // 間は suppressCallback が真になる — 通常は subscribe() 自身がこの巡で
      // 処理される場合、再入で遅延され後続の巡で処理される場合の両方をカバー
      // する。後者では subscribe() が既に handle を返し終えているので、この
      // 巡が「初回」でもここで正しく通知する)。
      if (changed) this.#deliver(() => entry.delivery.onPlanChanged(newPlan));
    }
  }

  /**
   * `entry.opened` (前回張った購読) と `perRelay` (今回の計画) を差分する。
   * 消えたリレーは購読を閉じて release、増えたリレーは購読を開く、両方に
   * あって filters も変わっていないものは触らない。両方にあるが filters が
   * 変わったものは、同じ接続の上で購読だけ張り直す。
   *
   * ここで全部張り直すと、両方の計画が保持しているリレーの購読までいったん
   * 閉じて開き直すことになり、そのセクションの phase が settled から
   * streaming へ巻き戻る。カラムを 1 本足すたびに他の全カラムでこれが起きる
   * ── 差分こそが張り直しを安く保っている部分。
   *
   * `pool.subscribe()` は例外を投げない (Task 7) ので、このメソッドに
   * try/catch もロールバックも要らない。予算切れで拒否されたら `undefined`
   * が返るだけで、それを `onRelayUnreachable` に変換するのはこのメソッドの
   * 責務である — 拒否されたリレーの背後には著者がいない (明示指定・fallback
   * どちらもありうる) ので `uncoveredAuthors` は数えようがなく、無理に
   * 数えれば捏造になる (2026-08-01 訂正)。既に接続済みのリレーが投げた場合は
   * pool が `handlers.onClosed(...)` を同期的に呼ぶので、そちらは
   * `#handlersFor` 経由で同じ `onRelayUnreachable` に自然に合流する。
   *
   * `pool.subscribe()` は `handlers.onClosed` を**同期的に**呼ぶことがある
   * (Task 1)。それが `onRelayUnreachable` 経由で消費者コードへ届き、そこが
   * このセクションを閉じる (`handle.close()`) と、`#close()` が
   * `entry.opened` を空にした*直後*にこのメソッドへ戻ってくる — その後で
   * 無条件に `entry.opened.set(...)` すると、閉じたはずのエントリへ誰も
   * 二度と閉じない `PooledSubscription` を書き込むことになる (final
   * review, finding 2)。`pool.subscribe()` の戻り値を受け取るたびに
   * `entry.closed` を確認し、閉じていれば取得した分をその場で閉じて抜ける。
   */
  #applyEntryDiff(
    entry: SectionEntry,
    perRelay: Map<RelayUrl, RelayFilter[]>,
  ): void {
    // 消えたリレーを閉じる
    for (const [url, open] of [...entry.opened]) {
      if (perRelay.has(url)) continue;
      open.subscription.close();
      entry.opened.delete(url);
    }

    // 需要から外れた URL の拒否記録も一緒に忘れる (final review,
    // finding 1)。戻ってきたときは新しい遷移として扱う。
    for (const url of [...entry.refused]) {
      if (!perRelay.has(url)) entry.refused.delete(url);
    }

    // 残っている・新規のリレーを処理する。
    for (const [url, relayFilters] of perRelay) {
      const open = entry.opened.get(url);
      if (open && filtersEqual(open.filters, relayFilters)) continue; // 変化なし = 触らない

      if (open) {
        // 同じリレーが残っているが filters (担当著者) が変わった
        // (fix round 1, Critical 1)。URL だけで「触らない」を決めると、
        // 著者の割り当てが変わったのに古い REQ のまま購読し続けてしまう —
        // そのセクションはその著者を実際にはどこにも購読していないのに
        // settled を報告する、という ADR-0011 が禁じる隠れた劣化になる。
        //
        // 新しい購読を先に開いてから古い方を閉じる。逆順だと、この URL を
        // 使っているのがこのエントリだけの場合に pool 側の entries が
        // 一瞬 0 になり、#drop(url) が接続そのものを閉じてしまう —
        // 同じ接続の上で REQ だけ差し替えるつもりが、pool.subscribe() に
        // budget チェックと connect() をもう一度走らせる羽目になる。
        this.#deliver(() => entry.delivery.onRelayRestarted(url));
        const pooled = this.#pool.subscribe(
          url,
          relayFilters,
          this.#handlersFor(entry, url, relayFilters),
        );
        open.subscription.close();
        if (entry.closed) {
          // onRelayRestarted (上) が同期的にこのセクションを閉じた
          // (final review, finding 2)。entry.opened は #close() で
          // 既に空になっている — 取得したばかりの pooled をここで
          // 書き込むと、誰も閉じない孤立ソケットになる。
          pooled?.close();
          return;
        }
        if (pooled) {
          entry.opened.set(url, {
            subscription: pooled,
            filters: relayFilters,
          });
          entry.refused.delete(url);
        } else {
          // 上の理屈により、既に開いていたリレーの張り直しがここで拒否
          // されるのは実質起こらない (直前まで自分の分の枠を握っていた) が、
          // 万一 (他エントリの close() などとの絡み) 起きても total に保つ。
          entry.opened.delete(url);
          entry.refused.add(url);
          this.#deliver(() => entry.delivery.onRelayUnreachable(url));
        }
        continue;
      }

      // 新規。
      const pooled = this.#pool.subscribe(
        url,
        relayFilters,
        this.#handlersFor(entry, url, relayFilters),
      );
      if (entry.closed) {
        // pool.subscribe() が同期的に onClosed -> onRelayUnreachable を
        // 発火させ、その配信コールバックがこのセクションを閉じた
        // (final review, finding 2)。上の restart 分岐と同じ理由で、
        // ここで entry.opened へ書き込んではいけない。
        pooled?.close();
        return;
      }
      if (pooled) {
        entry.opened.set(url, { subscription: pooled, filters: relayFilters });
        entry.refused.delete(url);
      } else {
        // pool 側が budget 切れで丸ごと拒否した (undefined) — 接続を試み
        // てすらいないので pool の onClosed は発火しない。ここで直接報告
        // する必要がある。ただし「拒否状態への遷移」のときだけ (final
        // review, finding 1) — 既に拒否済みの URL を毎パス報告し続けると、
        // それを受けて replan() を呼び返す消費者コード (このマネージャが
        // 公然とサポートするパターン) が定常状態に決して到達できず、
        // 同期的な無限ループになる。
        if (!entry.refused.has(url)) {
          entry.refused.add(url);
          this.#deliver(() => entry.delivery.onRelayUnreachable(url));
        }
      }
    }
  }

  /**
   * `filters` は「このリレーへ実際に送った REQ の中身」である。`entry.opened`
   * を実行時に引かずクロージャで捕捉するのは、不変式をハンドラ生成時点で
   * 閉じるため —— `#applyEntryDiff` が REQ を差し替えるときは必ず新しい
   * ハンドラが作られるので、古い REQ に対応するハンドラが新しいフィルタで
   * 判定する余地が構造的に消える。
   */
  #handlersFor(
    entry: SectionEntry,
    url: RelayUrl,
    filters: RelayFilter[],
  ): RelaySubscriptionHandlers {
    return {
      onEvent: (event) => {
        if (entry.closed) return;
        // 信頼境界 (ADR-0023)。署名検証は *偽造* を止めるが *混入* は止めない。
        // ここが `store.put` より前にあるのは意図的で、要求していないイベントの
        // 洪水を浴びても払うのは文字列比較であって schnorr 検証ではない。
        if (!matchesAnyFilter(event, filters)) {
          this.#recordUnrequested(url);
          return;
        }
        const result = this.#options.store.put(event, url);
        // store.put() が "rejected" を返した (schnorr 検証に落ちた) イベント
        // は、セクションへ配信しない (既存の挙動)。
        if (result === "rejected") return;
        entry.delivery.onEvent(event.id, url);
      },
      onEose: () => {
        if (!entry.closed) entry.delivery.onRelayComplete(url);
      },
      onClosed: () => {
        if (!entry.closed) entry.delivery.onRelayUnreachable(url);
      },
    };
  }
}
