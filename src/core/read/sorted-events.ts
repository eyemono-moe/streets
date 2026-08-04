import type { NostrEvent } from "../nostr/event";

/**
 * セクションの保持順を定める全順序 —— `created_at` 降順、同値は `id` 昇順。
 *
 * **同値の順序を明示的に決めるのが要点である。** Nostr の `created_at` は
 * 秒粒度でリレーはバーストで配信するので同値は日常的に起きる。上限
 * (`MAX_ITEMS_PER_SECTION`) に達した状態では、同値内の順序が「どれが末尾から
 * 落ちるか」を決める。
 *
 * かつては配列全体を安定ソートしていたため、同値は**到着順**に並んでいた。
 * しかし [ADR-0005](../../../docs/adr/0005-outbox-model-from-v1.md) の Outbox
 * では同じイベントが複数リレーから届き、どちらが先かはネットワーク次第である
 * —— つまり到着順は実行ごとに変わりうる。`id` を tiebreak にするのは、
 * `NostrEvent` の中で必ず存在し・一意で・到着経路に依存しない唯一の
 * フィールドだからである。昇順か降順かは任意だが、固定されていることが本質。
 */
export const compareEvents = (a: NostrEvent, b: NostrEvent): number =>
  b.created_at - a.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * 保持順を維持したまま上限つきでイベントを溜める。
 *
 * 配列と id 集合を同じ場所で持つ。以前は `SectionReader` が両方を別々に持ち、
 * 追い出しのたびに「落ちた分を id 集合からも外す」ために全件を舐め直していた
 * (1 イベントごとに O(n))。ここで一緒に持てば、追い出した 1 件の id を消す
 * だけで済む。
 */
export class SortedEvents {
  readonly #capacity: number;
  #items: NostrEvent[] = [];
  readonly #ids = new Set<string>();

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  get size(): number {
    return this.#items.length;
  }

  has(id: string): boolean {
    return this.#ids.has(id);
  }

  /** 保持順のコピー。内部配列は露出しない。 */
  toArray(): NostrEvent[] {
    return [...this.#items];
  }

  clear(): void {
    this.#items = [];
    this.#ids.clear();
  }

  /**
   * 採用したら `true`、重複または上限により採用しなかったら `false`。
   *
   * 上限に達した状態で保持順の末尾より後ろに来るイベントは、**挿入も追い出しも
   * せずに** `false` を返す。呼び出し側は画面に変化が無いと分かるので、
   * 通知を積まずに済む —— これが戻り値の存在理由である。
   */
  add(event: NostrEvent): boolean {
    if (this.#ids.has(event.id)) return false;

    if (this.#items.length >= this.#capacity) {
      const tail = this.#items[this.#items.length - 1];
      if (compareEvents(event, tail) >= 0) return false;
    }

    this.#items.splice(this.#lowerBound(event), 0, event);
    this.#ids.add(event.id);

    if (this.#items.length > this.#capacity) {
      const dropped = this.#items.pop();
      if (dropped) this.#ids.delete(dropped.id);
    }
    return true;
  }

  /**
   * `event` を入れるべき位置。`compareEvents(x, y) < 0` は「x が y より前に
   * 来る」を意味するので、`items[mid]` が `event` より前なら挿入位置は
   * さらに右にある。
   */
  #lowerBound(event: NostrEvent): number {
    let lo = 0;
    let hi = this.#items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareEvents(this.#items[mid], event) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
