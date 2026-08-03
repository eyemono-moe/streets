import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { EventStore } from "./event-store";
import { SortedEvents, compareEvents } from "./sorted-events";
import {
  MAX_ITEMS_PER_SECTION,
  type NostrSource,
  type Order,
  type SectionStatus,
} from "./source";
import type {
  SectionHandle,
  SectionPlan,
  SubscriptionManager,
} from "./subscription-manager";

export type SectionReaderOptions = {
  source: NostrSource;
  order: Order;
  store: EventStore;
  /** 接続と購読は manager が所有する (ADR-0023) */
  manager: SubscriptionManager;
};

type RelayState = {
  complete: boolean;
  unreachable: boolean;
};

export class SectionReader {
  readonly #options: SectionReaderOptions;
  readonly #listeners = new Set<() => void>();
  readonly #events = new SortedEvents(MAX_ITEMS_PER_SECTION);
  #relays = new Map<RelayUrl, RelayState>();
  // start() が initialPlan で埋める。onPlanChanged が start() の最中に同期的
  // に飛んだ場合はそちらが先に埋めるので、start() 側は null のときだけ
  // initialPlan を適用する (Task 6 で onPlanChanged が同期的に飛ぶようになった
  // ときに、より新しい plan を古い initialPlan で上書きしないため)。
  #plan: SectionPlan | null = null;
  #handle: SectionHandle | null = null;
  #started = false;
  // manager.subscribe() のコールバックは同期的に発火しうる
  // (WebSocketRelayConnection はソケットが既に閉じていると subscribe() の
  // 中で同期的に onClosed する)。start() が全リレー分の状態を作り終える前に
  // #notify() が走ると、#relays に一部のリレーしか載っていない状態で
  // live.every(complete) が空配列に対する自明な真になり、settled→initial の
  // 一瞬のちらつきを observer に見せてしまう。start() の間だけ抑制する。
  #starting = false;

  constructor(options: SectionReaderOptions) {
    this.#options = options;
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
    this.#starting = true;

    const { source, manager } = this.#options;
    try {
      this.#handle = manager.subscribe(source.filters, source.relays, {
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
          // 同じリレーの上で REQ だけ張り直された (fix round 1, Critical 1) —
          // 新しい EOSE が来るまでこのリレーについて分かっていたことは
          // 何もない。complete も unreachable も両方まっさらに戻す。
          // onRelayUnreachable を代用しない — あちらは接続の失敗を意味し、
          // incomplete を押し上げてしまう。これは意図した張り直しである。
          this.#relays.set(relay, { complete: false, unreachable: false });
          this.#notify();
        },
      });

      // onPlanChanged が subscribe() の中から同期的に飛んでいたら #plan は
      // 既にそちらで埋まっている — それが initialPlan より新しいので上書きしない。
      //
      // ここは #applyPlan を使わない: initialPlan の適用は「不足分を足す」
      // マージであって、張り直しの「古いものを丸ごと捨てる」置き換えとは違う。
      // subscribe() は正規化に失敗した URL を onRelayUnreachable で同期的に
      // 報告することがあり (正規化前の生文字列は perRelay/initialPlan.relays
      // には載らない)、そうして #relays に作られた「計画に載っていない
      // unreachable なリレー」の記録を、初回適用で消してしまってはならない。
      if (this.#plan === null) {
        this.#plan = this.#handle.initialPlan;
        for (const relay of this.#plan.relays) this.#relayState(relay);
      }
    } finally {
      this.#starting = false;
    }
    // start() が確定させた最終状態を、抑制していた分まとめて 1 回だけ通知する。
    this.#notify();
  }

  /**
   * リレー集合の張り直し (ADR-0016)。新旧どちらにもあるリレーは RelayState を
   * 使い回す — 既に EOSE 済みのリレーを再度待たせてはいけない。旧計画だけに
   * あったリレーは unreachable フラグごと丸ごと捨てる。新計画だけにあるリレー
   * はまっさらな状態から始める。
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
    this.#relays = new Map();
    this.#plan = null;
    this.#started = false;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #onEvent(id: string, _relay: RelayUrl): void {
    if (this.#events.has(id)) return;
    // 本体は EventStore が持つ。ここに載せるのは検証済みのコピー (ADR-0024)
    const stored = this.#options.store.get(id);
    if (!stored) return;

    // 上限に達した状態で保持順の末尾より後ろに来たイベントは採用されない。
    // その場合は画面に何の変化も無いので、通知も積まない。
    if (!this.#events.add(stored)) return;

    this.#notify();
  }

  /**
   * 保持順 (`created_at` 降順、同値は `id` 昇順) から表示順を導く。
   *
   * 昇順を `reverse()` で作ってはならない。reverse だと同値が `id` 降順に
   * なり、「同値は `id` 昇順」という規則が表示モードによって反転してしまう。
   * `-compareEvents(a, b)` で符号をまるごと反転するのも同じ罠に落ちる ——
   * `created_at` の大小だけでなく tie-break の `id` の大小も一緒に反転して
   * しまい、結局 `id` 降順になる。ここでは `created_at` の比較だけを昇順に
   * 反転し、同値のときは `compareEvents` の tie-break (`id` 昇順) をそのまま
   * 使う。
   *
   * 明示ソートは 1 回の読み取りにつき最大 500 件 (約 4,500 比較) であり、
   * 1 イベントごとに 2 回ソートしていた頃の 256,000 比較に対して誤差である。
   *
   * "thread-tree" はスレッドカラムの計画で足す。それまでは降順で扱う。
   */
  #displayOrdered(events: NostrEvent[]): NostrEvent[] {
    if (this.#options.order !== "created-at-asc") return events;
    return events.sort(
      (a, b) => a.created_at - b.created_at || compareEvents(a, b),
    );
  }

  #notify(): void {
    if (this.#starting) return;
    // 1 つの listener が投げても、後続の listener への通知を巻き込んでは
    // ならない (final review, finding 4) — ここは任意の消費者コード
    // (UI 側のオブザーバーなど) を呼んでいる。無防備な bare for ループだと、
    // 登録順で先に呼ばれた listener が投げただけで、後に登録された listener
    // はこの通知を一切受け取れない。専用の報告チャネルは無いので
    // console.error に落とす — 主目的は隔離であって報告ではない。
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
