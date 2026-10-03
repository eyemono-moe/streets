import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventStore, EventStoreChange } from "./event-store";
import { nextOlder } from "./older-page";
import { SortedEvents, compareEvents } from "./sorted-events";
import {
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
   * `loadOlder()` のたびに同じ件数ずつ古いものを取り足す。取り足す回数に上限は
   * 無い。指定しなければ、届いたものをすべて持つ（人の一覧のように、切ると意味が
   * 変わるもの）。
   */
  pageSize?: number;
  /**
   * ページ送りしないセクションが持つ件数の上限。既定は上限なし。候補を数件だけ
   * 見せる一覧（入力の補完など）のように、呼ぶ側が見せる数を決めているときに使う。
   */
  maxItems?: number;
  /**
   * `pageSize` と一緒に指定すると、最初にこの件数まで取る。
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
  /**
   * 最初のページで、リレーごとに受け取ったいちばん古い `created_at`。次に取る `until` を
   * 決めるのに使う（`nextOlder`）。
   */
  readonly #firstPageOldest = new Map<RelayUrl, number>();
  /** 次に取る `until`。まだ一度も取り足していなければ無く、最初のページから決める。 */
  #until: number | undefined;
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
      this.#firstPageSize ?? options.maxItems ?? Number.POSITIVE_INFINITY,
    );
  }

  /** 最初に取る件数。ページ送りしないセクションでは無い。 */
  get #firstPageSize(): number | undefined {
    const { pageSize, initialSize } = this.#options;
    if (pageSize === undefined) return undefined;
    return Math.max(pageSize, initialSize ?? 0);
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
   * まだ 1 件も無いときは何もしない。取れなかった（`failed`）後に呼ぶと、同じところを取り直す。
   */
  loadOlder(): void {
    const pageSize = this.#options.pageSize;
    const handle = this.#handle;
    const oldest = this.#events.last;
    if (!pageSize || !handle || !oldest) return;
    if (this.#paging !== "idle" && this.#paging !== "failed") return;
    // 最初のページが揃うまでは取り足さない。揃う前は一覧が短く、下端がすぐ見えるので、
    // 届きかけの途中から古い方を取り始めてしまう。
    if (!this.#isReady()) return;
    // 取り足す分だけ窓を広げる。窓は「新しい方から何件」で、リレーごとに違う期間の
    // 最初のページを新しい方から切りそろえ、次の `until` がどのリレーにも正しく効くようにしている。
    if (this.#paging === "idle") {
      this.#events.grow(this.#events.capacity + pageSize);
    }
    // until は含む（同じ秒の投稿を取りこぼさない）。重なった分は id で弾かれる。
    const request = {
      until: this.#until ?? this.#firstPageUntil(oldest.created_at),
      limit: pageSize,
    };
    this.#paging = "loading";
    this.#notify();
    void handle.fetchOlder(request).then(
      (page) => {
        // 取っている間に止めた・作り直した（別の handle になった）なら何もしない。
        if (this.#handle !== handle) return;
        const next = nextOlder(
          page,
          request,
          this.#events.last?.created_at ?? request.until,
        );
        this.#paging = next.paging;
        if (next.paging === "idle") this.#until = next.until;
        this.#notify();
      },
      () => {
        if (this.#handle !== handle) return;
        this.#paging = "failed";
        this.#notify();
      },
    );
  }

  /** 最初のページについて `nextOlder` と同じ考えで、取りこぼしの無い `until` を決める。 */
  #firstPageUntil(keptOldest: number): number {
    return Math.max(keptOldest, ...this.#firstPageOldest.values());
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
    this.#handle = manager.subscribe(
      filters,
      source.relays,
      {
        onEvent: (id, relay, catchup) => this.#onEvent(id, relay, catchup),
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
      },
      source.extraRelays,
    );

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
    this.#firstPageOldest.clear();
    this.#until = undefined;
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

  #onEvent(id: string, relay: RelayUrl, catchup = false): void {
    if (this.#options.pageSize !== undefined && !this.#ready) {
      this.#noteFirstPage(id, relay);
    }
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

    // 最初のページが揃った後に届いた新しい投稿は、上限を広げて入れる。
    // 復帰時の差分は新しい順で届くことがある。先頭との比較だけでは 1 件目
    // しか広がらず、残りが古い表示行を押し出すので、末尾より新しければ広げる。
    const head = this.#events.first;
    const oldest = this.#events.last;
    if (
      this.#options.pageSize !== undefined &&
      head &&
      ((catchup && oldest && compareEvents(stored, oldest) < 0) ||
        compareEvents(stored, head) < 0) &&
      this.#isReady()
    ) {
      this.#events.grow(this.#events.size + 1);
    }

    // 上限に達した状態で保持順の末尾より後ろに来たイベントは採用されない。
    // その場合は画面に何の変化も無いので、通知も積まない。
    if (!this.#events.add(stored)) return;

    this.#notify();
  }

  /** ほかのリレーから届いて一覧にすでにあるものも数える。そのリレーがどこまで返したかを知りたいので。 */
  #noteFirstPage(id: string, relay: RelayUrl): void {
    const event = this.#options.store.get(id);
    if (!event) return;
    const known = this.#firstPageOldest.get(relay);
    if (known === undefined || event.created_at < known) {
      this.#firstPageOldest.set(relay, event.created_at);
    }
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
