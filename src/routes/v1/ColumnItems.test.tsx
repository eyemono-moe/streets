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
});
