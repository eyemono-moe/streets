# セクションの保持と通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント 1 件ごとの全ソート・全再描画をやめ、全順序つきの二分探索挿入とスケジューラ経由の通知バッチに置き換える。

**Architecture:** 全順序 `(created_at desc, id asc)` と上限つき保持を `src/core/read/sorted-events.ts` に閉じ込め、`SectionReader` はそれを使う。通知は既存の `Scheduler` seam でバッチする（マイクロタスクでは合流しない —— リレーは 1 イベント 1 メッセージで送るため）。

**Tech Stack:** TypeScript (strict), SolidJS, Vitest, Playwright, Biome, pnpm

**仕様:** [docs/superpowers/archive/specs/2026-08-02-section-reader-performance-design.md](../specs/2026-08-02-section-reader-performance-design.md) — **着手前に全文を読むこと。** 1 節（計測が設計を変えた経緯）と 5.1 節（`#starting` の削除裁定）は各タスクの判断根拠である。

## Global Constraints

- **保持順は `created_at` 降順、同値は `id` 昇順。** 表示順に関わらずこの順で「どれを残すか」を決める。
- **`add` は「採用したか」を返す。** 上限に達した状態で保持順の末尾より後ろに来るイベントは**挿入せずに** `false`。呼び出し側はこれを見て通知を積むかどうかを決める。
- **通知はバッチであってデバウンスではない。** 変化のたびにタイマーを張り直すと、イベントが窓より短い間隔で流れ続ける限り**永久に発火しない**。最初の変化でタイマーを 1 本張り、発火したら畳む。
- **`reader.items` と `reader.status` は同期的に正しいまま。** 遅れるのは通知だけ。直接読む消費者は常に最新を見る。
- コメントは日本語。既存ファイルのコメント密度と語り口に合わせる。
- 各タスクの最後に `pnpm exec vitest run`・`pnpm typecheck`・`pnpm check` を通してからコミットする。
- **Playwright を走らせるときは `--grep-invert "repost parser warning flood"` を付ける。** `e2e/console-warning.spec.ts` は旧実装 (`/`) 向けの既存の失敗で、clean tree でも落ちる。無関係なので直そうとしないこと。

---

### Task 1: `sorted-events.ts` — 全順序と上限つき保持

**Files:**
- Create: `src/core/read/sorted-events.ts`
- Create: `src/core/read/sorted-events.test.ts`

**Interfaces:**
- Consumes: `NostrEvent` (`src/core/nostr/event.ts`)
- Produces:
  ```ts
  export const compareEvents: (a: NostrEvent, b: NostrEvent) => number;
  export class SortedEvents {
    constructor(capacity: number);
    add(event: NostrEvent): boolean;
    has(id: string): boolean;
    get size(): number;
    toArray(): NostrEvent[];
    clear(): void;
  }
  ```

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/sorted-events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { SortedEvents, compareEvents } from "./sorted-events";

const ev = (id: string, createdAt: number): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: createdAt,
  kind: 1,
  tags: [],
  content: id,
  sig: "sig",
});

const ids = (s: SortedEvents) => s.toArray().map((e) => e.id).join(",");

// 期待値は手で導出したものではなく、意図した実装を実際に走らせて得た出力である
// (計画作成時に scratchpad で計算済み)。「捕まえる変異」は、その主張が何を
// 守っているかを明示するためのもの。
describe("SortedEvents", () => {
  it("同値は id 昇順に並ぶ", () => {
    // 捕まえる変異: tiebreak を落とす / 降順にする
    const s = new SortedEvents(500);
    for (const e of [ev("c", 100), ev("a", 100), ev("b", 100)]) s.add(e);
    expect(ids(s)).toBe("a,b,c");
  });

  it("created_at 降順が id より優先される", () => {
    // 捕まえる変異: 比較の主従を入れ替える
    const s = new SortedEvents(500);
    for (const e of [ev("a", 100), ev("b", 300), ev("c", 200)]) s.add(e);
    expect(ids(s)).toBe("b,c,a");
  });

  it("先頭・中間・末尾のどこへでも正しく挿入する", () => {
    // 捕まえる変異: 二分探索の境界の取り違え (lo/hi の更新方向)
    const s = new SortedEvents(500);
    for (const e of [ev("m", 200), ev("z", 100)]) s.add(e);
    expect(ids(s)).toBe("m,z");
    s.add(ev("t", 300));
    expect(ids(s)).toBe("t,m,z");
    s.add(ev("n", 150));
    expect(ids(s)).toBe("t,m,n,z");
    s.add(ev("b", 50));
    expect(ids(s)).toBe("t,m,n,z,b");
  });

  it("上限に達した後、末尾より後ろに来るイベントは挿入すらしない", () => {
    // 捕まえる変異: 先に挿入してから追い出す実装 (結果の配列は同じでも
    // add の戻り値が true になり、呼び出し側が無駄な通知を積む)
    const s = new SortedEvents(3);
    for (const e of [ev("a", 300), ev("b", 200), ev("c", 100)]) s.add(e);
    expect(ids(s)).toBe("a,b,c");

    expect(s.add(ev("d", 50))).toBe(false);
    expect(s.has("d")).toBe(false);
    expect(ids(s)).toBe("a,b,c");
    expect(s.size).toBe(3);
  });

  it("上限に達した後、末尾より前に来るイベントは採用され末尾が落ちる", () => {
    // 捕まえる変異: 追い出し時に id 集合を更新し忘れる
    const s = new SortedEvents(3);
    for (const e of [ev("a", 300), ev("b", 200), ev("c", 100)]) s.add(e);

    expect(s.add(ev("d", 250))).toBe(true);
    expect(ids(s)).toBe("a,d,b");
    expect(s.has("c")).toBe(false);
    expect(s.size).toBe(3);
  });

  it("上限の境界で同値のときは id が採否を決める", () => {
    // 捕まえる変異: 上限判定で created_at しか見ない
    // (どちらの add も同じ結果になってしまう)
    const s = new SortedEvents(3);
    for (const e of [ev("a", 300), ev("b", 200), ev("m", 100)]) s.add(e);
    expect(ids(s)).toBe("a,b,m");

    // 同値だが id が末尾より後ろ -> 却下
    expect(s.add(ev("z", 100))).toBe(false);
    expect(ids(s)).toBe("a,b,m");

    // 同値だが id が末尾より前 -> 採用され、m が落ちる
    expect(s.add(ev("d", 100))).toBe(true);
    expect(ids(s)).toBe("a,b,d");
  });

  it("同値が上限の境界をまたぐとき、残るのは id の小さい方である", () => {
    // 捕まえる変異: 上限判定を created_at だけで行う
    // (境界の同値 5 件から「先に着いた 3 件」が残ってしまう)
    //
    // これは旧実装からの**内容の**変化であり、順序だけの変化ではない。
    // 旧実装 (安定ソート) は y,z,e,d,c を残していた —— 到着順で決まるため、
    // Outbox では実行ごとに変わりうる。新実装は入力の集合だけで決まる。
    const s = new SortedEvents(5);
    for (const e of [
      ev("y", 200),
      ev("z", 200),
      ev("e", 100),
      ev("d", 100),
      ev("c", 100),
      ev("b", 100),
      ev("a", 100),
    ]) {
      s.add(e);
    }
    expect(ids(s)).toBe("y,z,a,b,c");
  });

  it("重複 id は採用しない", () => {
    // 捕まえる変異: 重複判定の欠落
    const s = new SortedEvents(500);
    expect(s.add(ev("a", 100))).toBe(true);
    expect(s.add(ev("a", 999))).toBe(false);
    expect(s.size).toBe(1);
    expect(ids(s)).toBe("a");
  });

  it("上限ちょうどでは追い出しが起きない", () => {
    // 捕まえる変異: off-by-one (>= を > にする / その逆)
    const s = new SortedEvents(3);
    const results = [ev("a", 300), ev("b", 200), ev("c", 100)].map((e) =>
      s.add(e),
    );
    expect(results).toEqual([true, true, true]);
    expect(s.size).toBe(3);
  });

  it("clear() で配列も id 集合も空になる", () => {
    const s = new SortedEvents(3);
    s.add(ev("a", 100));
    s.clear();
    expect(s.size).toBe(0);
    expect(s.has("a")).toBe(false);
    expect(s.toArray()).toEqual([]);
  });

  it("toArray() は内部配列を露出しない", () => {
    // 捕まえる変異: this.#items をそのまま返す
    const s = new SortedEvents(3);
    s.add(ev("a", 100));
    s.toArray().push(ev("x", 999));
    expect(s.size).toBe(1);
  });

  // 個別ケースではなく性質そのものを主張する。同値だらけの入力で、
  // 逐次 add が「全件を compareEvents で並べて先頭 N 件」と一致すること。
  // 上の個別ケースが全部通っても挿入位置がどこかでずれていれば、これが落ちる。
  it("逐次 add は『全件ソートして先頭 N 件』と一致する", () => {
    const CAP = 500;
    let x = 12345;
    const events = Array.from({ length: 3000 }, (_, i) => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      // created_at は 500 通りしかない = 同値が大量に発生する
      return ev(`e-${String(i).padStart(4, "0")}`, 1_700_000_000 + (x % 500));
    });

    const s = new SortedEvents(CAP);
    for (const e of events) s.add(e);

    const oracle = [...events].sort(compareEvents).slice(0, CAP);
    expect(s.toArray().map((e) => e.id)).toEqual(oracle.map((e) => e.id));

    // has() と配列の内容が食い違っていないこと
    const kept = new Set(oracle.map((e) => e.id));
    for (const e of events) expect(s.has(e.id)).toBe(kept.has(e.id));
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/sorted-events.test.ts`
Expected: FAIL — `Failed to resolve import "./sorted-events"`

- [ ] **Step 3: 実装する**

`src/core/read/sorted-events.ts`:

```ts
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
 * しかし [ADR-0005](../../../../docs/adr/0005-outbox-model-from-v1.md) の Outbox
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
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/read/sorted-events.test.ts`
Expected: PASS（11 件）

- [ ] **Step 5: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/read/sorted-events.ts src/core/read/sorted-events.test.ts
git commit -m "feat(read): add a total-ordered, capped event collection"
```

---

### Task 2: `SectionReader` を `SortedEvents` に載せ替える

**Files:**
- Modify: `src/core/read/section-reader.ts`
- Modify: `src/core/read/section-reader.test.ts`

**Interfaces:**
- Consumes: `SortedEvents` / `compareEvents`（Task 1）
- Produces: なし（`SectionReader` の公開面は変わらない）

**このタスクでは通知の仕組みを変えない。** 通知のバッチは Task 3。ここでやるのは保持と順序だけである。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/section-reader.test.ts` に追加。既存の `setup()` / `event()` ヘルパ（ファイル冒頭）をそのまま使う。

```ts
  it("同値の created_at は id 昇順で表示される", () => {
    // 捕まえる変異: SortedEvents を使わず元のソートに戻す
    // (安定ソートだと到着順 c,a,b のまま残る)
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("c", 100));
    relay()?.emitEvent(0, event("a", 100));
    relay()?.emitEvent(0, event("b", 100));

    expect(reader.items.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("昇順表示でも同値は id 昇順のまま (reverse ではない)", () => {
    // 捕まえる変異: 昇順を toArray().reverse() で作る
    // (reverse だと同値が id 降順 c,b,a になる)
    const relays = new Map<string, FakeRelayConnection>();
    const store = new PassThroughStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://a/"] },
      order: "created-at-asc",
      store,
      manager,
    });
    reader.start();

    relays.get("wss://a/")?.emitEvent(0, event("c", 100));
    relays.get("wss://a/")?.emitEvent(0, event("a", 100));
    relays.get("wss://a/")?.emitEvent(0, event("b", 100));

    expect(reader.items.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("上限に達した後、末尾より古いイベントは保持されない", () => {
    // 捕まえる変異: add() の戻り値を無視して常に items を作り直す
    const { relay, reader } = setup();
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION; i += 1) {
      relay()?.emitEvent(0, event(`note-${i}`, 1000 + i));
    }
    expect(reader.items).toHaveLength(MAX_ITEMS_PER_SECTION);

    relay()?.emitEvent(0, event("ancient", 1));

    expect(reader.items).toHaveLength(MAX_ITEMS_PER_SECTION);
    expect(reader.items.some((e) => e.id === "ancient")).toBe(false);
  });
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/section-reader.test.ts`
Expected: FAIL —— 1 件目と 2 件目が `["c","a","b"]` を返して落ちる（現状は安定ソートで到着順を保つため）。3 件目は現状でも通る可能性がある（上限の結果は同じ）。

- [ ] **Step 3: `SectionReader` を書き換える**

`src/core/read/section-reader.ts`。import を足す:

```ts
import { SortedEvents, compareEvents } from "./sorted-events";
```

フィールドを置き換える。`#ids` と `#items` を消して 1 本にする:

```ts
  readonly #events = new SortedEvents(MAX_ITEMS_PER_SECTION);
```

`#onEvent` を書き換える:

```ts
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
```

`items` ゲッターを書き換える:

```ts
  get items(): NostrEvent[] {
    return this.#displayOrdered(this.#events.toArray());
  }
```

`#sorted` を `#displayOrdered` に置き換える:

```ts
  /**
   * 保持順 (`created_at` 降順、同値は `id` 昇順) から表示順を導く。
   *
   * 昇順を `reverse()` で作ってはならない。reverse だと同値が `id` 降順に
   * なり、「同値は `id` 昇順」という規則が表示モードによって反転してしまう。
   * 明示ソートは 1 回の読み取りにつき最大 500 件 (約 4,500 比較) であり、
   * 1 イベントごとに 2 回ソートしていた頃の 256,000 比較に対して誤差である。
   *
   * "thread-tree" はスレッドカラムの計画で足す。それまでは降順で扱う。
   */
  #displayOrdered(events: NostrEvent[]): NostrEvent[] {
    if (this.#options.order !== "created-at-asc") return events;
    return events.sort((a, b) => -compareEvents(a, b));
  }
```

`stop()` の `#items` / `#ids` の後始末を `this.#events.clear()` に置き換える。

**注意:** `#displayOrdered` は `toArray()` が返したコピーを受け取るので、その場でソートしてよい（内部配列には触れていない）。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/read/section-reader.test.ts`
Expected: PASS

既存テストのうち `created_at` が全てユニークなものは影響を受けない（確認済み: 上限テスト 2 件はいずれも `1000 + i` を使っている）。落ちた既存テストがあれば、**同値を含んでいて到着順に依存していた**ということなので、期待値を全順序に合わせて直す。それ以外の理由で落ちた場合は**報告して止まること。**

- [ ] **Step 5: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/read/section-reader.ts src/core/read/section-reader.test.ts
git commit -m "perf(read): replace per-event full sort with ordered insertion"
```

---

### Task 3: 通知をバッチし、`#starting` を削除する

**Files:**
- Create: `src/core/read/fake-clock.ts`
- Modify: `src/core/read/section-reader.ts`
- Modify: `src/core/read/section-reader.test.ts`
- Modify: `src/core/read/subscription-manager.test.ts`（重複していた fake clock を共有版に差し替え）

**Interfaces:**
- Consumes: `Scheduler` / `defaultScheduler`（`src/core/read/connection-pool.ts` が export 済み）
- Produces:
  ```ts
  // src/core/read/fake-clock.ts
  export type FakeClock = Scheduler & { advance(ms: number): void };
  export const createFakeClock: () => FakeClock;

  // SectionReaderOptions に追加
  scheduler?: Scheduler;
  ```

- [ ] **Step 1: fake clock を共有モジュールへ出す**

`subscription-manager.test.ts:119` に `createFakeClock` があり、Task 3 のテストでも同じものが要る。テスト間で複製せず 1 箇所にまとめる。`src/core/relay/fake-relay-connection.ts`（テストからのみ使われる非テストファイル）と同じ前例に倣う。

`src/core/read/fake-clock.ts` を新規作成し、`subscription-manager.test.ts` の実装をそのまま移す:

```ts
import type { Scheduler } from "./connection-pool";

export type FakeClock = Scheduler & { advance(ms: number): void };

/**
 * 注入用の偽タイマー。テストからのみ使う (`fake-relay-connection.ts` と同じ
 * 位置づけ)。`advance()` を呼ぶまで何も発火しない —— 実タイマーに依存すると
 * バッチの窓を待つためにテストが遅くなり、しかも不安定になる。
 */
export const createFakeClock = (): FakeClock => {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as unknown as number);
    },
    advance(ms) {
      now += ms;
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, t] of due) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        t.callback();
      }
    },
  };
};
```

`subscription-manager.test.ts` から `createFakeClock` の定義（`:119` 付近）と `TestScheduler` 型（`:117`）を削除し、`import { createFakeClock } from "./fake-clock";` に置き換える。

Run: `pnpm exec vitest run src/core/read/subscription-manager.test.ts`
Expected: PASS（振る舞いは同じで、置き場所だけが変わった）

- [ ] **Step 2: 失敗するテストを書く**

`src/core/read/section-reader.test.ts` に追加:

```ts
  it("複数の配信をまとめて 1 回だけ通知する", () => {
    // 捕まえる変異: バッチをやめて同期通知に戻す (3 回呼ばれる) /
    // デバウンス (毎回張り直し) にする (advance で 1 回も呼ばれない)
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    const listener = vi.fn();
    reader.subscribe(listener);
    reader.start();
    listener.mockClear();

    // 「別々の配信」であることが本質。リレーは 1 イベント 1 メッセージで
    // 送るので、実配信でも 1 件ずつ別のタスクで届く。
    relay()?.emitEvent(0, event("a", 300));
    relay()?.emitEvent(0, event("b", 200));
    relay()?.emitEvent(0, event("c", 100));

    expect(listener).not.toHaveBeenCalled();

    clock.advance(16);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(reader.items.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("通知より前でも items は同期的に正しい", () => {
    // 捕まえる変異: items の更新まで遅延させる
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    reader.start();

    relay()?.emitEvent(0, event("a", 300));

    // クロックを進めていないので通知はまだ出ていないが、直接読めば見える。
    expect(reader.items.map((e) => e.id)).toEqual(["a"]);
  });

  it("上限で弾かれたイベントは通知を積まない", () => {
    // 捕まえる変異: add() の戻り値を無視して常に通知を積む
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION; i += 1) {
      relay()?.emitEvent(0, event(`note-${i}`, 1000 + i));
    }
    clock.advance(16);

    const listener = vi.fn();
    reader.subscribe(listener);
    relay()?.emitEvent(0, event("ancient", 1));
    clock.advance(16);

    expect(listener).not.toHaveBeenCalled();
  });

  it("stop() は保留中の通知を破棄する", () => {
    // 捕まえる変異: stop() で clearTimeout を忘れる
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    const listener = vi.fn();
    reader.subscribe(listener);
    reader.start();
    listener.mockClear();

    relay()?.emitEvent(0, event("a", 300));
    reader.stop();
    clock.advance(16);

    expect(listener).not.toHaveBeenCalled();
  });
```

`setup()`（`section-reader.test.ts:63` 付近）にスケジューラを渡せるようにする。第 2 引数を足すだけで、既存の呼び出し（引数なし）はそのまま動く。全体を次で置き換える:

```ts
const setup = (relayUrls = ["wss://a/"], scheduler?: Scheduler) => {
  const relays = new Map<string, FakeRelayConnection>();
  const store = new PassThroughStore();
  const manager = new SubscriptionManager({
    store,
    routing: new RoutingTable(store),
    connect: (url) => {
      const relay = new FakeRelayConnection(url);
      relays.set(url, relay);
      return relay;
    },
    fallbackRelays: ["wss://fallback/"],
  });
  const reader = new SectionReader({
    source: { type: "nostr", filters: [{ kinds: [1] }], relays: relayUrls },
    order: "created-at-desc",
    store,
    manager,
    scheduler,
  });
  return {
    relays,
    store,
    manager,
    reader,
    relay: () => relays.get(relayUrls[0]),
  };
};
```

import を足す:

```ts
import type { Scheduler } from "./connection-pool";
import { createFakeClock } from "./fake-clock";
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/section-reader.test.ts`
Expected: FAIL —— `scheduler` が `SectionReaderOptions` に無いため型エラー、および同期通知のままなので「まだ呼ばれていない」の主張が落ちる。

- [ ] **Step 4: バッチを実装する**

`src/core/read/section-reader.ts`。import を足す:

```ts
import { type Scheduler, defaultScheduler } from "./connection-pool";
```

`SectionReaderOptions` に足す:

```ts
  /**
   * 通知バッチのタイマー注入口 (テスト用)。既定は実タイマー。
   * `connection-pool.ts` の `defaultScheduler` を共有するのは、読み取り層の
   * どこであれ「注入されなければ実タイマー」という規約を一箇所に置くため。
   */
  scheduler?: Scheduler;
```

定数とフィールド:

```ts
/**
 * 通知をまとめる窓。60fps の 1 フレーム。ADR-0011 の「操作の画面反映 100ms」
 * に対して十分小さい。
 */
const NOTIFY_BATCH_MS = 16;
```

```ts
  readonly #scheduler: Scheduler;
  #notifyTimer: ReturnType<Scheduler["setTimeout"]> | null = null;
```

コンストラクタで `this.#scheduler = options.scheduler ?? defaultScheduler;`。

`#notify()` を書き換える:

```ts
  /**
   * 通知をまとめる。**デバウンスではなくバッチである。**
   *
   * 変化のたびにタイマーを張り直す実装 (デバウンス) だと、イベントが
   * `NOTIFY_BATCH_MS` より短い間隔で流れ続ける限り**通知が永久に発火しない**。
   * 最初の変化でタイマーを 1 本張り、発火したら畳む。以後の変化は既存の
   * タイマーに相乗りする。
   *
   * まとめる必要があるのは、リレーが 1 イベント 1 メッセージで送るためである
   * (NIP-01)。ブラウザはメッセージごとに別のタスクを回すので、マイクロタスク
   * では合流しない —— メッセージ N で積んだマイクロタスクは N+1 が届く前に
   * flush される。マクロタスク境界が要る。
   *
   * `items` と `status` はこの遅延の影響を受けない。遅れるのは通知だけで、
   * 直接読む消費者は常に最新を見る。
   */
  #notify(): void {
    if (this.#notifyTimer !== null) return;
    this.#notifyTimer = this.#scheduler.setTimeout(() => {
      this.#notifyTimer = null;
      this.#emit();
    }, NOTIFY_BATCH_MS);
  }

  #emit(): void {
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
```

`stop()` に足す:

```ts
    if (this.#notifyTimer !== null) {
      this.#scheduler.clearTimeout(this.#notifyTimer);
      this.#notifyTimer = null;
    }
```

- [ ] **Step 5: `#starting` を削除する**

仕様 5.1 の裁定。バッチを入れると `#starting` はあらゆる経路で到達不能になる —— タイマーが発火するのは `start()` が返った後なので、観測者は `start()` 中の中間状態をそもそも見ない。

削除するもの:
- `#starting` フィールド（`:48` 付近）
- `start()` 内の `this.#starting = true` / `try`〜`finally` の `this.#starting = false`（`try`/`finally` 自体が他に何もしていなければ一緒に畳む）
- `#notify()` 冒頭の `if (this.#starting) return;`（Step 4 の書き換えで既に消えているはず）

- [ ] **Step 6: `#starting` のテストを観測可能な主張に書き直す**

`section-reader.test.ts:216`「never reports settled from within start() itself, even when a relay closes synchronously from inside subscribe()」を書き直す。

**旧テストが主張していたこと**（内部フラグの効果）は観測できなくなった。**新テストが主張すること**は「観測者は settled を早すぎる時点で見ない」という観測可能な性質である。テスト名とコメントを、何を守っているのかが分かる形に直すこと。

既存テスト（`:216-255`）のセットアップ（`subscribe()` の中から同期的に `onClosed` を呼ぶ偽リレー）はそのまま使い、fake clock と `advance` を挟む形にする。全体を次で置き換える:

```ts
  // 旧テスト名: "never reports settled from within start() itself, even when a
  // relay closes synchronously from inside subscribe()"
  //
  // 旧テストは #starting フラグの効果を主張していた。通知をバッチにすると
  // そのフラグは到達不能になり (仕様 5.1)、フラグを削除してもテストは通って
  // しまう —— 落ちなくなるテストである。主張を、内部フラグではなく観測可能な
  // 性質へ移した。
  //
  // 元の欠陥そのものは今も実在する: 複数リレーのうち最初の 1 本が subscribe()
  // の中から同期的に settle すると、その時点の #relays は部分的にしか埋まって
  // おらず、live.every(complete) が空に近い集合に対して自明に真になる。
  // 違いは、その中間状態が観測者に漏れるかどうかである。
  //
  // 捕まえる変異: #notify() のバッチをやめて即座に #emit() する
  // (start() 途中の settled が phasesSeen に漏れる)
  it("観測者は start() 途中の settled を見ない", () => {
    const clock = createFakeClock();
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => ({
        url,
        subscribe: (_filters, handlers) => {
          if (url === "wss://sync-closed/") {
            // WebSocketRelayConnection がソケット既閉時に onClosed を
            // インラインで呼ぶのを模倣する。subscribe() (したがって
            // manager.subscribe()) が返る前にコールバックが発火する。
            handlers.onClosed("socket closed");
          }
          return { close: () => {} };
        },
        publish: async () => {},
        close: () => {},
        onClose: () => () => {},
      }),
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://sync-closed/", "wss://slow/"],
      },
      order: "created-at-desc",
      store,
      manager,
      scheduler: clock,
    });

    const phasesSeen: string[] = [];
    reader.subscribe(() => phasesSeen.push(reader.status.phase));

    reader.start();
    clock.advance(16);

    expect(phasesSeen).not.toContain("settled");
    // 通知が 1 回も出ないのではなく、出た通知が settled を含まないこと。
    // これを主張しないと「バッチが全部飲み込んだだけ」でも通ってしまう。
    expect(phasesSeen.length).toBeGreaterThan(0);
  });
```

**最後の 2 行が要点である。** `not.toContain("settled")` だけだと、通知が 1 回も出ていない場合にも通ってしまう —— それでは「バッチが隠している」と「本当に settled になっていない」を区別できない。**通知が出ていることを先に主張してから、その中身を主張する。**

**このテストは A/B で falsifiable であることを示すこと**（Step 8）。

- [ ] **Step 7: 既存のリスナー依存テストを直す**

`reader.subscribe(...)` を使っているのは 4 件だけである（`awk` で `it()` ブロック単位に数えた。`rg -c 'subscribe\('` だと `manager.subscribe(` まで数えて 8 件に見えるが誤り）:

1. `never reports settled from within start() itself, ...`（Step 6 で書き直し済み）
2. `notifies listeners when items change`
3. `does not strand a later listener when an earlier listener throws`
4. `statuses.push(reader.status)` で phase 遷移を集めているもの（`section-reader.test.ts:123` 付近の `startReaderWithRelays` ヘルパ）

いずれも fake clock を渡し、主張の前に `clock.advance(16)` を挟む形に直す。`startReaderWithRelays` はヘルパなので、そこに clock を通して呼び出し側へ返すこと。

`reader.items` / `reader.status` を直接読んでいる残り 26 件は、Global Constraints の「同期的に正しいまま」により影響を受けない。**それらが落ちたら、その不変式が壊れているということなので報告して止まること。**

- [ ] **Step 8: 変異でテストが落ちることを確認する**

2 方向で確認し、両方の出力を報告に残す。

**方向 A —— バッチを壊す。** `#notify()` を一時的に「即座に `#emit()` を呼ぶ」形に変え、テストを走らせる。
Expected: **FAIL** —— 「複数の配信をまとめて 1 回だけ通知する」と「観測者は start() 途中の settled を見ない」が落ちる。

**方向 B —— デバウンスにする。** `#notify()` を一時的に「毎回 `clearTimeout` して張り直す」形に変え、テストを走らせる。
Expected: **FAIL** —— 「複数の配信をまとめて 1 回だけ通知する」が `advance(16)` 後も 0 回で落ちる。

どちらも確認したら元に戻し、`git diff src/` が空であることを確かめる。

- [ ] **Step 9: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/read/fake-clock.ts src/core/read/section-reader.ts src/core/read/section-reader.test.ts src/core/read/subscription-manager.test.ts
git commit -m "perf(read): batch section notifications through the scheduler seam"
```

---

### Task 4: 計測と E2E

**Files:**
- Create: `scripts/research/measure-section-reader-burst.mjs`
- Create: `docs/research/2026-08-02-section-reader-burst.md`
- Create: `e2e/fixtures/seed-cap.ts`
- Create: `e2e/section-cap.spec.ts`
- Modify: `e2e/global-setup.ts`

**Interfaces:**
- Consumes: Task 1〜3 で入った実装
- Produces:
  ```ts
  // e2e/fixtures/seed-cap.ts
  export const capViewerPubkey: string;
  export const capAuthorPubkey: string;
  /** MAX_ITEMS_PER_SECTION + 100 = 600 件の kind:1 を relay 1 へ発行する */
  export const seedCapFixture: () => Promise<void>;
  ```

- [ ] **Step 1: 計測スクリプトを書く**

`scripts/research/measure-section-reader-burst.mjs`。`scripts/research/measure-outbox-connection-budget.mjs` と同じく Node 単体で走り、依存を足さない。

```js
#!/usr/bin/env node
/**
 * セクションの保持コストを、旧実装 (1 件ごとに全ソート + スライス) と
 * 新実装 (全順序つき二分探索挿入) で比較する。
 *
 * **これは回帰を防がない。** 決定的に主張できるのは通知回数と順序までで、
 * それは vitest 側 (sorted-events.test.ts / section-reader.test.ts) が
 * 担っている。ここでやるのは数字を記録として残し、いつでも測り直せる状態に
 * することだけである。本番コードに比較カウンタを埋めるのは筋が悪く、
 * 壁時計の比は CI で揺れる。
 *
 * 配列操作だけを取り出したものであり、`setItems` のコピーと `<For>` の
 * 突き合わせ (実アプリの支配項) は含まない。
 */

const MAX = 500;

/** 同値を意図的に混ぜる。created_at が全てユニークだと最良ケースになる。 */
const makeEvents = (n, seed = 1) => {
  let x = seed;
  return Array.from({ length: n }, (_, i) => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return {
      id: `e-${String(i).padStart(5, "0")}`,
      created_at: 1_700_000_000 + (x % 1_000),
    };
  });
};

const compareEvents = (a, b) =>
  b.created_at - a.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 旧実装。1 件ごとに 2 回ソート + 3 回コピー。 */
const legacy = (incoming) => {
  let items = [];
  const ids = new Set();
  let comparisons = 0;
  const cmp = (a, b) => {
    comparisons++;
    return compareEvents(a, b);
  };

  for (const stored of incoming) {
    if (ids.has(stored.id)) continue;
    ids.add(stored.id);
    const mostRecent = [...items, stored].sort(cmp).slice(0, MAX);
    items = [...mostRecent].sort(cmp);
    if (ids.size > items.length) {
      const kept = new Set(items.map((e) => e.id));
      for (const kid of ids) if (!kept.has(kid)) ids.delete(kid);
    }
  }
  return { items, comparisons };
};

/** 新実装。src/core/read/sorted-events.ts と同じアルゴリズム。 */
const ordered = (incoming) => {
  const items = [];
  const ids = new Set();
  let comparisons = 0;
  const cmp = (a, b) => {
    comparisons++;
    return compareEvents(a, b);
  };

  for (const stored of incoming) {
    if (ids.has(stored.id)) continue;
    if (items.length >= MAX && cmp(stored, items[items.length - 1]) >= 0) {
      continue;
    }
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cmp(items[mid], stored) < 0) lo = mid + 1;
      else hi = mid;
    }
    items.splice(lo, 0, stored);
    ids.add(stored.id);
    if (items.length > MAX) ids.delete(items.pop().id);
  }
  return { items, comparisons };
};

const run = (label, fn, incoming) => {
  const t0 = performance.now();
  const r = fn(incoming);
  return { label, ms: performance.now() - t0, ...r };
};

const row = (n, r) =>
  `${String(n).padEnd(7)} | ${r.label.padEnd(9)} | ${String(r.comparisons).padStart(11)} | ${r.ms.toFixed(1).padStart(7)}`;

console.log("空のセクションへ N 件のバーストが届く\n");
console.log("投入    | 実装      | 比較回数    | ms");
console.log("--------|-----------|-------------|--------");
for (const n of [100, 500, 1000, 2000]) {
  const incoming = makeEvents(n);
  console.log(row(n, run("legacy", legacy, incoming)));
  console.log(row(n, run("ordered", ordered, incoming)));
}

console.log("\n上限 500 に達した状態へ、さらに 500 件が届く\n");
console.log("投入    | 実装      | 比較回数    | ms");
console.log("--------|-----------|-------------|--------");
{
  const incoming = [...makeEvents(MAX, 7), ...makeEvents(500, 99)];
  console.log(row("500+500", run("legacy", legacy, incoming)));
  console.log(row("500+500", run("ordered", ordered, incoming)));
}

// 旧実装と新実装で「何が変わるか」を数字で出す。
//
// **集合が一致することを主張してはならない。** 同値が上限の境界をまたぐと、
// どのイベントが残るかまで変わる (仕様 1.1 の訂正)。旧実装は同値のうち先に
// 着いたものを残し、新実装は id の小さいものを残す。分布によっては偶然
// 一致するので、一致を主張すると「たまたま通るテスト」になる。
{
  const incoming = makeEvents(3000, 42);
  const a = legacy(incoming).items;
  const b = ordered(incoming).items;
  const setA = new Set(a.map((e) => e.id));
  const setB = new Set(b.map((e) => e.id));
  const onlyLegacy = [...setA].filter((id) => !setB.has(id));
  let positionDiff = 0;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) positionDiff++;

  console.log(`\n件数: legacy ${a.length} / ordered ${b.length}`);
  console.log(`  位置がずれた件数     : ${positionDiff} / ${a.length}`);
  console.log(`  旧実装にしか無い件数 : ${onlyLegacy.length}`);
  console.log(
    "  (どちらも 0 とは限らない。同値が上限の境界をまたぐと保持内容が変わる)",
  );
}
```

- [ ] **Step 2: 計測を実行して結果を記録する**

```bash
node scripts/research/measure-section-reader-burst.mjs
```

`docs/research/2026-08-02-section-reader-burst.md` に結果を書く。`docs/research/2026-08-01-outbox-connection-budget.md` と同じ構成（0. 方法 / 1. 結果 / 2. 得られた事実 / 3. この計測の限界）にすること。

**「3. この計測の限界」に必ず書くこと:**
- 配列操作だけを取り出したものであり、`setItems` のコピーと `<For>` の突き合わせ（実アプリの支配項）は含まない
- **通知回数は測っていない。** 実配信ではリレーが 1 イベント 1 メッセージで送るため、通知を 1 回に落とすのはバッチであって二分探索挿入ではない
- **これは回帰を防がない**

- [ ] **Step 3: 500 件超の fixture を作る**

`e2e/fixtures/seed-cap.ts`。`e2e/fixtures/seed-outbox.ts` の書き方に合わせる。

`MAX_ITEMS_PER_SECTION + 100` = 600 件の `kind:1` を 1 人の著者から relay 1 へ発行し、その著者だけをフォローする閲覧者の `kind:3` と、著者の `kind:10002`（write = relay 1）も発行する。

**リレーの DB は `data/` に永続する。** 実行ごとに内容を変える必要は無い（600 件がそこにあり続けても主張は「500 件で止まる」なので問題ない）が、**二重に seed して 1200 件にならないよう、`created_at` と本文を決定的にして同じイベント id が再生成されるようにすること**（同じ id なら重複として弾かれる）。

- [ ] **Step 4: global setup に繋ぐ**

`e2e/global-setup.ts` に `seedCapFixture()` を足す。

- [ ] **Step 5: E2E を書く**

`e2e/section-cap.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { capViewerPubkey } from "./fixtures/seed-cap.js";

/**
 * ADR-0011 の「1 セクションが保持するイベント数 500 件」を E2E で測る。
 * この ADR は「測定できない予算は要件ではなく願望である」と定めており、
 * 7 指標のうち測定済みは 30 接続上限だけだった。これが 2 つ目になる。
 */
test("caps a section at 500 items", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto(`/debug/v1-section?pubkey=${capViewerPubkey}`);

  // phase が settled になってから読む。streaming の途中で読むと、
  // まだ 500 に達していないだけの数字を見てしまう。
  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("count")).toHaveText("items: 500");
});
```

- [ ] **Step 6: E2E を走らせる**

```bash
docker compose start nostr-rs-relay nostr-rs-relay-2
pnpm exec playwright test e2e/section-cap.spec.ts
```

Expected: PASS

**落ちた場合、期待値を緩めて通す前に原因を報告すること。** 特に `items: 500` が `items: 600` になるなら上限が効いていない、`items: 0` なら fixture か seed が届いていない —— **意味が全く違う。**

- [ ] **Step 7: 変異でテストが load-bearing であることを確認する**

`src/core/read/sorted-events.ts` の `add()` から上限のロジック（`if (this.#items.length >= this.#capacity)` の早期 return と、末尾の `pop()`）を一時的に外し、E2E を走らせる。

Expected: **FAIL** —— `items: 600` になる。確認したら元に戻し、`git diff src/` が空であることを確かめる。

- [ ] **Step 8: 全体を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
pnpm exec playwright test --grep-invert "repost parser warning flood"
git add scripts/research/measure-section-reader-burst.mjs docs/research/2026-08-02-section-reader-burst.md e2e/fixtures/seed-cap.ts e2e/section-cap.spec.ts e2e/global-setup.ts
git commit -m "test(e2e): measure the 500-item section cap, and record the burst numbers"
```

---

### Task 5: ドキュメントを実装に追随させる

**Files:**
- Modify: `docs/adr/0015-section-status-excludes-renderer-fetches.md`
- Modify: `docs/adr/0023-centralized-subscription-manager.md`
- Modify: `docs/design/read-layer-followups.md`
- Modify: `docs/design/architecture.md`

**Interfaces:**
- Consumes: Task 1〜4 で実際に入ったもの
- Produces: なし

- [ ] **Step 1: ADR-0015 に観測タイミングの注記を足す**

`phase` の意味は変わらないが、**観測されるタイミングが最大 `NOTIFY_BATCH_MS`（16ms）遅れる**ことを追記する。`reader.status` を直接読めば常に最新であることも併記する（遅れるのは通知だけ）。

- [ ] **Step 2: ADR-0023「実装の段階」を更新する**

**#6（セクションの保持と通知）を追記し、#5（REQ マージ）より先に着手したことと理由を記録する。** 理由は仕様 0 節にある（REQ マージは今日効果を持たない／ADR-0023 自身が先送りを認めている／性能側は待つと高くつく）。

**この追記をしないと、仕様が名乗っている「#6」がどの系列の番号なのか読者が確かめられない。**

- [ ] **Step 3: `read-layer-followups.md` を更新する**

- 「次の計画で直すべきもの」の **性能 — 1 イベントごとの全ソートと全再描画** を「解消済み」へ移し、どう解消したかを書く（`sorted-events.ts` の全順序と二分探索挿入、`Scheduler` 経由の通知バッチ、`#starting` の削除）。
- **followups が書いていた対処案「`#notify` をマイクロタスクで合流させ」が誤りだったことを明記する。** リレーは 1 イベント 1 メッセージで送り、ブラウザはメッセージごとに別タスクを回すので、マイクロタスクはメッセージ間で flush されて合流しない。マクロタスク境界が必要だった。
- 「満たしていない要件」の **500 件上限** を「ユニットテストのみ」から「E2E で測定済み」へ更新し、残りを 5 指標に直す。
- 冒頭の採番表は**触らない**（旧系列の記述は意図的に残してある）。

- [ ] **Step 4: `architecture.md` を更新する**

読み取り層の説明に `sorted-events.ts` を足し、保持順が全順序であること・通知がバッチされることを反映する。8 節（実装済みの一覧）に本スライスの項を足す。

- [ ] **Step 5: リンクと事実を確認する**

```bash
pnpm check
rg -n 'sorted-events|compareEvents|NOTIFY_BATCH_MS|SortedEvents' docs/ | head -20
```

書いたファイルパス・シンボル名が実在することを `rg` で確認する。**前スライスのレビューは、実装と食い違う記述が ADR に残っていたことを繰り返し指摘している。**

- [ ] **Step 6: コミットする**

```bash
git add docs/
git commit -m "docs: record the ordered-insertion and batched-notification change"
```

---

## 完了条件

- `pnpm exec vitest run` 全通過
- `pnpm typecheck` exit 0
- `pnpm check` 通過
- `pnpm exec playwright test --grep-invert "repost parser warning flood"` 全通過
- `rg -n '#starting' src/` が何も返さない
- `rg -n '\.sort\(' src/core/read/section-reader.ts` が返すのは表示順の 1 箇所だけ
