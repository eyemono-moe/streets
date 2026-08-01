import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
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
};

type PooledConnection = {
  connection: RelayConnection;
  refCount: number;
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
  /** 直近の replan() が実際に開いている購読 */
  opened: Map<RelayUrl, RelaySubscription>;
  plan: SectionPlan;
  /** #replan() が一度でもこのエントリに計画を適用したか。初回は
   * onPlanChanged を呼ばない (呼び出し側がまだ handle を持っていない) */
  applied: boolean;
  /** dispose() 後の孤児化を検出するための世代 (下記コメント参照) */
  readonly generation: number;
  closed: boolean;
};

const EMPTY_PLAN: SectionPlan = {
  relays: [],
  unroutableAuthors: 0,
  uncoveredAuthors: 0,
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
  readonly #pool = new Map<RelayUrl, PooledConnection>();
  readonly #entries = new Map<number, SectionEntry>();
  #nextEntryId = 0;
  // dispose() が孤児化させる SectionHandle を無効化するための世代カウンタ。
  // handle (経由でエントリ) は生成時の世代を覚えておき、close() 時点で現在の
  // 世代と食い違っていたらプールに触れない。世代が進んでいるということは、
  // dispose() で pool と #entries が丸ごと作り直された後だということ —
  // そのエントリが握っていた url は同じ文字列でも「別の接続」を指しうるので、
  // 素朴に #release すると dispose() 後に新しく張り直された接続を誤って
  // 閉じてしまう。dispose() は #entries も空にするので、この食い違いが
  // 起きるのは「dispose() 以前に作られた handle がまだ生きていて、その後で
  // close() を呼ばれる」場合だけに限られる — replan() が古いエントリを
  // 誤って対象にすることはない。
  #generation = 0;

  constructor(options: SubscriptionManagerOptions) {
    this.#options = options;
  }

  get connectionCount(): number {
    return this.#pool.size;
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
      applied: false,
      generation: this.#generation,
      closed: false,
    };
    this.#entries.set(entry.id, entry);

    try {
      this.#replan();
    } catch (error) {
      this.#entries.delete(entry.id);
      throw error;
    }

    return {
      initialPlan: entry.plan,
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
    this.#replan();
  }

  dispose(): void {
    for (const pooled of this.#pool.values()) pooled.connection.close();
    this.#pool.clear();
    // 生きている handle が孤児化しても新しい世代の接続を誤って掴めないよう、
    // エントリの登録も丸ごと捨てる。エントリだけ残して opened を空にする案も
    // 検討したが、そうすると後段の replan() がその「もう存在しない」エントリ
    // を生きたセクションとして扱い、需要をもう一度プールして再接続してしまう
    // — dispose() 後に呼ばれた handle.close() がその再接続分の refCount を
    // 誰も #release しないまま孤児化させる (このタスクの設計で新たに発見した
    // 罠なので明示的に避けている)。
    this.#entries.clear();
    this.#generation += 1;
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

    // dispose() が挟まっていたら、このエントリが握っていた接続はもう pool
    // にいない (dispose() が #entries ごと作り直した)。触らずに無視する —
    // 触ると新しい世代の接続を誤って閉じかねない。
    if (entry.generation === this.#generation) {
      for (const [url, subscription] of entry.opened) {
        subscription.close();
        this.#release(url);
      }
    }
    entry.opened.clear();

    // 閉じたセクション自身には onPlanChanged を呼ばない (もう handle を
    // 誰も持っていない)。他のセクションは、このセクションが解放した予算を
    // 受け取れるかもしれないので、必ず replan() し直す。
    this.replan();
  }

  /**
   * 登録済み全エントリの需要を 1 つにプールし、選択・割り当て・張り直しを
   * 行う。ブリーフの「構造」節そのままの手順:
   *
   * 1. 大域の需要を作る (著者 → routing.writeRelaysFor(author))
   * 2. pinned を作る (fallback + 全エントリの明示リレー)
   * 3. selectRelays を 1 回だけ呼ぶ
   * 4. エントリごとに perRelay を組む (明示指定はバイパス)
   * 5. エントリごとに前回の opened と差分する
   * 6. 計画が変わったエントリにだけ onPlanChanged を呼ぶ
   */
  #replan(): void {
    const fallbackRelays = this.#options.fallbackRelays ?? FALLBACK_RELAYS;
    const budget = this.#options.maxConnections ?? MAX_CONNECTIONS;
    const redundancy = this.#options.redundancy ?? RELAY_REDUNDANCY;

    // 1. 大域の需要。著者ごとに writeRelaysFor を 1 回だけ呼ぶ
    // (RoutingTable は呼ぶたびに kind:10002 のパースをやり直すので、
    // 著者数 × エントリ数だけ走らせない)。
    const demand = new Map<string, readonly RelayUrl[]>();
    const seenAuthors = new Set<string>();
    for (const entry of this.#entries.values()) {
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
    for (const entry of this.#entries.values()) {
      if (entry.explicitRelays === undefined) continue;
      for (const url of entry.explicitRelays) pinnedSet.add(url);
    }
    for (const url of fallbackRelays) pinnedSet.add(url);
    const pinned = [...pinnedSet];

    // 粘着性のため、選び直し前に「いま開いているリレー」を集める。
    // 差分適用でこの後の状態が変わっていくので、必ず選択の前に読む。
    const currentSet = new Set<RelayUrl>();
    for (const entry of this.#entries.values()) {
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
    for (const entry of this.#entries.values()) {
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

      const isFirstApplication = !entry.applied;
      this.#applyEntryDiff(entry, perRelay);

      const newPlan: SectionPlan = {
        relays: [...perRelay.keys()],
        unroutableAuthors,
        uncoveredAuthors,
      };
      const changed =
        !isFirstApplication && !this.#planEqual(entry.plan, newPlan);
      entry.plan = newPlan;
      entry.applied = true;
      // subscribe() の中では呼ばない (呼び出し側がまだ handle を持っていない
      // — isFirstApplication が真なのでここには来ない)。
      if (changed) entry.delivery.onPlanChanged(newPlan);
    }
  }

  /**
   * `entry.opened` (前回張った購読) と `perRelay` (今回の計画) を差分する。
   * 消えたリレーは購読を閉じて release、増えたリレーは購読を開く、
   * 両方にあるものは触らない。
   *
   * ここで全部張り直すと、両方の計画が保持しているリレーの購読までいったん
   * 閉じて開き直すことになり、そのセクションの phase が settled から
   * streaming へ巻き戻る。カラムを 1 本足すたびに他の全カラムでこれが起きる
   * ── 差分こそが張り直しを安く保っている部分。
   */
  #applyEntryDiff(
    entry: SectionEntry,
    perRelay: Map<RelayUrl, RelayFilter[]>,
  ): void {
    // 消えたリレーを閉じる
    for (const [url, subscription] of [...entry.opened]) {
      if (perRelay.has(url)) continue;
      subscription.close();
      this.#release(url);
      entry.opened.delete(url);
    }

    // 増えたリレーを開く。#acquire が成功した時点で pool の refCount は
    // 上がっている。その直後の connection.subscribe() が投げた場合、その url
    // は entry.opened にはまだ積まれていない — addedUrls だけを見て release
    // すれば、subscribe() が投げても acquire 済みの refCount が孤児化しない。
    const addedUrls: RelayUrl[] = [];
    try {
      for (const [url, relayFilters] of perRelay) {
        if (entry.opened.has(url)) continue; // 両方にある = 触らない
        const connection = this.#acquire(url);
        addedUrls.push(url);
        const subscription = connection.subscribe(
          relayFilters,
          this.#handlersFor(entry, url),
        );
        entry.opened.set(url, subscription);
      }
    } catch (error) {
      for (const url of addedUrls) {
        entry.opened.get(url)?.close();
        entry.opened.delete(url);
        this.#release(url);
      }
      throw error;
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

  #planEqual(a: SectionPlan, b: SectionPlan): boolean {
    if (a.unroutableAuthors !== b.unroutableAuthors) return false;
    if (a.uncoveredAuthors !== b.uncoveredAuthors) return false;
    if (a.relays.length !== b.relays.length) return false;
    const relaysA = new Set(a.relays);
    return b.relays.every((url) => relaysA.has(url));
  }

  #acquire(url: RelayUrl): RelayConnection {
    const pooled = this.#pool.get(url);
    if (pooled) {
      pooled.refCount += 1;
      return pooled.connection;
    }
    const connection = this.#options.connect(url);
    this.#pool.set(url, { connection, refCount: 1 });
    return connection;
  }

  #release(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    pooled.refCount -= 1;
    if (pooled.refCount > 0) return;
    pooled.connection.close();
    this.#pool.delete(url);
  }
}
