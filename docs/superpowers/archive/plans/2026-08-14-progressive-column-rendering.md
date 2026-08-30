# カラムの段階的レンダリング 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カラムが `items()` の先頭 N 件だけを描き、下端の番兵が見えたら N を増やすようにする。保持数の上限も 500 → 200 へ下げる。

**Architecture:** 描画窓の件数を決めるロジックを DOM から切り離した純粋な関数として置き（`render-window.ts`）、リストと番兵を `DeckColumn` から独立したコンポーネント（`ColumnItems.tsx`）へ出す。**アイテムは通常の文書フローのまま**にする —— 絶対配置にするとブラウザの scroll anchoring が壊れ、いま正しく動いている「上端にいるときだけ新着に追従する」挙動を手で書き直すことになる。

**Tech Stack:** SolidJS / UnoCSS / Vitest / Playwright / `@solid-primitives/intersection-observer`（既存の依存）。

**仕様:** [docs/superpowers/archive/specs/2026-08-14-progressive-column-rendering-design.md](../specs/2026-08-14-progressive-column-rendering-design.md)。**タスクの記述と仕様が食い違ったら仕様が正。**

## Global Constraints

- **完了の判定は `pnpm vitest run` / `pnpm typecheck` / `pnpm check` の 3 つすべて**（Task 4 は加えて `pnpm exec playwright test e2e/v1.spec.ts e2e/section-cap.spec.ts`）。
  `pnpm check` は型検査を含まない。**各コマンドの終了ステータスをそれ自体で見ること** ——
  パイプへ通した先のステータスを読むと、落ちているのに通ったように見える。
- **アイテムを絶対配置にしない。`position` を触らない。** 仕様 2 節。通常フローで
  ないと scroll anchoring が働かず、新着が上に積まれたときスクロール位置が飛ぶ。
- すべてのテストは捕まえる変異を名指しし、**実際にその変異を入れて落ちることを確認**する。
  **その変異が名指ししたテストを落とすこと**まで確かめる。**変異の前に製品コードを
  コピーして保存し、`git checkout` で戻さない。**
- **コメントには非自明な WHY だけ**（`CONTEXT.md` の「書き方」節）。WHAT・変更履歴・
  タスク ID は書かない。
- **既存の `data-testid` を変えない**（`items` / `item` / `deck-column` を既存の e2e が拾っている）。
- コンポーネントのテストは `createRoot`（この repo に `@solidjs/testing-library` は無い）。
  `src/routes/v1/EventView.test.tsx` が最も近い前例。
- **`e2e/` に使い捨ての計測用 spec を置いたら、タスクの最後に必ず消すこと。** 共有の
  docker リレーへイベントを書き込むので、残すと他のテストのシードと混ざる。

---

### Task 1: 描画窓のロジック

**Files:**
- Create: `src/core/view/render-window.ts`
- Create: `src/core/view/render-window.test.ts`

**Interfaces:**
- Produces:
  - `INITIAL_RENDER_COUNT: 40` / `RENDER_COUNT_STEP: 40`
  - `type RenderWindow = { boundaryId: string | undefined }`
  - `initialRenderWindow(): RenderWindow`
  - `renderCount(windowState: RenderWindow, itemIds: readonly string[]): number`
  - `growRenderWindow(windowState: RenderWindow, itemIds: readonly string[]): RenderWindow`

**DOM を一切知らない。** 受け取るのは id の配列だけ（`NostrEvent` すら知らない）。

**窓は件数ではなく「描画済み末尾アイテムの id」で持つ**（仕様 4.1）。件数はそこから
導出する純粋な関数であり、状態が動くのは番兵が発火したときだけ。

- [x] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";
import {
  INITIAL_RENDER_COUNT,
  RENDER_COUNT_STEP,
  growRenderWindow,
  initialRenderWindow,
  renderCount,
} from "./render-window";

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `id-${from + i}`);

describe("render-window", () => {
  it("初期は INITIAL_RENDER_COUNT 件", () => {
    // 捕まえる変異: 初期値を itemIds.length にする (全部描いてしまい、
    // このスライスが解こうとしている初回のブロッキングがそのまま残る)
    expect(renderCount(initialRenderWindow(), ids(0, 600))).toBe(
      INITIAL_RENDER_COUNT,
    );
  });

  it("増やすと RENDER_COUNT_STEP 件増える", () => {
    // 捕まえる変異: 増分を 1 件にする / 増やさない
    const list = ids(0, 600);
    const grown = growRenderWindow(initialRenderWindow(), list);
    expect(renderCount(grown, list)).toBe(
      INITIAL_RENDER_COUNT + RENDER_COUNT_STEP,
    );
  });

  it("先頭へ挿入されても、それまで描いていた末尾が窓から落ちない", () => {
    // 捕まえる変異: 境界を id ではなく件数で持つ。深くスクロール中に新着が
    // 来ると、窓の末尾にあった「いま見ている行」が押し出されて再マウント
    // され、展開していた長文ノートが畳まれる (仕様 4.1)
    const before = ids(100, 500);
    const windowState = growRenderWindow(initialRenderWindow(), before);
    const lastVisible = before[renderCount(windowState, before) - 1];

    const after = [...ids(0, 10), ...before];

    // 挿入された 10 件ぶん窓が伸び、境界のアイテムは依然として窓の中にある
    expect(renderCount(windowState, after)).toBe(
      renderCount(windowState, before) + 10,
    );
    expect(after.slice(0, renderCount(windowState, after))).toContain(
      lastVisible,
    );
  });

  it("境界 id が見つからないときは初期値へ戻る", () => {
    // 捕まえる変異: indexOf の -1 をそのまま使う (件数 0 になって何も
    // 描かれなくなる) / 前回の件数を据え置く
    const list = ids(0, 600);
    const grown = growRenderWindow(initialRenderWindow(), list);
    expect(renderCount(grown, list)).toBeGreaterThan(INITIAL_RENDER_COUNT);

    expect(renderCount(grown, ids(9000, 600))).toBe(INITIAL_RENDER_COUNT);
  });

  it("件数が INITIAL_RENDER_COUNT を下回るときは件数どまり", () => {
    // 捕まえる変異: 上限で丸めない (件数を超える数を返し、「まだ描いて
    // いないものがある」の判定が常に真になって番兵が張り付く)
    expect(renderCount(initialRenderWindow(), ids(0, 5))).toBe(5);
  });

  it("空配列では 0 件", () => {
    // 捕まえる変異: 空でも INITIAL_RENDER_COUNT を返す (slice は 0 件を
    // 返すので描画は壊れないが、番兵の判定が狂う)
    expect(renderCount(initialRenderWindow(), [])).toBe(0);
    expect(growRenderWindow(initialRenderWindow(), [])).toEqual({
      boundaryId: undefined,
    });
  });

  it("末尾まで描いたらそれ以上伸びない", () => {
    // 捕まえる変異: 件数で丸めずに境界を進める (itemIds[next - 1] が
    // undefined になり、以降 renderCount が初期値へ落ちて表示が縮む)
    const list = ids(0, 50);
    let windowState = initialRenderWindow();
    for (let i = 0; i < 5; i += 1)
      windowState = growRenderWindow(windowState, list);
    expect(renderCount(windowState, list)).toBe(50);
  });

  it("renderCount は渡された窓を書き換えない", () => {
    // 捕まえる変異: renderCount の中で windowState.boundaryId を進める
    // (items() が再計算されるたび窓が伸び、番兵と無関係に全件描いてしまう)。
    // 同じ引数で 2 回呼んで比べるだけでは、値を返す前に書き換える実装を
    // 捕まえられない —— 窓そのものが変わっていないことを見る。
    const list = ids(0, 600);
    const windowState = growRenderWindow(initialRenderWindow(), list);
    const snapshot = { ...windowState };
    renderCount(windowState, list);
    expect(windowState).toEqual(snapshot);
  });
});
```

- [x] **Step 2: 走らせて落ちることを確認**

Run: `pnpm vitest run src/core/view/render-window.test.ts`
Expected: FAIL（`render-window` が存在しない）

- [x] **Step 3: 実装**

```ts
/**
 * カラムが「いま何件まで描いてよいか」だけを決める。DOM も Solid も知らない
 * —— この規則 (spec 4.1) がこのスライスで最も間違えやすく、DOM を立ち上げずに
 * 全分岐を確かめたいから分けている。
 */

/** カラムの高さは約 900px、1 行のノートは約 60px なので 2〜3 画面ぶん。 */
export const INITIAL_RENDER_COUNT = 40;
export const RENDER_COUNT_STEP = 40;

export type RenderWindow = {
  /**
   * 描画済みの**末尾アイテムの id**。件数ではなく id で持つのが要点 ——
   * 先頭へ新着が挿入されても境界アイテムの同一性は変わらないので、
   * 「挿入されたぶん件数を足し直す」補正が要らない。件数で持つと、補正が
   * 効くまでの一瞬だけ末尾のアイテムが `<For>` から外れて再マウントされ、
   * 展開していた長文ノートが畳まれる。
   */
  boundaryId: string | undefined;
};

export const initialRenderWindow = (): RenderWindow => ({
  boundaryId: undefined,
});

export const renderCount = (
  windowState: RenderWindow,
  itemIds: readonly string[],
): number => {
  const initial = Math.min(INITIAL_RENDER_COUNT, itemIds.length);
  if (windowState.boundaryId === undefined) return initial;

  const index = itemIds.indexOf(windowState.boundaryId);
  // 見つからない = 別のイベント集合に入れ替わった、または上限で末尾から
  // 押し出された。どちらも古い境界を引き継ぐ意味が無いので初期値へ戻す。
  if (index < 0) return initial;

  return Math.min(Math.max(index + 1, INITIAL_RENDER_COUNT), itemIds.length);
};

export const growRenderWindow = (
  windowState: RenderWindow,
  itemIds: readonly string[],
): RenderWindow => {
  const next = Math.min(
    renderCount(windowState, itemIds) + RENDER_COUNT_STEP,
    itemIds.length,
  );
  return { boundaryId: next === 0 ? undefined : itemIds[next - 1] };
};
```

- [x] **Step 4: 走らせて通ることを確認 → 変異検証 → コミット**

変異は 8 件（各テストのコメントが名指ししたもの）。**入れる前に `render-window.ts`
をコピーして保存し、検証後はコピーから戻すこと。**

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git add src/core/view/render-window.ts src/core/view/render-window.test.ts
git commit -m "feat(v1): decide how many column items to render"
```

---

### Task 2: リストと番兵

**Files:**
- Create: `src/routes/v1/ColumnItems.tsx`
- Create: `src/routes/v1/ColumnItems.test.tsx`
- Modify: `src/routes/v1/DeckColumn.tsx`（`<ul>` を `<ColumnItems>` へ置き換える）
- Modify: `vitest.setup.ts`（jsdom に `IntersectionObserver` が無い）

**Interfaces:**
- Consumes: `initialRenderWindow` / `renderCount` / `growRenderWindow` /
  `INITIAL_RENDER_COUNT`（Task 1）、`EventView`（`src/routes/v1/EventView.tsx`）
- Produces: `ColumnItems: Component<{ items: () => readonly NostrEvent[] }>`（default export）

- [x] **Step 1: `IntersectionObserver` のスタブを足す**

`vitest.setup.ts` の末尾へ足す。**`observe()` で 1 回だけ「交差していない」を配信する**
—— 実物は監視開始時に必ず初回の観測を配信する。交差しているほうを配信すると、
テストが常に窓を伸ばしてしまい「初期は 40 件」が主張できない。

```ts
/**
 * jsdom は `IntersectionObserver` を実装しない。`ColumnItems` の番兵
 * (`@solid-primitives/intersection-observer`) が `new IntersectionObserver(...)`
 * を呼ぶため、これが無いとカラムを描くテストが落ちる。
 *
 * **`observe()` で「交差していない」を 1 回配信する。** 実物は監視開始時に
 * 必ず初回の観測を配信する。jsdom にはレイアウトが無いので実際の交差は
 * 判定できず、ここでは常に非交差とする —— 交差を配信すると窓が伸び、
 * 「初期は INITIAL_RENDER_COUNT 件しか描かない」を主張できなくなる。
 */
class IntersectionObserverStub {
  readonly #callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.#callback = callback;
  }

  observe(target: Element): void {
    this.#callback(
      [{ target, isIntersecting: false } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}
```

- [x] **Step 2: 失敗するテストを書く**

`src/routes/v1/EventView.test.tsx` の `mount` ヘルパと `RenderProvider` の使い方を
そのまま真似る（`createRoot` の中でコンポーネントを関数として直接呼ぶ）。
`RenderContextValue` は `store` / `events` / `profiles` / `renderers` を要求する。
`renderers: []` でよい（`EventView` は未登録 kind でも `UnknownKind` へ落ちる）。

```tsx
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import { INITIAL_RENDER_COUNT } from "../../core/view/render-window";
import ColumnItems from "./ColumnItems";

const fakeEvent = (i: number): NostrEvent => ({
  id: `${i}`.padStart(64, "0"),
  pubkey: "a".repeat(64),
  created_at: 1_700_000_000 - i,
  kind: 1,
  tags: [],
  content: `note ${i}`,
  sig: "0".repeat(128),
});

const fakeEvents = (count: number) =>
  Array.from({ length: count }, (_, i) => fakeEvent(i));

const fakeContext = (): RenderContextValue => ({
  store: new EventStore(),
  events: {
    request() {},
    isUnresolved() {
      return false;
    },
    subscribe() {
      return () => {};
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  } satisfies EventRequests,
  profiles: {
    request() {},
    subscribe() {
      return () => {};
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  } satisfies ProfileRequests,
  renderers: [],
});

const mount = (items: () => readonly NostrEvent[]) => {
  let element: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: fakeContext(),
      get children() {
        element = ColumnItems({ items }) as unknown as HTMLElement;
        return null;
      },
    });
  });
  return {
    element: () => {
      if (!element) throw new Error("component did not mount");
      return element;
    },
    dispose: disposeRoot,
  };
};

describe("ColumnItems", () => {
  it("600 件渡しても最初は INITIAL_RENDER_COUNT 件しか描かない", () => {
    // 捕まえる変異: 窓を当てずに items() をそのまま <For> へ渡す
    // (このスライスが解こうとしている初回のブロッキングがそのまま残る)
    const events = fakeEvents(600);
    const { element, dispose } = mount(() => events);
    try {
      expect(
        element().querySelectorAll('[data-testid="item"]'),
      ).toHaveLength(INITIAL_RENDER_COUNT);
    } finally {
      dispose();
    }
  });

  it("残りがあるときだけ番兵を出す", () => {
    // 捕まえる変異: 番兵を常に出す。全件描き終えた後も交差したまま張り付き、
    // 増やすものが無いのにコールバックが走り続ける (spec 4.2)
    const many = mount(() => fakeEvents(600));
    try {
      expect(
        many.element().querySelector('[data-testid="items-sentinel"]'),
      ).not.toBeNull();
    } finally {
      many.dispose();
    }

    const few = mount(() => fakeEvents(3));
    try {
      expect(
        few.element().querySelector('[data-testid="items-sentinel"]'),
      ).toBeNull();
    } finally {
      few.dispose();
    }
  });

  it("アイテムを絶対配置にしない (scroll anchoring を壊さない)", () => {
    // 捕まえる変異: 仮想スクロール風に position:absolute を当てる。
    // 通常フローでなくなるとブラウザの scroll anchoring が働かず、新着が
    // 上に積まれたときスクロール位置が飛ぶ (仕様 2 節)
    const { element, dispose } = mount(() => fakeEvents(100));
    try {
      for (const li of element().querySelectorAll<HTMLElement>(
        '[data-testid="item"]',
      )) {
        expect(li.style.position).toBe("");
      }
    } finally {
      dispose();
    }
  });
});
```

- [x] **Step 3: 走らせて落ちることを確認**

Run: `pnpm vitest run src/routes/v1/ColumnItems.test.tsx`
Expected: FAIL（`./ColumnItems` が存在しない）

- [x] **Step 4: `ColumnItems.tsx` を実装**

`content-visibility` のコメントは**書き直す**。`DeckColumn.tsx` にある現行のものは
「最大 500 件を一度に描く」「1500 件が一度に現れる初回は重くなる」と、**まさに
このタスクが変える挙動**を説明しているので、そのまま移すと即座に嘘になる。
下のコード中のコメントを使うこと。測定値の更新は Task 4（`content-visibility` を
残すか外すかを実測で決める）の仕事。

```tsx
import { createIntersectionObserver } from "@solid-primitives/intersection-observer";
import { For, Show, createMemo, createSignal } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import {
  growRenderWindow,
  initialRenderWindow,
  renderCount,
} from "../../core/view/render-window";
import EventView from "./EventView";

/**
 * カラムの一覧。**先頭 N 件だけを描き、下端の番兵が見えたら N を増やす。**
 *
 * `DeckColumn` から分けているのは、窓の状態と番兵という 1 つの関心が
 * カラムのヘッダ・タイトル編集・診断表示と混ざらないようにするため。
 *
 * **アイテムは通常の文書フローのまま置く。** 絶対配置にするとブラウザの
 * scroll anchoring が働かなくなり、新着が先頭へ積まれたときスクロール位置が
 * 飛ぶ (仕様 2 節に実測あり)。`divide-y` の区切り線とアイコンの `sticky` も
 * 同じ理由で通常フローに依存している。
 */
const ColumnItems: Component<{ items: () => readonly NostrEvent[] }> = (
  props,
) => {
  // `window` はグローバルを隠すので名前を変えている。
  const [renderWindow, setRenderWindow] = createSignal(initialRenderWindow());
  const itemIds = createMemo(() => props.items().map((event) => event.id));

  // 件数は窓と items() からの**純粋な導出**。effect で補正しないので、
  // items() が変わった瞬間に正しい件数が出る —— 補正待ちの一瞬に末尾の
  // アイテムが `<For>` から外れて再マウントされることが無い (spec 4.1)。
  const count = createMemo(() => renderCount(renderWindow(), itemIds()));
  const visible = createMemo(() => props.items().slice(0, count()));
  const hasMore = () => count() < props.items().length;

  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  // 実装されていない環境では番兵が働かないだけで、初期の N 件は描かれる
  // (仕様 6 節)。ここで落ちるとカラムごと出なくなる。
  if (typeof IntersectionObserver !== "undefined") {
    createIntersectionObserver(
      () => {
        const element = sentinel();
        return element ? [element] : [];
      },
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setRenderWindow((previous) => growRenderWindow(previous, itemIds()));
        }
      },
    );
  }

  return (
    <ul data-testid="items" class="divide-y">
      <For each={visible()}>
        {(event) => (
          // `content-visibility: auto` —— 画面外のアイテムのレイアウトと
          // 描画をブラウザに省かせる。段階的レンダリングで初回に描く件数は
          // 減るが、読み進めると窓は伸びるので画面外は依然として増える。
          //
          // `contain-intrinsic-size: auto 120px` の `auto` は「一度描いた
          // 高さを覚えておく」指示。これが無いと画面外へ出た瞬間に高さが
          // 推定値へ戻り、スクロールバーが跳ねる。
          <li
            data-testid="item"
            style={{
              "content-visibility": "auto",
              "contain-intrinsic-size": "auto 120px",
            }}
          >
            <EventView id={event.id} variant="full" />
          </li>
        )}
      </For>
      {/*
        まだ描いていないアイテムがあるときだけ出す —— 常に出すと、全件を
        描き終えた後も交差したまま張り付き、増やすものが無いのにコール
        バックが走り続ける。
      */}
      <Show when={hasMore()}>
        <li data-testid="items-sentinel" ref={setSentinel} class="h-1" />
      </Show>
    </ul>
  );
};

export default ColumnItems;
```

- [x] **Step 5: `DeckColumn.tsx` を差し替える**

現行の `<ul data-testid="items" class="divide-y">` から `</ul>` まで（直前の
`divide-y` についての長いコメントを含む）を、次の 1 行に置き換える:

```tsx
      <ColumnItems items={items} />
```

`import ColumnItems from "./ColumnItems";` を足し、`import EventView from "./EventView";`
は `DeckColumn.tsx` の他の箇所で使われていないので消す。消したコメント
（「1 件ずつをカードにせず `divide-y` で区切る…」）は `ColumnItems.tsx` の
`<ul>` の直前へ移す —— 区切り方を決めているのは移った先だから。

- [x] **Step 6: ゲートと変異検証、コミット**

変異は 3 件（各テストのコメントが名指ししたもの）。

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git commit -m "feat(v1): render column items progressively"
```

---

### Task 3: 保持数の上限を 200 へ

**Files:**
- Modify: `src/core/read/source.ts`
- Modify: `docs/adr/0011-performance-budget.md`
- Modify: `e2e/section-cap.spec.ts`

**Interfaces:**
- Produces: `MAX_ITEMS_PER_SECTION = 200`

`src/core/read/section-reader.test.ts` は定数を import しているので追随する。
`src/core/read/sorted-events.test.ts` の `500` は `SortedEvents` へ直接渡す容量で
あって本スライスの上限とは別物 —— **触らない。**

- [x] **Step 1: 定数を変える**

`src/core/read/source.ts`:

```ts
/** ADR-0011 の性能予算 */
export const MAX_ITEMS_PER_SECTION = 200;
```

- [x] **Step 2: ADR-0011 に改訂の注を入れる**

予算表の行を書き換える:

```markdown
| 1 セクションが保持するイベント数 | 200 件（超過分は古い方から破棄） |
```

`| タブのメモリ使用量 | 500 MB 以内（10 列・各 500 件の状態で） |` の
「各 500 件」も「各 200 件」にする。

「明示的に受け入れた劣化」の該当項を次に置き換える:

```markdown
- **1 セクション 200 件を超えると古い方から破棄するため、長時間開いたカラムではスクロールで戻れる範囲が有限になる。**

  **この項の件数は 500 件から 200 件へ改めた（2026-08-14）。** 当初の 500 件は「保持数」として決めた数だが、**保持数と描画数を同じ数にしていた**ため、カラム 3 本で 1500 件が一度に DOM へ現れ、初回描画がメインスレッドを 1.2 秒塞いでいた（実測は `docs/design/read-layer-followups.md`）。描画数を保持数から切り離した（先頭 40 件から段階的に増やす）ことで、保持数に残る意味は「どこまで遡れるか」だけになった。遡れる範囲は 500 件ぶんから 200 件ぶんへ浅くなる —— **測定可能であること（本 ADR の中心的な要求）は変わらず、`e2e/section-cap.spec.ts` が新しい値を主張する。**
```

- [x] **Step 3: e2e の期待値を直す**

`e2e/section-cap.spec.ts` —— **テスト名の 500 も直すこと。**

```ts
test("caps a section at 200 items", async ({ page }) => {
```

```ts
  await expect(page.getByTestId("count")).toHaveText("items: 200");
```

先頭の JSDoc の「500 件」も 200 件にする。

- [x] **Step 4: ゲート、コミット**

```bash
pnpm vitest run && pnpm typecheck && pnpm check
pnpm exec playwright test e2e/section-cap.spec.ts
git commit -m "perf(v1): keep 200 items per section instead of 500"
```

---

### Task 4: e2e と実測

**Files:**
- Modify: `e2e/v1.spec.ts`
- Modify: `docs/design/read-layer-followups.md`

- [x] **Step 1: 段階的レンダリングを e2e で主張する**

`e2e/v1.spec.ts` に新しい test を足す。`e2e/fixtures/seed-cap.ts` の 600 件
フィクスチャ（`capViewerPubkey` / `capAuthorPubkey`）を使う。既存の
`seedRelatedEventsDeck` と同じ形で localStorage にデッキを書く。

```ts
test("a column renders only a window of its items and grows on scroll", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.addInitScript((viewerPubkey: string) => {
    const win = window as unknown as Record<string, unknown>;
    win.nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: async () => {
        throw new Error("not used");
      },
    };
  }, capViewerPubkey);

  await page.addInitScript(
    ({ pubkey, relay, author }) => {
      window.localStorage.setItem(
        `streets.v1.deck.${pubkey}`,
        JSON.stringify({
          version: 2,
          columns: [
            {
              id: "cap",
              title: "cap",
              source: {
                kind: "literal",
                filters: [{ kinds: [1], authors: [author] }],
                relays: [relay],
              },
            },
          ],
        }),
      );
    },
    {
      pubkey: capViewerPubkey,
      relay: previewRelayUrl,
      author: capAuthorPubkey,
    },
  );

  await page.goto(`/v1?relays=${previewRelayUrl}`);
  await page.getByTestId("login").click();

  const column = page.locator('[data-testid="deck-column"]');
  await expect(column.getByTestId("item").first()).toBeVisible({
    timeout: 60_000,
  });
  // セクションが 200 件で落ち着くまで待つ (途中で数えると、まだ届いて
  // いないだけの少ない数を「窓が効いている」と誤って読んでしまう)。
  await page.waitForTimeout(8_000);

  // 捕まえる変異: 窓を当てずに items() を全部描く。上限は 200 なので
  // 「200 未満」では上限そのものと区別が付かない —— 初期 40 件に番兵が
  // 2 回発火してもなお届かない 120 件を境にする。
  const initial = await column.getByTestId("item").count();
  expect(initial).toBeLessThan(120);
  expect(initial).toBeGreaterThan(0);

  // 捕まえる変異: 番兵を出さない / 交差しても窓を増やさない
  await column.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(() => column.getByTestId("item").count(), { timeout: 15_000 })
    .toBeGreaterThan(initial);
});
```

import に `capAuthorPubkey` / `capViewerPubkey` を足す（`./fixtures/seed-cap.js`）。

- [x] **Step 2: 3 カラムで実測する**

`e2e/zz-progressive-probe.spec.ts` を作って測り、**測り終えたら消す**。
シードは 500 件（半分が返信、5 件に 1 件が画像）をカラム 3 本へ。

```ts
import { expect, test } from "@playwright/test";
import { Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

const relayUrl = process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";
const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );
const viewerKey = secretKey(60000);
const authorKey = secretKey(61000);
const viewerPubkey = getPublicKey(viewerKey);
const authorPubkey = getPublicKey(authorKey);

const seedMixed = async () => {
  const relay = await Relay.connect(relayUrl);
  const base = 1_700_000_000;
  await relay.publish(
    finalizeEvent(
      { kind: 10002, created_at: base, tags: [["r", relayUrl]], content: "" },
      authorKey,
    ),
  );
  await relay.publish(
    finalizeEvent(
      { kind: 3, created_at: base, tags: [["p", authorPubkey]], content: "" },
      viewerKey,
    ),
  );
  const ids: string[] = [];
  for (let i = 0; i < 500; i++) {
    const isReply = i % 2 === 1 && ids.length > 0;
    const parent = ids[Math.floor(i / 2) % ids.length];
    const image = i % 5 === 0 ? ` https://images.invalid/mix-${i % 20}.png` : "";
    const signedEvent = finalizeEvent(
      {
        kind: 1,
        created_at: base + i,
        tags:
          isReply && parent
            ? [["e", parent, relayUrl, "reply", authorPubkey]]
            : [],
        content: `混在プローブ ${i} 本文テキスト${image}`,
      },
      authorKey,
    );
    await relay.publish(signedEvent);
    ids.push(signedEvent.id);
  }
  relay.close();
};

test("probe: 3 カラム", async ({ page }) => {
  test.setTimeout(240_000);
  await seedMixed();

  await page.route(/images\.invalid/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );

  await page.addInitScript((pubkey: string) => {
    const win = window as unknown as Record<string, unknown>;
    win.nostr = {
      getPublicKey: async () => pubkey,
      signEvent: async () => {
        throw new Error("not used");
      },
    };
  }, viewerPubkey);

  await page.addInitScript(() => {
    const win = window as unknown as Record<string, unknown>;
    win.__probe = { longTasks: [] as number[] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        (win.__probe as { longTasks: number[] }).longTasks.push(entry.duration);
      }
    }).observe({ entryTypes: ["longtask"] });
  });

  await page.addInitScript(
    ({ pubkey, relay, author }) => {
      window.localStorage.setItem(
        `streets.v1.deck.${pubkey}`,
        JSON.stringify({
          version: 2,
          columns: ["a", "b", "c"].map((id) => ({
            id,
            title: id,
            source: {
              kind: "literal",
              filters: [{ kinds: [1], authors: [author] }],
              relays: [relay],
            },
          })),
        }),
      );
    },
    { pubkey: viewerPubkey, relay: relayUrl, author: authorPubkey },
  );

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/v1?relays=${relayUrl}`);
  await page.getByTestId("login").click();

  const columns = page.locator('[data-testid="deck-column"]');
  await expect(columns.first().getByTestId("item").first()).toBeVisible({
    timeout: 90_000,
  });
  await page.waitForTimeout(12_000);

  const probe = await page.evaluate(() => {
    const win = window as unknown as { __probe: { longTasks: number[] } };
    return {
      longTasks: win.__probe.longTasks,
      domNodes: document.querySelectorAll("*").length,
      items: document.querySelectorAll('[data-testid="item"]').length,
      notes: document.querySelectorAll('[data-testid="note"]').length,
    };
  });
  const long = probe.longTasks;
  console.log(`item: ${probe.items} / note: ${probe.notes}`);
  console.log(`DOM ノード総数: ${probe.domNodes}`);
  console.log(
    `longtask: ${long.length} 回 / 合計 ${long.reduce((a, b) => a + b, 0).toFixed(0)}ms / 最長 ${Math.max(0, ...long).toFixed(0)}ms`,
  );

  const scroll = await page.evaluate(async () => {
    const el = document.querySelector(
      '[data-testid="deck-column"]',
    ) as HTMLElement;
    const frames: number[] = [];
    let last = performance.now();
    let ticks = 0;
    return await new Promise<number[]>((resolve) => {
      const step = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        el.scrollTop += 400;
        ticks++;
        if (ticks < 90) requestAnimationFrame(step);
        else resolve(frames);
      };
      requestAnimationFrame(step);
    });
  });
  const f = scroll.slice(1).sort((a, b) => a - b);
  console.log(
    `スクロール: 中央値 ${f[Math.floor(f.length / 2)]?.toFixed(1)}ms / p95 ${f[Math.floor(f.length * 0.95)]?.toFixed(1)}ms / 20ms 超 ${f.filter((x) => x > 20).length} 回`,
  );
});
```

**`content-visibility: auto` を残した場合と外した場合の両方を測る**
（`ColumnItems.tsx` の `style` を落とすだけ）。仕様 8 節の問い 2 はこれで答える。

- [x] **Step 3: 記録する**

`docs/design/read-layer-followups.md` に新しい節を作り、変更前
（longtask 合計 3266ms / 最長 1258ms / スクロール中央値 16.8ms）と変更後を
表で並べる。**`content-visibility` を残す/外すの決定と、その根拠になった数字を
書くこと。** 仕様 8 節の 4 問のうち、実鍵でしか答えられないもの（問い 3・4）は
「未取得」と書き、何を見れば答えられるかを書く。**推測を書かない。**

- [x] **Step 4: 使い捨ての spec を消す → ゲート、コミット**

```bash
rm e2e/zz-progressive-probe.spec.ts
pnpm vitest run && pnpm typecheck && pnpm check
pnpm exec playwright test e2e/v1.spec.ts e2e/section-cap.spec.ts
git commit -m "test(v1): assert the column renders a window and grows on scroll"
```

---

## 検証

完了時に人間へ依頼すること。

1. `pnpm dev` → `/v1` を実鍵で開き、**スクロールで下まで読み進めて引っかかりが無いか**
2. **新着が来たとき、途中を読んでいる位置が動かないか**（仕様 2 節が保っているはずの挙動）
3. **上限 200 件で遡れる範囲が不足に感じないか**（仕様 8 節の問い 4）
4. **初期 40 件・増分 40 件が、画像の多いタイムラインでも足りているか**（問い 3）
