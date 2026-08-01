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
} from "./connection-pool";
import {
  FALLBACK_RELAYS,
  MAX_CONNECTIONS,
  RELAY_REDUNDANCY,
} from "./default-relays";
import type { EventStore } from "./event-store";
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

  constructor(options: SubscriptionManagerOptions) {
    this.#options = options;
    this.#pool = new ConnectionPool({
      connect: options.connect,
      maxConnections: options.maxConnections,
      scheduler: options.scheduler,
      random: options.random,
    });
  }

  get connectionCount(): number {
    return this.#pool.size;
  }

  /** 手動再試行 (ADR-0021)。プールへそのまま委譲する。 */
  retryNow(): void {
    this.#pool.retryNow();
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
      do {
        this.#dirty = false;
        this.#replanOnce();
      } while (this.#dirty);
    } finally {
      this.#replanning = false;
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
      if (changed) entry.delivery.onPlanChanged(newPlan);
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
        entry.delivery.onRelayRestarted(url);
        const pooled = this.#pool.subscribe(
          url,
          relayFilters,
          this.#handlersFor(entry, url),
        );
        open.subscription.close();
        if (pooled) {
          entry.opened.set(url, {
            subscription: pooled,
            filters: relayFilters,
          });
        } else {
          // 上の理屈により、既に開いていたリレーの張り直しがここで拒否
          // されるのは実質起こらない (直前まで自分の分の枠を握っていた) が、
          // 万一 (他エントリの close() などとの絡み) 起きても total に保つ。
          entry.opened.delete(url);
          entry.delivery.onRelayUnreachable(url);
        }
        continue;
      }

      // 新規。
      const pooled = this.#pool.subscribe(
        url,
        relayFilters,
        this.#handlersFor(entry, url),
      );
      if (pooled) {
        entry.opened.set(url, { subscription: pooled, filters: relayFilters });
      } else {
        // pool 側が budget 切れで丸ごと拒否した (undefined) — 接続を試み
        // てすらいないので pool の onClosed は発火しない。ここで直接報告
        // する必要がある。
        entry.delivery.onRelayUnreachable(url);
      }
    }
  }

  #handlersFor(entry: SectionEntry, url: RelayUrl): RelaySubscriptionHandlers {
    return {
      onEvent: (event) => {
        if (entry.closed) return;
        if (this.#options.store.put(event, url) === "rejected") return;
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
