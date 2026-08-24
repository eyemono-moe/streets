import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import type { Component } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../core/nostr/event";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import type { ReactionRequests } from "../../core/read/reaction-requests";
import type { SectionStatus } from "../../core/read/source";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import type { EventBodyProps } from "../../core/view/renderer-registry";
import ThreadView from "./ThreadView";

// EventView.test.tsx / renderers/Note.test.tsx と同じ手法: 種から 32 byte
// 鍵を作り schnorr で実署名する (`EventStore.put` の検証を通すため)。
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

const fakeReactions = (): ReactionRequests => ({
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
  reactions: fakeReactions(),
  viewerPubkey: undefined,
  // kind:1 の描画詳細はここでは主張しない (EventView/Note.test.tsx が担う)
  // ので、fallback (UnknownKind) のままでよい。
  renderers: [],
});

const status = (phase: SectionStatus["phase"]): (() => SectionStatus) => {
  const value: SectionStatus = { phase };
  return () => value;
};

/**
 * `Note.test.tsx` の `mount` と同じ手筋: `createRoot` の中で Solid
 * コンポーネントを JSX を介さず関数として直接呼び、返ってきた DOM ノードを
 * 検証する。
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
    // 捕まえる変異: store からの seed をやめる (props.events() だけを見る)。
    // 開いた直後は SectionReader がまだ何も届けていない (items() が空) ので、
    // このシードが無いと押した本人のノートまで「読み込み中」に化ける。
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
    // 捕まえる変異: 警告の Show 条件から status().phase === "settled" を
    // 落とす。祖先の到着を待っているだけの間 (initial/streaming) に
    // 「取得できていません」を確定した事実として出すと、まだ存在しない
    // 劣化を見せることになる (ADR-0011 が禁じる逆方向の不正直さ)。
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
    // 捕まえる変異: 警告を settled のときも一切出さなくする。settled は
    // 「これ以上届く見込みが無い」印であり、それでも祖先が欠けているなら
    // 本物の劣化なので、ADR-0011 に従い黙らせてはいけない。
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
    // 捕まえる変異: focus を描く <EventView> から hideReplyPreview を
    // 落とす。`NoteFull` 単体がこの prop を正しく扱っても、ここで配線
    // されていなければ focus の中に親 (= 直前の thread-ancestor と同じ
    // イベント) がもう一度描かれてしまう —— `renderers/Note.test.tsx` が
    // 主張しているのは `NoteFull` 単体の振る舞いだけなので、配線そのもの
    // はここでしか捕まえられない。
    //
    // 本物の `NoteFull`/`NoteCompact` を renderer として登録すると、
    // Solid の DEV 版 `createComponent` がその関数自体に印を付け、
    // 別ファイル (`renderers/Note.test.tsx`) が同じ関数を直接呼ぶテストに
    // 影響しうる (そちらのファイル冒頭のコメント参照)。ここでは代役の
    // Recorder で受け取った props だけを見る。
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
      // focus (full) には true が届く。ancestor (compact, parent) は
      // 元々このプレビューを持たない compact なので届かなくてよい。
      expect(fullSeen).toEqual([true]);
      expect(compactSeen).toEqual([undefined]);
    } finally {
      dispose();
    }
  });

  it("thread-ancestor / thread-reply の <li> は padding を持つ (NoteCompact 自身は持たない)", () => {
    // 捕まえる変異: <li> から p-3 を落とす。`NoteCompact` は自分で padding
    // を持たない設計 (置く側の責務、`Note.tsx` の `NoteCompact` コメント
    // 参照) なので、ここで足さないとカラムの左端に張り付いたまま並ぶ
    // (focus は `NoteFull` 自身が p-3 を持つので対象外)。
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
      // 祖先は横だけ揃え、縦は上だけ (下は線が通る場所なので空けない)。
      // 返信は兄弟で線が通らないので四方とも p-3。
      expect(ancestor?.className).toMatch(/(?:^|\s)px-3(?:\s|$)/);
      expect(ancestor?.className).toMatch(/(?:^|\s)pt-2(?:\s|$)/);
      expect(reply?.className).toMatch(/(?:^|\s)p-3(?:\s|$)/);
    } finally {
      dispose();
    }
  });

  it("祖先には threadLine が届き、返信には届かない", () => {
    // 捕まえる変異: 祖先の EventView から threadLine を落とす / 返信にも
    // 付ける。祖先は「誰が誰に返信したか」の連鎖なので縦線で繋ぐ (v0 の
    // `EventBase` の hasChild と同じ見せ方) が、focus の下に並ぶ返信は
    // 連鎖ではなく互いに兄弟であり、繋ぐと「返信の返信」だと読み違える。
    //
    // 線そのものを描くのは `NoteBody` (`renderers/Note.tsx`) なので、
    // ここで見えるのは配線だけ —— 上の hideReplyPreview のテストと同じ
    // 理由で、本物のレンダラではなく Recorder が受けた props を見る。
    const compactSeen: ("flush" | "spill" | undefined)[] = [];
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
      // 祖先 2 段 (root, mid) が true、返信 1 件が undefined。祖先を
      // 1 段だけで見ると、先頭にしか付けない実装を見逃す。
      expect(compactSeen).toEqual(["spill", "spill", undefined]);
    } finally {
      dispose();
    }
  });

  it("祖先があるとき focus は上を 4px 詰めて線の届く位置に来る", () => {
    // 捕まえる変異: -mt-1 を落とす。祖先の線がはみ出すのは 8px
    // (`Note.tsx` の `spill`) なのに、focus は `NoteFull` 自前の p-3 で
    // 12px 下にいる —— 詰めないと線の先に 4px の空白が残って切れて見える。
    // 祖先が無いときに詰めると、逆に根の上だけ余白が浅くなる。
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
