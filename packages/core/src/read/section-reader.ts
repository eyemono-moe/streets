import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { EventStore, EventStoreChange } from "./event-store";
import { type NewerPaging, estimateWindow, nextNewer } from "./newer-page";
import { nextOlder } from "./older-page";
import { type Scheduler, defaultScheduler } from "./scheduler";
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
  /**
   * `pageSize` と一緒に指定すると、新しい方へも取り足せる（`loadNewer()`）。source の
   * filters がどれも `until` を持つときだけ効き、その時点より新しいものを窓で取る。
   */
  pagesNewer?: boolean;
  /**
   * `pageSize` と一緒に指定すると、持つ件数をこの数までにする。1 ページぶん超えたら、
   * 見ている位置（`setAnchor`）から遠い側を捨てる。捨てた側は `loadOlder()`・
   * `loadNewer()` で取り直せる。
   */
  windowSize?: number;
};

/**
 * 一覧のどこを見ているか。`head` はいちばん新しい端、`away` はそれより奥。
 * 溢れたときに捨てる側を決める。
 */
export type Anchor = "head" | "away";

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
  /**
   * 一覧に入れてよい最新の時刻。新しい方へ取り足すたびに上がる。新しい方へ取り足さない
   * セクションでは無い。
   */
  #ceiling: number | undefined;
  #newerPaging: NewerPaging = "idle";
  /** 次に新しい方へ取る窓の幅（秒）。まだ一度も取っていなければ、一覧の密度から決める。 */
  #window: number | undefined;
  /**
   * 新しい方を取っている間に届いた、上限より新しいもの。その窓を取り切れたと分かって
   * から入れる —— 先に入れると、窓の古い側が抜けたまま新しい側が並ぶ。
   */
  readonly #heldNewer = new Map<string, RelayUrl>();
  /**
   * 上限が source の `until` から来ているか（過去の時点から読むカラム）。新しい側を
   * 捨てて付けた上限は、今に追いついたら外し、届いたものをまた入れる。
   */
  #fixedCeiling = false;
  /** 新しい側を捨てた後に届き、上限より新しいので入れていないもの。 */
  readonly #aboveCeiling = new Map<string, RelayUrl>();
  /**
   * 新しい側を捨てたとき、いちばん新しかったものの時刻。これ以前のものは捨てたものが
   * 届き直しただけなので、新着として数えない —— 購読を張り直すとリレーは最新の
   * 1 ページを送り直し、捨てた分がそのまま新着に見える。
   */
  #droppedHead: number | undefined;
  #anchor: Anchor = "head";
  /**
   * 取り足しの回。捨てた側を取っている途中の返事は、捨てた後の境界と合わないので
   * 回を進めて無視する。
   */
  #olderRun = 0;
  #newerRun = 0;
  /** 取り終えた新しい方の窓を入れている間。溢れても、入れたばかりの側は捨てない。 */
  #fillingNewer = false;
  /** このセクションへ配信されたが、NIP-09 により現在は隠れている id。 */
  readonly #hiddenMembers = new Set<string>();
  #relays = new Map<RelayUrl, RelayState>();
  // start() が initialPlan で埋める。onPlanChanged が同期的に先に埋めた
  // 場合は null のときだけ適用して上書きを避ける。
  #plan: SectionPlan | null = null;
  #handle: SectionHandle | null = null;
  #offStore: (() => void) | null = null;
  #release: (() => void) | null = null;
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

  /** 新しい方への取り足し。取り足せないセクションでは無い。 */
  get newerPaging(): NewerPaging | undefined {
    if (this.#ceiling === undefined) return undefined;
    if (this.#newerPaging === "idle" && !this.#isReady()) return "waiting";
    return this.#newerPaging;
  }

  /** 新しい側を捨てた後に届き、まだ一覧に入れていないもの。新しい順。 */
  get pendingNewer(): NostrEvent[] {
    const { store } = this.#options;
    return [...this.#aboveCeiling.keys()]
      .flatMap((id) => store.get(id) ?? [])
      .sort(compareEvents);
  }

  /** 見ている位置を知らせる。次に溢れたときに捨てる側が変わるだけで、今は捨てない。 */
  setAnchor(anchor: Anchor): void {
    this.#anchor = anchor;
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
    const run = ++this.#olderRun;
    void handle.fetchPage(request).then(
      (page) => {
        // 取っている間に止めた・作り直した（別の handle になった）・古い側を捨てたなら何もしない。
        if (this.#handle !== handle || this.#olderRun !== run) return;
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
        if (this.#handle !== handle || this.#olderRun !== run) return;
        this.#paging = "failed";
        this.#notify();
      },
    );
  }

  /**
   * 上限より新しいものを、窓 1 つぶん取り足す。取っている間・追いついた後・まだ 1 件も
   * 無いときは何もしない。取れなかった（`failed`）後に呼ぶと、同じ窓を取り直す。
   */
  loadNewer(): void {
    const pageSize = this.#options.pageSize;
    const handle = this.#handle;
    const ceiling = this.#ceiling;
    const head = this.#events.first;
    const tail = this.#events.last;
    if (!pageSize || !handle || ceiling === undefined || !head || !tail) return;
    if (this.#newerPaging !== "idle" && this.#newerPaging !== "failed") return;
    if (!this.#isReady()) return;
    const now = Math.floor(this.#scheduler.now() / 1000);
    if (ceiling >= now) {
      if (this.#fixedCeiling) this.#newerPaging = "caught-up";
      else this.#releaseCeiling();
      this.#notify();
      return;
    }
    const window =
      this.#window ??
      estimateWindow(
        head.created_at - tail.created_at,
        this.#events.size,
        pageSize,
      );
    // since は含む（同じ秒の投稿を取りこぼさない）。重なった分は id で弾かれる。
    const request = {
      since: ceiling,
      until: Math.min(ceiling + window, now),
      limit: pageSize,
      now,
    };
    this.#newerPaging = "loading";
    this.#notify();
    const run = ++this.#newerRun;
    const settle = (next: ReturnType<typeof nextNewer>) => {
      if (this.#handle !== handle || this.#newerRun !== run) return;
      const held = [...this.#heldNewer, ...this.#aboveCeiling];
      this.#heldNewer.clear();
      this.#aboveCeiling.clear();
      if (next.paging === "failed") {
        this.#newerPaging = "failed";
        if (!this.#fixedCeiling) {
          for (const [id, relay] of held) this.#aboveCeiling.set(id, relay);
        }
      } else {
        if (next.paging === "caught-up" && !this.#fixedCeiling) {
          this.#ceiling = undefined;
          this.#newerPaging = "idle";
        } else {
          this.#ceiling = next.ceiling;
          if (next.paging === "idle") this.#window = next.window;
          this.#newerPaging = next.paging;
        }
        // 上限を上げてから入れ直す。窓を狭めて取り直すときは上限が動かないので、
        // 何も入らない（次の窓で届き直す）。
        this.#fillingNewer = true;
        for (const [id, relay] of held) this.#onEvent(id, relay);
        this.#fillingNewer = false;
      }
      this.#notify();
    };
    void handle.fetchPage(request).then(
      (page) => settle(nextNewer(page, request)),
      () => settle({ paging: "failed" }),
    );
  }

  /** 捨てて付けた上限を外し、上限より新しいので入れずにいたものを入れる。 */
  #releaseCeiling(): void {
    this.#ceiling = undefined;
    this.#newerPaging = "idle";
    this.#window = undefined;
    const pending = [...this.#aboveCeiling];
    this.#aboveCeiling.clear();
    this.#droppedHead = undefined;
    this.#fillingNewer = true;
    for (const [id, relay] of pending) this.#onEvent(id, relay);
    this.#fillingNewer = false;
  }

  /**
   * 1 ページぶん溢れたら、持つ件数まで削る。1 件ずつ削ると、境界で取っては捨てるを
   * 繰り返す。
   */
  #trim(): void {
    const { windowSize, pageSize } = this.#options;
    if (windowSize === undefined || pageSize === undefined) return;
    if (this.#events.size <= windowSize + pageSize) return;
    if (this.#trimsNewest()) this.#dropNewest(windowSize);
    else this.#dropOldest(windowSize);
  }

  /**
   * 古い方を取っている間は古い側を、新しい方を取っている間は新しい側を見ている。
   * どちらでもない（流れてきた投稿で溢れた）ときは、画面が知らせた位置で決める。
   */
  #trimsNewest(): boolean {
    if (this.#paging === "loading") return true;
    if (this.#newerPaging === "loading" || this.#fillingNewer) return false;
    return this.#anchor === "away";
  }

  #dropOldest(windowSize: number): void {
    this.#events.keepNewest(windowSize);
    const tail = this.#events.last;
    if (!tail) return;
    // until は含むので、残したいちばん古いものと同じ秒に捨てたものも取り直せる。
    this.#until = tail.created_at;
    this.#olderRun++;
    this.#paging = "idle";
  }

  #dropNewest(windowSize: number): void {
    const dropped = this.#events.first?.created_at;
    if (dropped !== undefined) {
      this.#droppedHead = Math.max(this.#droppedHead ?? dropped, dropped);
    }
    this.#events.keepOldest(windowSize);
    const head = this.#events.first;
    if (!head) return;
    // 上限は含むので、残したいちばん新しいものと同じ秒に捨てたものも取り直せる。
    this.#ceiling = head.created_at;
    this.#newerRun++;
    this.#heldNewer.clear();
    this.#newerPaging = "idle";
    this.#window = undefined;
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
    const untils = source.filters.map((filter) => filter.until);
    const pagesNewer =
      this.#options.pagesNewer === true && this.#options.pageSize !== undefined;
    this.#ceiling =
      pagesNewer &&
      untils.every((until): until is number => until !== undefined)
        ? Math.min(...untils)
        : undefined;
    this.#fixedCeiling = this.#ceiling !== undefined;
    // manager.subscribe() は同期的にイベントを配送しうる。先に Store の変化を
    // 購読し、配信と削除依頼の間に hide/show を取りこぼす窓を作らない。
    this.#offStore = store.subscribe((change) => this.#onStoreChange(change));
    this.#release = store.retain(() => this.#members());
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
          // 揃ったことはここで覚える。画面が `paging` を読むまで待つと、その前に
          // 読み先の張り直しが入ったとき、最初のページを待つ状態へ戻ってしまう。
          this.#isReady();
          this.#notify();
        },
        onRelayUnreachable: (relay) => {
          this.#relayState(relay).unreachable = true;
          this.#isReady();
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
    this.#release?.();
    this.#release = null;
    this.#relays = new Map();
    this.#plan = null;
    this.#started = false;
    this.#paging = "idle";
    this.#ready = false;
    this.#firstPageOldest.clear();
    this.#until = undefined;
    this.#ceiling = undefined;
    this.#newerPaging = "idle";
    this.#window = undefined;
    this.#heldNewer.clear();
    this.#fixedCeiling = false;
    this.#aboveCeiling.clear();
    this.#droppedHead = undefined;
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

  /** 一覧に並べているものと、並べる見込みで覚えているもの。store に捨てさせない。 */
  *#members(): Iterable<string> {
    yield* this.#events.ids();
    yield* this.#hiddenMembers;
    yield* this.#heldNewer.keys();
    yield* this.#aboveCeiling.keys();
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
    if (this.#ceiling !== undefined && stored.created_at > this.#ceiling) {
      if (this.#newerPaging === "loading") {
        this.#heldNewer.set(id, relay);
      } else if (
        !this.#fixedCeiling &&
        !this.#aboveCeiling.has(id) &&
        stored.created_at > (this.#droppedHead ?? Number.NEGATIVE_INFINITY)
      ) {
        this.#aboveCeiling.set(id, relay);
        this.#notify();
      }
      return;
    }

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
    this.#trim();

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
