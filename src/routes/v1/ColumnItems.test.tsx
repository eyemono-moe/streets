import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import type { ReactionRequests } from "../../core/read/reaction-requests";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import {
  INITIAL_RENDER_COUNT,
  RENDER_COUNT_STEP,
} from "../../core/view/render-window";
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
  reactions: {
    request() {},
    subscribe() {
      return () => {};
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  } satisfies ReactionRequests,
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
      expect(element().querySelectorAll('[data-testid="item"]')).toHaveLength(
        INITIAL_RENDER_COUNT,
      );
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

  it("番兵は items リストの子ではない (divide-y の区切り線を余計に出さない)", () => {
    // 捕まえる変異: 番兵を <ul data-testid="items"> の中へ戻す。divide-y
    // (`.divide-y > :not([hidden]) ~ :not([hidden])`) はリスト内の兄弟
    // 要素すべてに区切り線を当てるので、番兵が <ul> の子だと最後の
    // アイテムの下に幅いっぱいの線が 1 本余計に出る (レビュー Important)
    const { element, dispose } = mount(() => fakeEvents(600));
    try {
      const list = element().querySelector('[data-testid="items"]');
      expect(list?.querySelector('[data-testid="items-sentinel"]')).toBeNull();
      expect(
        element().querySelector('[data-testid="items-sentinel"]'),
      ).not.toBeNull();
    } finally {
      dispose();
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

  it("番兵で窓を伸ばした後、上限どおりに先頭挿入+末尾追い出しが起きても描画済みアイテムの DOM ノードは再マウントされない", () => {
    // 捕まえる変異: 窓の錨を先頭ではなく末尾に打つ (C1 の旧設計)。
    //
    // `SortedEvents` は保持上限に達すると、先頭への挿入のたびに末尾 (最古)
    // を `pop()` で捨てる。件数が上限まで伸びた窓が末尾に錨を打っていると、
    // 錨アイテム = 末尾アイテム = 次に捨てられるアイテムになり、次の 1 件で
    // 錨ごと消えて `indexOf` が -1 → 窓が INITIAL_RENDER_COUNT へ崩壊する。
    // このとき描画済みアイテムは一度 `<For>` から外れて再マウントされる
    // (この性質が守るのは「展開した長文ノートが畳まれないこと」——
    // render-window.test.ts は件数の等式しか見ないので、DOM ノードの
    // 同一性はここでしか確かめられない)。**ただの先頭挿入だけでは
    // どちらの設計でも件数がクランプされて区別が付かない** —— 上限に
    // 張り付いた状態で末尾が追い出されて初めて両設計が分岐するので、
    // 以下は総数を固定した (=`SortedEvents` と同じ) 更新にしてある。
    //
    // vitest.setup.ts の既定の IntersectionObserver スタブは「初期件数だけ
    // 描く」テストを守るため常に非交差を配信する。ここでは番兵の交差を
    // 明示的にシミュレートするため、このテストの間だけ交差を配信する
    // スタブに差し替える。
    const originalIntersectionObserver = globalThis.IntersectionObserver;
    class IntersectingObserverStub {
      readonly #callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.#callback = callback;
      }
      observe(target: Element): void {
        this.#callback(
          [
            {
              target,
              isIntersecting: true,
            } as unknown as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    globalThis.IntersectionObserver =
      IntersectingObserverStub as unknown as typeof IntersectionObserver;

    try {
      // 上限 (=セクション件数) を INITIAL_RENDER_COUNT + RENDER_COUNT_STEP
      // と同じ 80 に合わせる —— 番兵が 1 回交差すれば窓がちょうど全件
      // (80/80) まで伸びる状態を作れる。全件描いた状態は「窓が上限まで
      // 伸びきった」を意味し、これが C1 の前提条件そのもの。
      const capacity = INITIAL_RENDER_COUNT + RENDER_COUNT_STEP;
      const events = fakeEvents(capacity);
      const [items, setItems] = createSignal<readonly NostrEvent[]>(events);
      const { element, dispose } = mount(items);
      try {
        // マウント時に番兵が即座に交差を配信するので、窓は capacity 件
        // (=全件) まで一度伸びている —— これが「一度 growRenderWindow を
        // 発火させた状態」を作る。
        const before = element().querySelectorAll<HTMLElement>(
          '[data-testid="item"]',
        );
        expect(before).toHaveLength(capacity);
        const target = before[50];

        // <For> はアイテムを参照の同一性で追跡する。既存アイテムは同じ
        // オブジェクトを再利用しつつ、`SortedEvents.add` と同じ形
        // (先頭へ 1 件足し、上限超過ぶんを末尾から 1 件捨てる) で更新する。
        const newest = fakeEvent(9999);
        setItems([newest, ...events.slice(0, capacity - 1)]);

        const after = element().querySelectorAll<HTMLElement>(
          '[data-testid="item"]',
        );
        // 先頭へ 1 件入ったぶん旧添字 50 のアイテムは新添字 51 へ移るが、
        // 総数は capacity のまま変わらないので窓は依然として全件を覆う
        // —— 件数ではなく同じ DOM ノードであることを見る。
        expect(after[51]).toBe(target);
      } finally {
        dispose();
      }
    } finally {
      globalThis.IntersectionObserver = originalIntersectionObserver;
    }
  });
});
