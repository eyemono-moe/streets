import type { NostrEvent } from "../nostr/event";

/**
 * セクションの保持順を定める全順序 —— `created_at` 降順、同値は `id` 昇順。
 * Outbox で複数リレーから同じイベントが届き到着順が変わるため、`id` を
 * tiebreak にする (秒粒度で同値は日常的に起き、上限到達時は末尾落ちを決める)。
 */
export const compareEvents = (a: NostrEvent, b: NostrEvent): number =>
  b.created_at - a.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * 保持順を維持したまま上限つきでイベントを溜める。配列と id 集合を同じ
 * 場所で持つ —— 別々だと追い出しのたびに全件を舐め直す (O(n))。
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

  /** 指定した id を保持していたら取り除き、表示が変わったことを返す。 */
  remove(id: string): boolean {
    if (!this.#ids.delete(id)) return false;
    const index = this.#items.findIndex((event) => event.id === id);
    if (index >= 0) this.#items.splice(index, 1);
    return true;
  }

  /**
   * 採用したら `true`、重複/上限で不採用なら `false`。上限到達時に末尾より
   * 後ろに来るイベントは挿入も追い出しもせず、通知も積まない。
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
   * `event` を入れるべき位置。`compareEvents(x, y) < 0` は「x が y より前」
   * を意味するので、`items[mid]` が前なら挿入位置はさらに右。
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
