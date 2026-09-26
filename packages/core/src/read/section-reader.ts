import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventStore, EventStoreChange } from "./event-store";
import { SortedEvents, compareEvents } from "./sorted-events";
import {
  MAX_ITEMS_PER_SECTION,
  MAX_PAGED_ITEMS,
  type NostrSource,
  type Order,
  type Paging,
  type SectionStatus,
} from "./source";
import type {
  SectionHandle,
  SectionPlan,
  SubscriptionManager,
} from "./subscription-manager";

/**
 * 通知をまとめる窓。60fps の 1 フレーム。「操作の画面反映 100ms」
 * に対して十分小さい。
 */
const NOTIFY_BATCH_MS = 16;
const DELETION_KIND = 5;
/**
 * 最初のページを待つ時間の上限。EOSE を返さないリレーが 1 本でもあると、全リレーが
 * 揃うのを待つだけでは古い投稿をいつまでも取り足せない。
 */
export const FIRST_PAGE_WAIT_MS = 5000;

export type SectionReaderOptions = {
  source: NostrSource;
  order: Order;
  store: EventStore;
  /** 接続と購読は manager が所有する */
  manager: SubscriptionManager;
  /**
   * 通知バッチのタイマー注入口 (テスト用)。既定は実タイマー ——
   * 「注入されなければ実タイマー」の規約を一箇所に集約する。
   */
  scheduler?: Scheduler;
  /**
   * 指定すると、最初はこの件数だけ取り（購読の filters に `limit` を付ける）、
   * `loadOlder()` のたびに同じ件数ずつ古いものを取り足す。指定しなければ、
   * 今までどおり `MAX_ITEMS_PER_SECTION` まで持つ（人の一覧のように、切ると
   * 意味が変わるもの）。
   */
  pageSize?: number;
  /**
   * ページ送りしないセクションが持つ件数の上限。既定は `MAX_ITEMS_PER_SECTION`。
   * 件数で切ると中身の意味が変わる一覧（すべてのチャンネル）は、取るものの
   * `limit` で量を抑えたうえで `Infinity` にする。受け取ったイベントはどのみち
   * `EventStore` に入るので、上限を外しても持つ量はほとんど増えない。
   */
  maxItems?: number;
  /**
   * `pageSize` と一緒に指定すると、最初にこの件数まで取る（`MAX_PAGED_ITEMS` まで）。
   * 取る中身が変わって作り直すとき、それまで伸ばした一覧を 1 ページに戻さないため。
   */
  initialSize?: number;
};

type RelayState = {
  complete: boolean;
  unreachable: boolean;
};

export class SectionReader {
  readonly #options: SectionReaderOptions;
  readonly #listeners = new Set<() => void>();
  readonly #events: SortedEvents;
  #paging: Paging = "idle";
  /**
   * 最初のページが揃ったか（全リレーの EOSE か、待つ時間の上限）。一度揃ったら戻さない。
   * 後からリレーが増えたり張り直されたりしても、すでに並んでいる一覧は最初のページのままなので。
   */
  #ready = false;
  #firstPageTimer: ReturnType<Scheduler["setTimeout"]> | null = null;
  /** このセクションへ配信されたが、NIP-09 により現在は隠れている id。 */
  readonly #hiddenMembers = new Set<string>();
  #relays = new Map<RelayUrl, RelayState>();
  // start() が initialPlan で埋める。onPlanChanged が同期的に先に埋めた
  // 場合は null のときだけ適用して上書きを避ける。
  #plan: SectionPlan | null = null;
  #handle: SectionHandle | null = null;
  #offStore: (() => void) | null = null;
  #started = false;
  readonly #scheduler: Scheduler;
  #notifyTimer: ReturnType<Scheduler["setTimeout"]> | null = null;

  constructor(options: SectionReaderOptions) {
    this.#options = options;
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#events = new SortedEvents(
      this.#firstPageSize ?? options.maxItems ?? MAX_ITEMS_PER_SECTION,
    );
  }

  /** 最初に取る件数。ページ送りしないセクションでは無い。 */
  get #firstPageSize(): number | undefined {
    const { pageSize, initialSize } = this.#options;
    if (pageSize === undefined) return undefined;
    return Math.min(Math.max(pageSize, initialSize ?? 0), MAX_PAGED_ITEMS);
  }

  get paging(): Paging {
    if (this.#options.pageSize === undefined) return "exhausted";
    if (this.#paging === "idle" && !this.#isReady()) return "waiting";
    return this.#paging;
  }

  #isReady(): boolean {
    if (!this.#ready && this.status.phase === "settled") this.#ready = true;
    return this.#ready;
  }

  /**
   * 今いちばん古い投稿より前を、1 ページぶん取り足す。取っている間・もう無いとき・
   * まだ 1 件も無いときは何もしない。上限（`MAX_PAGED_ITEMS`）に着いたら、それ以上は
   * 取らない。
   */
  loadOlder(): void {
    const pageSize = this.#options.pageSize;
    const handle = this.#handle;
    const oldest = this.#events.last;
    if (!pageSize || !handle || !oldest || this.#paging !== "idle") return;
    // 最初のページが揃うまでは取り足さない。揃う前は一覧が短く、下端がすぐ見えるので、
    // 届きかけの途中から古い方を取り始めてしまう。
    if (!this.#isReady()) return;
    if (this.#events.capacity >= MAX_PAGED_ITEMS) {
      this.#paging = "exhausted";
      this.#notify();
      return;
    }
    this.#events.grow(
      Math.min(this.#events.capacity + pageSize, MAX_PAGED_ITEMS),
    );
    this.#paging = "loading";
    this.#notify();
    const before = this.#events.size;
    // until は含む（同じ秒の投稿を取りこぼさない）。重なった分は id で弾かれる。
    void handle
      .fetchOlder({ until: oldest.created_at, limit: pageSize })
      .then(
        () => this.#events.size > before,
        () => false,
      )
      .then((grew) => {
        // 取っている間に止めた・作り直した（別の handle になった）なら何もしない。
        if (this.#handle !== handle) return;
        this.#paging = grew ? "idle" : "exhausted";
        this.#notify();
      });
  }

  get items(): NostrEvent[] {
    return this.#displayOrdered(this.#events.toArray());
  }

  get status(): SectionStatus {
    const states = [...this.#relays.values()];
    const unreachableRelays = states.filter((r) => r.unreachable).length;
    const live = states.filter((r) => !r.unreachable);
    const allSettled = this.#started && live.every((r) => r.complete);

    const phase: SectionStatus["phase"] = allSettled
      ? "settled"
      : this.#events.size > 0
        ? "streaming"
        : "initial";

    const unroutableAuthors = this.#plan?.unroutableAuthors ?? 0;
    const uncoveredAuthors = this.#plan?.uncoveredAuthors ?? 0;
    return unreachableRelays > 0 ||
      unroutableAuthors > 0 ||
      uncoveredAuthors > 0
      ? {
          phase,
          incomplete: {
            unreachableRelays,
            unroutableAuthors,
            uncoveredAuthors,
          },
        }
      : { phase };
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;

    const { source, manager, store } = this.#options;
    // manager.subscribe() は同期的にイベントを配送しうる。先に Store の変化を
    // 購読し、配信と削除依頼の間に hide/show を取りこぼす窓を作らない。
    this.#offStore = store.subscribe((change) => this.#onStoreChange(change));
    const pageSize = this.#firstPageSize;
    // 最初は 1 ページぶんだけ取る。limit を持つ filter（最新の 1 件だけを取る kind:3
    // など）はそのまま。
    const filters =
      pageSize === undefined
        ? source.filters
        : source.filters.map((filter) =>
            filter.limit === undefined
              ? { ...filter, limit: pageSize }
              : filter,
          );
    if (pageSize !== undefined) {
      this.#firstPageTimer = this.#scheduler.setTimeout(() => {
        this.#firstPageTimer = null;
        this.#ready = true;
        this.#notify();
      }, FIRST_PAGE_WAIT_MS);
    }
    this.#handle = manager.subscribe(filters, source.relays, {
      onEvent: (id, relay) => this.#onEvent(id, relay),
      onRelayComplete: (relay) => {
        // 再接続後の EOSE の可能性もあるので unreachable も一緒に晴らす。
        // 専用の「復帰」コールバックは無い — onRelayComplete がそれを兼ねる。
        const state = this.#relayState(relay);
        state.complete = true;
        state.unreachable = false;
        this.#notify();
      },
      onRelayUnreachable: (relay) => {
        this.#relayState(relay).unreachable = true;
        this.#notify();
      },
      onPlanChanged: (plan) => this.#applyPlan(plan),
      onRelayRestarted: (relay) => {
        // REQ だけ張り直されたので complete/unreachable を両方まっさらに
        // 戻す。onRelayUnreachable は代用しない —— あちらは接続失敗を意味し
        // incomplete を押し上げてしまう。
        this.#relays.set(relay, { complete: false, unreachable: false });
        this.#notify();
      },
    });

    // #applyPlan は使わない: 初期適用は「不足分を足す」マージで、張り直しの
    // 「丸ごと置き換え」とは違う。subscribe() が正規化失敗 URL を
    // onRelayUnreachable で同期的に報告し、initialPlan に載らない
    // unreachable な記録を作ることがあるため、それを消してはいけない。
    if (this.#plan === null) {
      this.#plan = this.#handle.initialPlan;
      for (const relay of this.#plan.relays) this.#relayState(relay);
    }
    // #relayState() 直接呼び出しは #notify() を経由しないため、start() 内で
    // 一度も #notify() が呼ばれない経路 (全リレー健在で同期発火なし) を
    // 拾うために念押しする。バッチ化により何度呼んでも安全。
    this.#notify();
  }

  /**
   * リレー集合の張り直し。既存リレーは RelayState を使い回し (EOSE 済みを
   * 再度待たせない)、旧計画だけのものは捨て新計画だけのものは新規に始める。
   */
  #applyPlan(plan: SectionPlan): void {
    this.#plan = plan;
    const next = new Map<RelayUrl, RelayState>();
    for (const relay of plan.relays) {
      next.set(
        relay,
        this.#relays.get(relay) ?? { complete: false, unreachable: false },
      );
    }
    this.#relays = next;
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
    this.#offStore?.();
    this.#offStore = null;
    this.#relays = new Map();
    this.#plan = null;
    this.#started = false;
    this.#paging = "idle";
    this.#ready = false;
    if (this.#firstPageTimer !== null) {
      this.#scheduler.clearTimeout(this.#firstPageTimer);
      this.#firstPageTimer = null;
    }
    this.#events.clear();
    this.#hiddenMembers.clear();
    if (this.#notifyTimer !== null) {
      this.#scheduler.clearTimeout(this.#notifyTimer);
      this.#notifyTimer = null;
    }
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #onEvent(id: string, _relay: RelayUrl): void {
    if (this.#events.has(id) || this.#hiddenMembers.has(id)) return;
    if (this.#options.store.isHidden(id)) {
      this.#hiddenMembers.add(id);
      return;
    }
    // 本体は EventStore が持つ。ここに載せるのは検証済みのコピー
    const stored = this.#options.store.get(id);
    if (!stored) return;
    // kind:5 は同じ購読で取得して EventStore へ適用するが、カラム自身の
    // メンバーではない。削除依頼カードとして表示上限を消費させない。
    if (stored.kind === DELETION_KIND) return;

    // 最初のページが揃った後に届いた新しい投稿は、上限を広げて入れる。広げないと、
    // 読んでいる一覧の古い方が新しい投稿に押し出されて消える。
    const head = this.#events.first;
    if (
      this.#options.pageSize !== undefined &&
      head &&
      compareEvents(stored, head) < 0 &&
      this.#isReady()
    ) {
      this.#events.grow(Math.min(this.#events.size + 1, MAX_PAGED_ITEMS));
    }

    // 上限に達した状態で保持順の末尾より後ろに来たイベントは採用されない。
    // その場合は画面に何の変化も無いので、通知も積まない。
    if (!this.#events.add(stored)) return;

    this.#notify();
  }

  #onStoreChange(change: EventStoreChange): void {
    switch (change.type) {
      case "hide":
        if (!this.#events.remove(change.event.id)) return;
        this.#hiddenMembers.add(change.event.id);
        this.#notify();
        return;
      case "show":
        if (!this.#hiddenMembers.delete(change.event.id)) return;
        if (this.#events.add(change.event)) this.#notify();
        return;
      case "remove":
        this.#hiddenMembers.delete(change.event.id);
        if (this.#events.remove(change.event.id)) this.#notify();
        return;
      case "insert":
        // セクションへの所属は SubscriptionManager の配信だけが決める。
        return;
    }
  }

  /**
   * 保持順から表示順を導く。`reverse()` や符号反転は tie-break の向きまで
   * 反転するので使わない —— `created_at` だけ反転し tie-break は
   * `compareEvents` のまま使う (破壊的ソートなので新しいコピー前提)。
   */
  #displayOrdered(events: NostrEvent[]): NostrEvent[] {
    if (this.#options.order !== "created-at-asc") return events;
    return events.sort(
      (a, b) => a.created_at - b.created_at || compareEvents(a, b),
    );
  }

  /**
   * 通知をまとめる。**デバウンスではなくバッチ** —— 張り直す実装だと発火
   * し続けるイベントで通知が永久に起きない。リレーは 1 メッセージ 1 イベン
   * ト (NIP-01) でメッセージごとに別タスクなのでマクロタスク境界で畳む。
   */
  #notify(): void {
    if (this.#notifyTimer !== null) return;
    this.#notifyTimer = this.#scheduler.setTimeout(() => {
      this.#notifyTimer = null;
      this.#emit();
    }, NOTIFY_BATCH_MS);
  }

  #emit(): void {
    // 1 つの listener が投げても後続の listener への通知を巻き込まない
    // ように隔離する。専用の報告チャネルが無いので console.error に落とす
    // —— 主目的は隔離であって報告ではない。
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch (error) {
        console.error(
          "SectionReader: a listener threw during notify(); isolating it so other listeners keep receiving updates.",
          error,
        );
      }
    }
  }
}
