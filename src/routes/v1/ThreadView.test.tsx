import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import type { Component } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../core/nostr/event";
import type { EngagementRequests } from "../../core/read/engagement-requests";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import type { SectionStatus } from "../../core/read/source";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import type { EventBodyProps } from "../../core/view/renderer-registry";
import ThreadView from "./ThreadView";

// `EventStore.put` の検証を通すため、種から鍵を作り schnorr で実署名する。
const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const signed = (
  seed: number,
  overrides: Partial<NostrEvent> = {},
): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: overrides.created_at ?? 1_700_000_000,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? "note",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const fakeEventRequests = (): EventRequests => ({
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
});

const fakeProfiles = (): ProfileRequests => ({
  request() {},
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const fakeReactions = (): EngagementRequests => ({
  request() {},
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const contextWith = (store: EventStore): RenderContextValue => ({
  store,
  events: fakeEventRequests(),
  profiles: fakeProfiles(),
  engagements: fakeReactions(),
  viewerPubkey: undefined,
  // kind:1 の描画詳細はここでは主張しないので fallback のままでよい。
  renderers: [],
});

const status = (phase: SectionStatus["phase"]): (() => SectionStatus) => {
  const value: SectionStatus = { phase };
  return () => value;
};

/**
 * `createRoot` の中で Solid コンポーネントを JSX を介さず関数として直接
 * 呼び、返ってきた DOM ノードを検証する。
 */
const mount = (
  render: () => unknown,
  ctx: RenderContextValue,
): { element: () => HTMLElement; dispose: () => void } => {
  let element: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: ctx,
      get children() {
        element = render() as unknown as HTMLElement;
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

describe("ThreadView", () => {
  it("focus はセクションの応答を待たず store から即座に描かれる", () => {
    // 捕まえる変異: store からの seed をやめる (開いた直後は items() が
    // 空なので、これが無いと本人のノートまで「読み込み中」になる)。
    const focus = signed(1, { content: "focus body" });
    const store = new EventStore();
    store.put(focus, "wss://relay/");

    const { element, dispose } = mount(
      () =>
        ThreadView({
          events: () => [], // セクションはまだ何も届けていない
          focusId: focus.id,
          status: status("initial"),
        }),
      contextWith(store),
    );
    try {
      const el = element();
      const focusLi = el.querySelector('[data-testid="thread-focus"]');
      expect(focusLi).not.toBeNull();
      expect(focusLi?.textContent).not.toContain("読み込み中");
      expect(
        focusLi?.querySelector(
          '[data-testid="event-view"][data-variant="full"]',
        ),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("settled になるまでは reachedRoot: false でも truncated 警告を出さない", () => {
    // 捕まえる変異: Show 条件から phase === "settled" を落とす (祖先を
    // 待っているだけの間に確定した劣化として出してしまう)。
    const missingParentId = signed(2).id;
    const focus = signed(3, {
      tags: [["e", missingParentId, "", "root"]],
    });
    const store = new EventStore();
    store.put(focus, "wss://relay/");

    for (const phase of ["initial", "streaming"] as const) {
      const { element, dispose } = mount(
        () =>
          ThreadView({
            events: () => [],
            focusId: focus.id,
            status: status(phase),
          }),
        contextWith(store),
      );
      try {
        expect(
          element().querySelector('[data-testid="thread-truncated"]'),
        ).toBeNull();
      } finally {
        dispose();
      }
    }
  });

  it("settled になっても祖先が届いていなければ truncated 警告を出す", () => {
    // 捕まえる変異: settled でも警告を出さなくする (これ以上届かない印
    // なので、祖先が欠けているなら本物の劣化)。
    const missingParentId = signed(4).id;
    const focus = signed(5, {
      tags: [["e", missingParentId, "", "root"]],
    });
    const store = new EventStore();
    store.put(focus, "wss://relay/");

    const { element, dispose } = mount(
      () =>
        ThreadView({
          events: () => [],
          focusId: focus.id,
          status: status("settled"),
        }),
      contextWith(store),
    );
    try {
      expect(
        element().querySelector('[data-testid="thread-truncated"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("focus の EventView には hideReplyPreview が届く (親の二重表示を防ぐ配線)", () => {
    // 捕まえる変異: <EventView> から hideReplyPreview を落とす (配線が
    // 無いと親が thread-ancestor と二重に描かれる、配線自体はここでしか
    // 捕まえられない)。本物のレンダラだと Solid の DEV `createComponent`
    // が関数に印を付け他ファイルのテストに影響するので、代役の Recorder
    // で props だけを見る。
    const fullSeen: (boolean | undefined)[] = [];
    const compactSeen: (boolean | undefined)[] = [];
    const FullRecorder: Component<EventBodyProps> = (props) => {
      fullSeen.push(props.hideReplyPreview);
      return null;
    };
    const CompactRecorder: Component<EventBodyProps> = (props) => {
      compactSeen.push(props.hideReplyPreview);
      return null;
    };

    const parent = signed(6, { content: "parent" });
    const focus = signed(7, {
      content: "focus",
      tags: [["e", parent.id, "", "root"]],
    });
    const store = new EventStore();
    store.put(parent, "wss://relay/");
    store.put(focus, "wss://relay/");

    const ctx: RenderContextValue = {
      ...contextWith(store),
      renderers: [{ kind: 1, full: FullRecorder, compact: CompactRecorder }],
    };

    const { dispose } = mount(
      () =>
        ThreadView({
          events: () => [parent, focus],
          focusId: focus.id,
          status: status("settled"),
        }),
      ctx,
    );
    try {
      // focus (full) には true、compact な ancestor には届かなくてよい。
      expect(fullSeen).toEqual([true]);
      expect(compactSeen).toEqual([undefined]);
    } finally {
      dispose();
    }
  });

  it("thread-ancestor / thread-reply の <li> は padding を持つ (NoteCompact 自身は持たない)", () => {
    // 捕まえる変異: <li> から p-3 を落とす (NoteCompact は padding を
    // 持たない設計なので、無いとカラムの左端に張り付く)。
    const root = signed(8, { content: "root" });
    const focus = signed(9, {
      content: "focus",
      tags: [["e", root.id, "", "root"]],
    });
    const replyEvent = signed(10, {
      content: "reply",
      tags: [["e", focus.id, "", "reply"]],
    });
    const store = new EventStore();
    store.put(root, "wss://relay/");
    store.put(focus, "wss://relay/");
    store.put(replyEvent, "wss://relay/");

    const { element, dispose } = mount(
      () =>
        ThreadView({
          events: () => [root, focus, replyEvent],
          focusId: focus.id,
          status: status("settled"),
        }),
      contextWith(store),
    );
    try {
      const ancestor = element().querySelector(
        '[data-testid="thread-ancestor"]',
      );
      const reply = element().querySelector('[data-testid="thread-reply"]');
      // 祖先は横だけ揃え縦は上だけ (下は線が通るので空けない)。返信は
      // 兄弟で線が通らないので四方とも p-3。
      expect(ancestor?.className).toMatch(/(?:^|\s)px-3(?:\s|$)/);
      expect(ancestor?.className).toMatch(/(?:^|\s)pt-2(?:\s|$)/);
      expect(reply?.className).toMatch(/(?:^|\s)p-3(?:\s|$)/);
    } finally {
      dispose();
    }
  });

  it("祖先には threadLine が届き、返信には届かない", () => {
    // 捕まえる変異: 祖先の threadLine を落とす / 返信にも付ける (祖先は
    // 連鎖なので縦線で繋ぐが、返信は互いに兄弟であり繋ぐと「返信の返信」
    // に読み違える)。上と同じ理由で Recorder が受けた props だけを見る。
    const compactSeen: (boolean | undefined)[] = [];
    const FullRecorder: Component<EventBodyProps> = () => null;
    const CompactRecorder: Component<EventBodyProps> = (props) => {
      compactSeen.push(props.threadLine);
      return null;
    };

    const root = signed(11, { content: "root" });
    const mid = signed(12, {
      content: "mid",
      tags: [
        ["e", root.id, "", "root"],
        ["e", root.id, "", "reply"],
      ],
    });
    const focus = signed(13, {
      content: "focus",
      tags: [
        ["e", root.id, "", "root"],
        ["e", mid.id, "", "reply"],
      ],
    });
    const replyEvent = signed(14, {
      content: "reply",
      tags: [
        ["e", root.id, "", "root"],
        ["e", focus.id, "", "reply"],
      ],
    });
    const store = new EventStore();
    for (const event of [root, mid, focus, replyEvent]) {
      store.put(event, "wss://relay/");
    }

    const { dispose } = mount(
      () =>
        ThreadView({
          events: () => [root, mid, focus, replyEvent],
          focusId: focus.id,
          status: status("settled"),
        }),
      {
        ...contextWith(store),
        renderers: [{ kind: 1, full: FullRecorder, compact: CompactRecorder }],
      },
    );
    try {
      // 祖先 2 段が true、返信は undefined (1 段だけだと見逃す実装がある)。
      expect(compactSeen).toEqual([true, true, undefined]);
    } finally {
      dispose();
    }
  });

  it("祖先があるとき focus は上を 4px 詰めて線の届く位置に来る", () => {
    // 捕まえる変異: -mt-1 を落とす (線のはみ出しは 8px なのに focus は
    // p-3 で 12px 下にいるので、詰めないと線の先が 4px 切れて見える)。
    const root = signed(15, { content: "root" });
    const focus = signed(16, {
      content: "focus",
      tags: [["e", root.id, "", "root"]],
    });
    const store = new EventStore();
    store.put(root, "wss://relay/");
    store.put(focus, "wss://relay/");

    const withAncestor = mount(
      () =>
        ThreadView({
          events: () => [root, focus],
          focusId: focus.id,
          status: status("settled"),
        }),
      contextWith(store),
    );
    try {
      expect(
        withAncestor.element().querySelector('[data-testid="thread-focus"]')
          ?.className,
      ).toMatch(/(?:^|\s)-mt-1(?:\s|$)/);
    } finally {
      withAncestor.dispose();
    }

    const rootOnly = mount(
      () =>
        ThreadView({
          events: () => [root],
          focusId: root.id,
          status: status("settled"),
        }),
      contextWith(store),
    );
    try {
      expect(
        rootOnly.element().querySelector('[data-testid="thread-focus"]')
          ?.className,
      ).not.toMatch(/(?:^|\s)-mt-1(?:\s|$)/);
    } finally {
      rootOnly.dispose();
    }
  });
});
