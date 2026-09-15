import type {
  RelayConnection,
  RelayFilter,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import { collect } from "./collect";
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

/** セクションが今どのリレーを待っているかのスナップショット。張り直し後も同じ形で運ばれる。 */
export type SectionPlan = {
  /** このセクションが待っているリレー。完了判定の母集合になる */
  readonly relays: readonly RelayUrl[];
  readonly unroutableAuthors: number;
  /**
   * 接続予算に収まらず割り当てられなかった著者数。`unroutableAuthors` と
   * 違い、接続上限を上げれば直る欠落である。
   */
  readonly uncoveredAuthors: number;
};

/** 配信されるのは id —— 本体は EventStore にあり、セクションは store.get(id) で引く。 */
export type SectionDelivery = {
  onEvent: (id: string, relay: RelayUrl) => void;
  onRelayComplete: (relay: RelayUrl) => void;
  onRelayUnreachable: (relay: RelayUrl) => void;
  /** 張り直しでリレー集合が変わった */
  onPlanChanged: (plan: SectionPlan) => void;
  /**
   * REQ の担当著者が変わり、同じ接続の上で購読を張り直した。新しい EOSE が
   * 来るまで complete/unreachable は未知に戻すこと —— `onRelayUnreachable`
   * は代用しない (接続の失敗ではないため)。
   */
  onRelayRestarted: (relay: RelayUrl) => void;
};

export type SectionHandle = {
  /**
   * start() 時点の計画のスナップショット。以後は onPlanChanged 経由で届く
   * ため、この型自体は生きたフィールドを持たない。
   */
  readonly initialPlan: SectionPlan;
  close(): void;
};

export type SubscriptionManagerOptions = {
  store: EventStore;
  routing: RoutingTable;
  connect: (url: RelayUrl) => RelayConnection;
  fallbackRelays?: readonly RelayUrl[];
  /** アプリ全体で同時に開く接続の上限。既定は MAX_CONNECTIONS */
  maxConnections?: number;
  /** 1 著者あたり何本のリレーから取るか。既定は RELAY_REDUNDANCY */
  redundancy?: number;
  /** ConnectionPool へそのまま渡す再接続タイマーの注入口 (テスト用)。 */
  scheduler?: ConnectionPoolOptions["scheduler"];
  /** ConnectionPool へそのまま渡すジッタの注入口 (テスト用)。 */
  random?: ConnectionPoolOptions["random"];
};

/**
 * `#runReplan()` の `do/while` を打ち切るまでの最大反復回数。この巡が
 * 収束せず `#dirty` が立ち続ける状況は、通常運用では数パス (経験的には
 * 2〜3 パス) で解消するはずのもの — 拒否状態への遷移ガード
 * (`SectionEntry.refused`) がある以上、無限に回り続けるとしたらそれ自体が
 * バグ (呼び出し側が毎パス新しい需要を作り続けている、など) である。
 * ハングでアプリを道連れにするより、ここで打ち切って報告する方が安全
 * (下の `#runReplan` 参照)。
 */
const REPLAN_MAX_ITERATIONS = 10;

/**
 * `bootstrap.ts` の `DEFAULT_TIMEOUT_MS` と同じ 10 秒。どちらも同じ
 * `collect()` の判定を使うので、値を変える理由が無い。
 */
const DEFAULT_FETCH_ONCE_TIMEOUT_MS = 10_000;

/**
 * degraded 集合の出入り通知をまとめる窓。再接続はジッタで別々の
 * マクロタスクに散るので、出入りのたびに replan するとチャーンになる。
 * 200ms は `PROFILE_BATCH_MS` と同じ値。export はテストが定数を直接
 * 読めるようにするため。
 */
export const DEGRADED_REPLAN_BATCH_MS = 200;

/** 1 本のリレーへ張っている購読と、それが今どんな filters で開かれているか。 */
type OpenSubscription = {
  subscription: PooledSubscription;
  filters: RelayFilter[];
};

/**
 * 登録済み 1 セクション分の状態。予算は大域なので、`replan()` のたびに
 * 全エントリの需要をプールしてから 1 回だけ `selectRelays` を呼ぶ。
 */
type SectionEntry = {
  readonly id: number;
  filters: RelayFilter[];
  /**
   * `undefined` = Outbox ルーティングに任せる。配列 (空含む) = 明示指定で
   * バイパスする。空配列は、正規化に失敗した URL を除いた後の「結果ゼロ本」。
   */
  explicitRelays: readonly RelayUrl[] | undefined;
  delivery: SectionDelivery;
  /** 直近の replan() で開いている購読。filters も保持する —— 同じリレーでも
   * 担当著者が変われば張り直しが要るため。 */
  opened: Map<RelayUrl, OpenSubscription>;
  plan: SectionPlan;
  /**
   * `subscribe()` がまだ handle を返していない間は true —— この間は
   * `onPlanChanged` を呼ばない。再入で計算が遅延すると `subscribe()` は
   * 空の initialPlan を返し、正しい計画は後から `onPlanChanged` で届く。
   */
  pendingInitialDelivery: boolean;
  closed: boolean;
  /**
   * budget 切れで拒否された URL の集合。ここにある URL には
   * `onRelayUnreachable` を再度呼ばない —— 呼ぶと拒否のたびに再試行・
   * 再拒否・再通知が続き、`replan()` を呼び返す呼び出し側では無限ループになる。
   */
  refused: Set<RelayUrl>;
};

const EMPTY_PLAN: SectionPlan = {
  relays: [],
  unroutableAuthors: 0,
  uncoveredAuthors: 0,
};

/**
 * 2 つの計画が観測可能な意味で同じか。リレー集合は**順不同**で比較する
 * —— `selectRelays` の貪欲法は無関係な変化でも `picks` の並びを変えうる
 * が、それは `SectionReader` にとって意味のある変化ではないため。
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
 * が変わったことを見逃す。
 */
const filtersEqual = (a: RelayFilter[], b: RelayFilter[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((filter, i) => filterEqual(filter, b[i]));
};

/**
 * すべてのリレー接続と購読を所有する。
 * セクションは自分で接続しない。
 *
 * 予算はアプリ全体の値なので、選択も全セクションの需要をまとめて
 * 1 回だけ行う —— 個別に選ぶと同じ人をフォローする複数カラムが
 * それぞれ予算を消費し、大域の接続数上限をすぐ使い切ってしまう。
 */
export class SubscriptionManager {
  readonly #options: SubscriptionManagerOptions;
  // 接続・予算・購読レジストリは ConnectionPool に一本化 ——
  // close() はオブジェクト同一性で迷子ハンドルを検出するので、
  // 世代カウンタをここで持つ必要は無い。
  readonly #pool: ConnectionPool;
  readonly #entries = new Map<number, SectionEntry>();
  #nextEntryId = 0;
  /**
   * 要求していないイベントのリレーごとの件数。**単調増加でリセットしない**
   * —— 静かになったリレーが潔白に見えてはいけない (peakSize と同じ理屈)。
   */
  readonly #unrequested = new Map<RelayUrl, number>();
  // #replanOnce() の再入ガード。死んだ接続への同期的な onClosed が
  // マネージャへ再入しうるので、再入中は #dirty を立てるだけに留め、
  // 外側の呼び出しだけが変化がなくなるまでトップレベルで回る形にする。
  #replanning = false;
  #dirty = false;
  // pool への受け渡しと degraded バッチ窓の 2 箇所だけで使う注入口 ——
  // マネージャ自身はタイマーを持たない。
  readonly #scheduler: Scheduler;
  // pool.onDegradedChanged() の購読解除。dispose() で必ず呼ばないと、
  // 同じ pool が再利用されたとき、もう存在しないはずのクロージャが
  // 出入りのたびに呼ばれ続ける。
  readonly #offDegraded: () => void;
  // degraded 出入りのバッチタイマー。#notify() と同じ「デバウンスでなく
  // バッチ」の形 —— 最初の出入りで 1 本張り、残りは相乗りする。
  #degradedReplanTimer: ReturnType<Scheduler["setTimeout"]> | null = null;

  constructor(options: SubscriptionManagerOptions) {
    this.#options = options;
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#pool = new ConnectionPool({
      connect: options.connect,
      maxConnections: options.maxConnections,
      scheduler: this.#scheduler,
      random: options.random,
    });
    // degraded 集合の出入りは replan() の正当な契機 (#scheduleDegradedReplan 参照)。
    this.#offDegraded = this.#pool.onDegradedChanged(() => {
      this.#scheduleDegradedReplan();
    });
  }

  get connectionCount(): number {
    return this.#pool.size;
  }

  /**
   * 観測史上の同時接続数の最大値。
   * `connectionCount` は「今」の値なので、予算超過が一瞬でも settled 判定の
   * 前に自己解消してしまうと (到達不能リレーの接続失敗はミリ秒単位で起こる)
   * 見えなくなる。予算そのものを検証するにはこちらを読む。
   */
  get peakConnectionCount(): number {
    return this.#pool.peakSize;
  }

  /**
   * `warmUpRouting` がブートストラップ用のインデクサ接続を同じ予算の中で
   * 開けるようにする公開口 —— 別系統の `connect()` を持たせると、予算を
   * 別々に数えることになり接続上限が意味を失う。
   */
  get pool(): ConnectionPool {
    return this.#pool;
  }

  /**
   * `createSection` は `store` を別途受け取らず、常にこの manager の
   * store を使う —— 別の store を渡す余地を型の時点で無くすため。
   */
  get store(): EventStore {
    return this.#options.store;
  }

  /**
   * 手動再試行。プールへ委譲するだけでは足りない —— degraded で外れた
   * URL は `#drop` で消えて `retryNow()` のループに届かないので、必ず
   * `#runReplan()` も呼ぶ。保留中のバッチタイマーも畳み、二重 replan を防ぐ。
   */
  retryNow(): void {
    this.#pool.retryNow();
    this.#runReplan();
    if (this.#degradedReplanTimer !== null) {
      this.#scheduler.clearTimeout(this.#degradedReplanTimer);
      this.#degradedReplanTimer = null;
    }
  }

  /**
   * リレーごとに分けるのは「どのリレーが」が判断材料になるため。
   * 内部の Map はコピーで返す (`SectionReader.items` と同じ規約)。
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

    // 再入で遅延された場合 entry.plan はまだ EMPTY_PLAN のことがある ——
    // 正しい計画はすぐ onPlanChanged で届くので、ここで false に落として
    // 以後を正当な通知として扱う。
    const initialPlan = entry.plan;
    entry.pendingInitialDelivery = false;

    return {
      initialPlan,
      close: () => this.#close(entry),
    };
  }

  /**
   * 一度きりの取得。指定 (省略時は fallbackRelays) 全リレーが EOSE/CLOSED
   * を報告するか `timeoutMs` 経過で解決し、購読を閉じる —— イベントは
   * store にあり戻り値では返さない。ページネーションと予算迂回は持たない。
   */
  async fetchOnce(
    filters: RelayFilter[],
    options?: { relays?: RelayUrl[]; timeoutMs?: number },
  ): Promise<void> {
    const urls =
      options?.relays ?? this.#options.fallbackRelays ?? FALLBACK_RELAYS;
    const open = new Map<RelayUrl, PooledSubscription>();
    await collect(
      this.#pool,
      urls,
      filters,
      this.#options.store,
      options?.timeoutMs ?? DEFAULT_FETCH_ONCE_TIMEOUT_MS,
      open,
      { onUnrequested: (url) => this.#recordUnrequested(url) },
    );
  }

  /**
   * 登録済みセクションの需要を大域でプールし直し、選択・割り当てをやり
   * 直す。`subscribe()`/`handle.close()` は自動で呼ぶが、それ以外の需給
   * 変化 (ルーティング変更など) は呼び出し側の責任 —— 唯一の例外が
   * degraded 集合の出入りで、これだけは `#offDegraded` 経由でマネージャ
   * 自身が起こす (`#scheduleDegradedReplan` 参照)。
   */
  replan(): void {
    this.#runReplan();
  }

  /**
   * degraded 集合の出入り (両方向) を受けて呼ばれる。バッチであり
   * デバウンスではない —— デバウンスだと出入りが窓より短い間隔で続く限り
   * replan が永久に起きないため。`#runReplan()` を直接呼ぶのは
   * `subscribe()`/`#close()` と同じ再入ガードを経由するため。
   */
  #scheduleDegradedReplan(): void {
    if (this.#degradedReplanTimer !== null) return;
    this.#degradedReplanTimer = this.#scheduler.setTimeout(() => {
      this.#degradedReplanTimer = null;
      this.#runReplan();
    }, DEGRADED_REPLAN_BATCH_MS);
  }

  dispose(): void {
    // pool の通知購読とバッチタイマーを真っ先に断つ —— 後始末の順序に
    // 依存しない形にしておく。
    this.#offDegraded();
    if (this.#degradedReplanTimer !== null) {
      this.#scheduler.clearTimeout(this.#degradedReplanTimer);
      this.#degradedReplanTimer = null;
    }
    // #pool.dispose() より前に全エントリを閉じる —— FakeRelayConnection の
    // close() は onClosed を同期的に配るため、先に立てないと dispose 済み
    // のセクションへ onRelayUnreachable が届いてしまう。
    for (const entry of this.#entries.values()) entry.closed = true;
    this.#pool.dispose();
    // 生きている handle が孤児化しても close() は無害な no-op になるが、
    // エントリの登録は丸ごと捨てる —— 捨てないと replan() がこれを生きた
    // セクションとして扱い、再接続してしまう。
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
        // 黙って捨てると「どこも見ていないのに settled」になるので、
        // 到達不能だったものとして報告する。
        delivery.onRelayUnreachable(raw);
      }
    }
    return normalized;
  }

  #close(entry: SectionEntry): void {
    if (entry.closed) return;
    entry.closed = true;
    this.#entries.delete(entry.id);

    // dispose() が挟まっていれば close() 自身が無害な no-op として検出する。
    for (const [, open] of entry.opened) {
      open.subscription.close();
    }
    entry.opened.clear();

    // 解放した予算を他のセクションが受け取れるよう、必ず replan() する。
    this.replan();
  }

  /** `#replanOnce()` への一本化された入口。再入時は実行を遅延する。 */
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
          // 収束しなかった —— ハングさせるより打ち切って報告する方が安全。
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
   * 配信コールバックを孤立させて呼ぶ。`#replanOnce` は複数エントリを 1 つの
   * for ループで処理するので、無防備に呼ぶと 1 エントリの例外で残りが
   * 古い計画のまま取り残される。
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
   * 1 回だけ行う (手順は各ステップのコメント参照)。`#entries` のスナップ
   * ショットを先頭で 1 回だけ取る —— ライブな Map を反復すると、差分適用
   * が引き起こす同期コールバックで新規登録されたエントリまで、この巡の
   * stale な selection で処理してしまう。
   */
  #replanOnce(): void {
    const fallbackRelays = this.#options.fallbackRelays ?? FALLBACK_RELAYS;
    const budget = this.#options.maxConnections ?? MAX_CONNECTIONS;
    const redundancy = this.#options.redundancy ?? RELAY_REDUNDANCY;

    const entries = [...this.#entries.values()];

    // 1. 大域の需要。writeRelaysFor は毎回パースをやり直すので著者ごとに 1 回だけ呼ぶ。
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

    // 2. pinned。明示指定を先に確保してから fallback を足す —— budget が
    // 小さいとき fallback が明示指定を押し出さないため。
    const pinnedSet = new Set<RelayUrl>();
    for (const entry of entries) {
      if (entry.explicitRelays === undefined) continue;
      for (const url of entry.explicitRelays) pinnedSet.add(url);
    }
    for (const url of fallbackRelays) pinnedSet.add(url);
    const pinned = [...pinnedSet];

    // 粘着性のため選び直し前に集める —— 差分適用で状態が変わるので選択前に読む。
    const currentSet = new Set<RelayUrl>();
    for (const entry of entries) {
      for (const url of entry.opened.keys()) currentSet.add(url);
    }
    const current = [...currentSet];

    // 3. 大域で 1 回だけ選ぶ。degraded は pool から直接読む (専用の seam は足さない)。
    const selection = selectRelays({
      demand,
      pinned,
      current,
      budget,
      redundancy,
      degraded: this.#pool.degradedRelays,
    });

    // 4-6. エントリごとに割り当て、差分適用し、変わったものだけ通知する
    for (const entry of entries) {
      // スナップショット後に close() されたエントリは触らない (#close() 済み)。
      if (entry.closed) continue;

      let perRelay: Map<RelayUrl, RelayFilter[]>;
      let unroutableAuthors = 0;
      let uncoveredAuthors = 0;

      if (entry.explicitRelays !== undefined) {
        // 明示リレーは選択を経由しない —— ユーザーが名指ししたリレーを
        // 予算都合で落とさないため。
        perRelay = new Map();
        for (const url of entry.explicitRelays) {
          // 配列を共有すると一方への変更が他方に漏れるので、リレーごとに分ける。
          perRelay.set(url, [...entry.filters]);
        }
      } else {
        const assignment = new Map<string, readonly RelayUrl[]>();
        for (const filter of entry.filters) {
          for (const author of filter.authors ?? []) {
            if (assignment.has(author)) continue;
            const assigned = selection.assignment.get(author);
            // demand に無い著者は selection.assignment にも無く、
            // planQuery 側で unroutableAuthors に回る。
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
      // suppressCallback は handle 未返却の間だけ真 —— 再入で遅延された
      // 巡はもう返却済みなので、ここで正しく通知される。
      if (changed) this.#deliver(() => entry.delivery.onPlanChanged(newPlan));
    }
  }

  /**
   * `entry.opened` (前回) と `perRelay` (今回) を差分する —— filters が
   * 変わったリレーだけ同じ接続の上で張り直す。全部張り直すと phase が
   * streaming へ毎回巻き戻るため。`pool.subscribe()` は同期的に
   * `handlers.onClosed` を呼ぶことがあるので、書き込む前に必ず
   * `entry.closed` を確認する。
   */
  #applyEntryDiff(
    entry: SectionEntry,
    perRelay: Map<RelayUrl, RelayFilter[]>,
  ): void {
    for (const [url, open] of [...entry.opened]) {
      if (perRelay.has(url)) continue;
      open.subscription.close();
      entry.opened.delete(url);
    }

    // 需要から外れた URL の拒否記録も忘れる —— 戻れば新しい遷移として扱う。
    for (const url of [...entry.refused]) {
      if (!perRelay.has(url)) entry.refused.delete(url);
    }

    for (const [url, relayFilters] of perRelay) {
      const open = entry.opened.get(url);
      if (open && filtersEqual(open.filters, relayFilters)) continue; // 変化なし = 触らない

      if (open) {
        // filters (担当著者) が変わった —— URL だけで判定すると古い REQ の
        // まま購読し続け、settled 報告と実態がずれる隠れた劣化になる。
        // 新しい購読を先に開いてから古い方を閉じる —— 逆順だと pool 側の
        // entries が一瞬 0 になり、接続ごと落ちてしまう。
        this.#deliver(() => entry.delivery.onRelayRestarted(url));
        const pooled = this.#pool.subscribe(
          url,
          relayFilters,
          this.#handlersFor(entry, url, relayFilters),
        );
        open.subscription.close();
        if (entry.closed) {
          // onRelayRestarted が同期的にこのセクションを閉じ、entry.opened
          // は既に空 —— ここで書き込むと孤立ソケットになる。
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
          // 直前まで自分の枠を握っていたので実質起こらないが、万一に備える。
          entry.opened.delete(url);
          entry.refused.add(url);
          this.#deliver(() => entry.delivery.onRelayUnreachable(url));
        }
        continue;
      }

      const pooled = this.#pool.subscribe(
        url,
        relayFilters,
        this.#handlersFor(entry, url, relayFilters),
      );
      if (entry.closed) {
        // onClosed -> onRelayUnreachable がこのセクションを同期的に閉じた
        // (restart 分岐と同じ理由で、entry.opened へ書き込んではいけない)。
        pooled?.close();
        return;
      }
      if (pooled) {
        entry.opened.set(url, { subscription: pooled, filters: relayFilters });
        entry.refused.delete(url);
      } else {
        // budget 切れで丸ごと拒否 (接続を試みていないので onClosed は発火
        // しない) —— 拒否状態への遷移のときだけ報告し、無限ループを防ぐ。
        if (!entry.refused.has(url)) {
          entry.refused.add(url);
          this.#deliver(() => entry.delivery.onRelayUnreachable(url));
        }
      }
    }
  }

  /**
   * `filters` を実行時に `entry.opened` から引かずクロージャで捕捉する ——
   * REQ を差し替えるときは必ず新しいハンドラが作られるので、古い REQ が
   * 新しいフィルタで判定される余地が構造的に消える。
   */
  #handlersFor(
    entry: SectionEntry,
    url: RelayUrl,
    filters: RelayFilter[],
  ): RelaySubscriptionHandlers {
    return {
      onEvent: (event) => {
        if (entry.closed) return;
        // 信頼境界。署名検証は*偽造*を止めるが*混入*は止めないので、
        // store.put() より前に置き、洪水対策を文字列比較で済ませる。
        if (!matchesAnyFilter(event, filters)) {
          this.#recordUnrequested(url);
          return;
        }
        const result = this.#options.store.put(event, url);
        // "rejected" は配信しないが "hidden" は配信する —— 削除の取り消し時に
        // SectionReader が同じ場所へ戻せるよう id を必要とするため。
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
