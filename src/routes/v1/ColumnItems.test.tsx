import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import type { EngagementRequests } from "../../core/read/engagement-requests";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
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
  engagements: {
    request() {},
    subscribe() {
      return () => {};
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  } satisfies EngagementRequests,
  viewerPubkey: undefined,
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
    // (初回のブロッキングがそのまま残る)
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
    // 捕まえる変異: 番兵を常に出す (全件描いた後もコールバックが走り続ける)
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
    // 捕まえる変異: 番兵を <ul> の中へ戻す (divide-y が兄弟全部に区切り線
    // を当てるので、最後のアイテムの下に線が 1 本余計に出る)
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
    // 捕まえる変異: position:absolute を当てる (通常フローでなくなると
    // scroll anchoring が働かず、新着が積まれるとスクロール位置が飛ぶ)
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
    // 捕まえる変異: 窓の錨を先頭ではなく末尾に打つ。`SortedEvents` は上限
    // 超過時に末尾を pop するので、末尾に錨があると次の 1 件で錨ごと消え
    // 窓が崩壊し、描画済みアイテムが再マウントされる (長文が畳まれる)。
    //
    // IntersectionObserver の既定スタブは非交差のままなので、このテスト
    // だけ交差を配信するスタブに差し替える。
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
      // この上限なら番兵が 1 回交差すれば窓がちょうど全件まで伸びる。
      const capacity = INITIAL_RENDER_COUNT + RENDER_COUNT_STEP;
      const events = fakeEvents(capacity);
      const [items, setItems] = createSignal<readonly NostrEvent[]>(events);
      const { element, dispose } = mount(items);
      try {
        // マウント時に番兵が即座に交差を配信するので窓は全件まで伸びる。
        const before = element().querySelectorAll<HTMLElement>(
          '[data-testid="item"]',
        );
        expect(before).toHaveLength(capacity);
        const target = before[50];

        // <For> は参照の同一性で追跡するので、既存オブジェクトを再利用
        // しつつ先頭へ 1 件足し末尾を 1 件捨てる形で更新する。
        const newest = fakeEvent(9999);
        setItems([newest, ...events.slice(0, capacity - 1)]);

        const after = element().querySelectorAll<HTMLElement>(
          '[data-testid="item"]',
        );
        // 旧添字 50 は新添字 51 へ移る —— 件数でなく同じ DOM ノードを見る。
        expect(after[51]).toBe(target);
      } finally {
        dispose();
      }
    } finally {
      globalThis.IntersectionObserver = originalIntersectionObserver;
    }
  });
});
