import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelayUrl,
} from "../relay/relay-connection";
import type { EventStore } from "./event-store";
import {
  MAX_ITEMS_PER_SECTION,
  type NostrSource,
  type Order,
  type SectionStatus,
} from "./source";

/** 複数フィルタにまたがる authors の重複を除いた人数 */
const countUnroutableAuthors = (filters: RelayFilter[]): number =>
  new Set(filters.flatMap((filter) => filter.authors ?? [])).size;

export type SectionReaderOptions = {
  source: NostrSource;
  order: Order;
  store: EventStore;
  openRelay: (url: RelayUrl) => RelayConnection;
  /**
   * `openRelay` が返した接続の所有権を返す先。省略時は呼び出し側が接続の
   * 生死を管理する(このクラスは close() を呼ばない)。将来の接続プール
   * (30 接続上限, ADR-0005/0011) はここに参照カウントの解放を差し込む。
   */
  releaseRelay?: (url: RelayUrl, connection: RelayConnection) => void;
};

type RelayState = {
  url: RelayUrl;
  connection: RelayConnection;
  subscription: RelaySubscription | null;
  eose: boolean;
  unreachable: boolean;
};

export class SectionReader {
  readonly #options: SectionReaderOptions;
  readonly #listeners = new Set<() => void>();
  readonly #ids = new Set<string>();
  #relays: RelayState[] = [];
  #items: NostrEvent[] = [];
  #started = false;

  constructor(options: SectionReaderOptions) {
    this.#options = options;
  }

  get items(): NostrEvent[] {
    return [...this.#items];
  }

  get status(): SectionStatus {
    const unreachableRelays = this.#relays.filter((r) => r.unreachable).length;
    const live = this.#relays.filter((r) => !r.unreachable);
    // 待つべき生きたリレーが残っていなければ（全滅、または一つも無ければ）空虚に真として settled とする。
    // ただし start() 前は #relays も空になるため、#started で「始まってすらいない」場合を除外する。
    const allSettled = this.#started && live.every((r) => r.eose);

    const phase: SectionStatus["phase"] = allSettled
      ? "settled"
      : this.#items.length > 0
        ? "streaming"
        : "initial";

    // `relays` を省略した source は Outbox ルーティングでリレーを選ぶ想定
    // (source.ts の関連コメント参照) だが、ルーティングは未実装。start() は
    // 何も開かないため #relays は空のまま推移し、上の allSettled は空虚に
    // 真になる。「どこにも当たっていない」を「探して何も無かった」と
    // 区別できないまま settled/未 incomplete を返すと、黙って欠落させて
    // はならない (ADR-0011) に反する。ルーティングが入るまでは、常に
    // incomplete を立てて状況そのものを報告する。
    const noRelaysConfigured =
      this.#started && (this.#options.source.relays?.length ?? 0) === 0;
    const unroutableAuthors = noRelaysConfigured
      ? countUnroutableAuthors(this.#options.source.filters)
      : 0;

    return unreachableRelays > 0 || noRelaysConfigured
      ? { phase, incomplete: { unreachableRelays, unroutableAuthors } }
      : { phase };
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;

    for (const url of this.#options.source.relays ?? []) {
      const connection = this.#options.openRelay(url);
      const state: RelayState = {
        url,
        connection,
        eose: false,
        unreachable: false,
        subscription: null,
      };
      this.#relays.push(state);

      state.subscription = connection.subscribe(this.#options.source.filters, {
        onEvent: (event) => this.#onEvent(event, url),
        onEose: () => {
          state.eose = true;
          this.#notify();
        },
        onClosed: () => {
          state.unreachable = true;
          this.#notify();
        },
      });
    }
  }

  stop(): void {
    for (const relay of this.#relays) {
      relay.subscription?.close();
      this.#options.releaseRelay?.(relay.url, relay.connection);
    }
    this.#relays = [];
    this.#started = false;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #onEvent(event: NostrEvent, relay: RelayUrl): void {
    // "duplicate" は「この EventStore の *どこかで* 既に見た」であって、
    // 「このセクションで既に見た」ではない。EventStore は呼び出し側が渡す
    // オプションであり、デッキの別カラムやユーザーカラムと共有されるのが
    // 想定用途 (ADR-0018 の水和後は起動直後から全件が "duplicate" になる)。
    // 弾いてよいのは検証に落ちた "rejected" だけ。
    //
    // "duplicate" は id 一致だけで確定し、EventStore.put は verifyEvent より
    // *前に* それを返す (悪意あるリレーからの検証コスト、特に Outbox 経路で
    // 同一イベントが複数リレーから届く分の schnorr 検証を避けるため)。
    // つまりこの event 引数は「id は既知だが中身は未検証」でありうる。
    // 悪意あるリレーが本物の id に別の pubkey/content/created_at/sig を
    // 詰めて再送すれば、その未検証オブジェクトをそのまま載せてしまう。
    // 必ず store から検証済みの正本を取り直して載せる。
    const result = this.#options.store.put(event, relay);
    if (result === "rejected") return;
    const stored = this.#options.store.get(event.id);
    if (!stored) return;
    if (this.#ids.has(event.id)) return;

    this.#ids.add(event.id);
    // 上限は表示順に関わらず「新しい順」で決める。表示順でスライスすると
    // 昇順表示時に古い方から採用してしまい、上限到達後キャップが凍結してしまう。
    const mostRecent = [...this.#items, stored]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, MAX_ITEMS_PER_SECTION);
    this.#items = this.#sorted(mostRecent);

    // 上限を超えて落ちた分は id 集合からも外す
    if (this.#ids.size > this.#items.length) {
      const kept = new Set(this.#items.map((e) => e.id));
      for (const id of this.#ids) if (!kept.has(id)) this.#ids.delete(id);
    }

    this.#notify();
  }

  #sorted(events: NostrEvent[]): NostrEvent[] {
    // "thread-tree" はスレッドカラムの計画で足す。それまでは降順で扱う。
    const ascending = this.#options.order === "created-at-asc";
    return [...events].sort((a, b) =>
      ascending ? a.created_at - b.created_at : b.created_at - a.created_at,
    );
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
