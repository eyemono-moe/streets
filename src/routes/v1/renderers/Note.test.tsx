import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import type { Component } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../../../core/nostr/event";
import { encodeBech32 } from "../../../core/nostr/nip19";
import type { EngagementRequests } from "../../../core/read/engagement-requests";
import type { EventRequests } from "../../../core/read/event-requests";
import { EventStore } from "../../../core/read/event-store";
import type { ProfileRequests } from "../../../core/read/profile-requests";
import { formatEventTimeFull } from "../../../core/view/format-time";
import { RenderProvider } from "../../../core/view/render-context";
import type { RenderContextValue } from "../../../core/view/render-context";
import type { EventBodyProps } from "../../../core/view/renderer-registry";
import { ThreadNavProvider } from "../thread-nav";
import { NoteCompact, NoteFull } from "./Note";

// EventStore.put の検証を通すため、種から鍵を作り schnorr で実署名する。
const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const pubkeyFor = (seed: number) =>
  bytesToHex(schnorr.getPublicKey(keyFor(seed)));

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

/** `EventRequests` のテストダブル。`request` の呼び出しを記録するだけ。 */
const createRecordingEventRequests = (): EventRequests & {
  requested: string[];
} => {
  const requested: string[] = [];
  return {
    requested,
    request(id) {
      requested.push(id);
    },
    isUnresolved() {
      return false;
    },
    subscribe() {
      return () => {};
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  };
};

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

/**
 * `createRoot` の中で Solid コンポーネントを JSX を介さず関数として
 * 直接呼び、返ってきた DOM ノードを検証する。
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

/** `mount` に `ThreadNavProvider` も被せ、`useThreadNav()` が provider の中で呼ばれる形にする。 */
const mountWithNav = (
  render: () => unknown,
  ctx: RenderContextValue,
  open: (focusId: string) => void,
): { element: () => HTMLElement; dispose: () => void } => {
  let element: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: ctx,
      get children() {
        ThreadNavProvider({
          open,
          get children() {
            element = render() as unknown as HTMLElement;
            return null;
          },
        });
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

const contextWith = (
  events: EventRequests,
  store: EventStore = new EventStore(),
): RenderContextValue => ({
  store,
  events,
  profiles: fakeProfiles(),
  engagements: fakeReactions(),
  viewerPubkey: undefined,
  // kind:1 しか対象にしないのでレンダラ集合は空でよい。
  renderers: [],
});

describe("NoteFull", () => {
  it("著者・本文・時刻を出す (旧 Note.tsx と同じ見た目)", () => {
    // 捕まえる変異: いずれかの要素を落とす、または data-testid="note" を外す
    const events = createRecordingEventRequests();
    const event = signed(1, { content: "hello world", created_at: 42 });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.dataset.testid).toBe("note");
      expect(
        el.querySelector('[data-testid="note-content"]')?.textContent,
      ).toBe("hello world");
      // created_at=42 は別年なので両関数が同じ書式を返し「今」に依存
      // せず比較できる (捕まえる変異: created_at をそのまま出す)。
      const formatted = formatEventTimeFull(new Date(42 * 1000));
      const createdAt = el.querySelector('[data-testid="note-created-at"]');
      expect(createdAt?.textContent).toBe(formatted);
      // 捕まえる変異: title 属性 (完全な日時) を付けない
      expect(createdAt?.getAttribute("title")).toBe(formatted);
      expect(el.querySelector('[data-testid="note-author"]')).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("著者行は display_name と @name の 2 段 (v0 の EventBase と同じ)", () => {
    // 捕まえる変異: 名前を 1 つしか出さない (見分けや表示名の消失が起きる)。
    const events = createRecordingEventRequests();
    const event = signed(11, { content: "hi" });
    const store = new EventStore();
    store.put(
      signed(11, {
        kind: 0,
        content: JSON.stringify({ name: "handle", display_name: "表示名" }),
      }),
      "wss://relay/",
    );
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events, store),
    );
    try {
      const author = element().querySelector('[data-testid="note-author"]');
      // profile-name には display_name だけが入る (e2e が完全一致で拾う)
      expect(
        author?.querySelector('[data-testid="profile-name"]')?.textContent,
      ).toBe("表示名");
      expect(author?.textContent).toBe("表示名@handle");
    } finally {
      dispose();
    }
  });

  it("display_name が無ければ name を太字側へ回し、@name を重ねない", () => {
    // 捕まえる変異: 太字側を空にしたまま @name も出す (同じ文字列が2度並ぶ)
    const events = createRecordingEventRequests();
    const event = signed(12, { content: "hi" });
    const store = new EventStore();
    store.put(
      signed(12, { kind: 0, content: JSON.stringify({ name: "handle" }) }),
      "wss://relay/",
    );
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events, store),
    );
    try {
      const author = element().querySelector('[data-testid="note-author"]');
      expect(author?.textContent).toBe("handle");
    } finally {
      dispose();
    }
  });

  it("プロフィール未取得の著者は npub の先頭 12 文字", () => {
    // 捕まえる変異: 生 hex の短縮を出す (他クライアントで開けない)
    const events = createRecordingEventRequests();
    const event = signed(13, { content: "hi" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const author = element().querySelector('[data-testid="note-author"]');
      expect(author?.textContent).toBe(
        encodeBech32("npub", event.pubkey).slice(0, 12),
      );
    } finally {
      dispose();
    }
  });

  it("reply の pubkey があれば reply-to を即座に出す (親の到着を待たない)", () => {
    // 捕まえる変異: reply-to を出さない、または親の EventView を描かない
    const events = createRecordingEventRequests();
    const parentId = signed(2).id;
    const replierPubkey = pubkeyFor(3);
    const event = signed(4, {
      tags: [["e", parentId, "wss://relay/", "reply", replierPubkey]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      const replyTo = el.querySelector('[data-testid="reply-to"]');
      expect(replyTo).not.toBeNull();
      // pubkey は届く前でも短縮表示 (捕まえる変異: 生 hex をそのまま出す)。
      expect(replyTo?.textContent).toContain(
        `@${encodeBech32("npub", replierPubkey).slice(0, 12)}`,
      );
      expect(replyTo?.textContent).not.toContain(replierPubkey);
      // 親そのものは compact の EventView として続けて描かれる。
      const parent = el.querySelector(
        '[data-testid="event-view"][data-variant="compact"]',
      );
      expect(parent).not.toBeNull();
      // 捕まえる変異: 返信先を引用と同じ枠に入れる (見分けが付かなくなる)。
      expect(parent?.parentElement?.className ?? "").not.toMatch(
        /(?:^|\s)b-\d/,
      );
      // 親の compact 描画自体は要求してよい (compact の禁止規則とは無関係)。
      expect(events.requested).toContain(parentId);
    } finally {
      dispose();
    }
  });

  it("返信先には threadLine が届き、引用先には届かない", () => {
    // 捕まえる変異: 返信先/引用の threadLine を取り違える (関係が読めなく
    // なる/続きに見える)。代役レンダラを使うのは、本物だと Solid の DEV
    // `createComponent` が関数に印を付け、以降同じ関数を直接呼ぶテストの
    // 戻り値がメモ関数になるため。
    const seen: { id: string; threadLine?: boolean }[] = [];
    const Recorder: Component<EventBodyProps> = (props) => {
      seen.push({ id: props.event.id, threadLine: props.threadLine });
      return null;
    };

    const events = createRecordingEventRequests();
    const parent = signed(7);
    const quoted = signed(8);
    const store = new EventStore();
    store.put(parent, "wss://relay/");
    store.put(quoted, "wss://relay/");
    const event = signed(9, {
      tags: [
        ["e", parent.id, "", "reply"],
        ["q", quoted.id, ""],
      ],
    });
    const { dispose } = mount(() => NoteFull({ event }), {
      ...contextWith(events, store),
      renderers: [{ kind: 1, full: Recorder, compact: Recorder }],
    });
    try {
      expect(seen.find((s) => s.id === parent.id)?.threadLine).toBe(true);
      expect(seen.find((s) => s.id === quoted.id)?.threadLine).toBeFalsy();
    } finally {
      dispose();
    }
  });

  it("縦線は行の下へ 8px はみ出す", () => {
    // 捕まえる変異: `-mb-2` を落とす (線が行間の 8px を渡れず届かない)。
    const event = signed(22);
    const run = mount(
      () => NoteCompact({ event, threadLine: true }),
      contextWith(createRecordingEventRequests()),
    );
    try {
      expect(
        run.element().querySelector('[data-testid="thread-line"]')?.className,
      ).toMatch(/(?:^|\s)-mb-2(?:\s|$)/);
    } finally {
      run.dispose();
    }
  });

  it("返信先プレビューと本体の間を 8px 空ける", () => {
    // 捕まえる変異: `pb-2` を落とす (詰まって 1 件の投稿に見える)。
    const parent = signed(23);
    const store = new EventStore();
    store.put(parent, "wss://relay/");
    const event = signed(24, { tags: [["e", parent.id, "", "reply"]] });
    const Recorder: Component<EventBodyProps> = () => null;
    const { element, dispose } = mount(() => NoteFull({ event }), {
      ...contextWith(createRecordingEventRequests(), store),
      renderers: [{ kind: 1, full: Recorder, compact: Recorder }],
    });
    try {
      expect(element().querySelector('[class~="pb-2"]')).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("縦線で繋がる compact は full と同じ 40px のアイコン列に乗る", () => {
    // 捕まえる変異: threadLine で w-10 を付けない (列中心が 4px ずれる)。
    const event = signed(21);
    const columnOf = (el: HTMLElement) =>
      el.querySelector('[data-testid="thread-line"]')?.parentElement;

    const chained = mount(
      () => NoteCompact({ event, threadLine: true }),
      contextWith(createRecordingEventRequests()),
    );
    try {
      expect(columnOf(chained.element())?.className).toMatch(
        /(?:^|\s)w-10(?:\s|$)/,
      );
    } finally {
      chained.dispose();
    }

    // 対照: 繋がらない compact は列を広げない (理由もなく右へずれる)。
    const alone = mount(
      () => NoteCompact({ event }),
      contextWith(createRecordingEventRequests()),
    );
    try {
      expect(alone.element().querySelector('[class*="w-10"]')).toBeNull();
    } finally {
      alone.dispose();
    }
  });

  it("reply に pubkey が無ければ reply-to を出さないが、親の EventView は出す", () => {
    // 捕まえる変異: pubkey が無いのに reply-to を出す (存在しない著者名)
    const events = createRecordingEventRequests();
    const parentId = signed(5).id;
    const event = signed(6, {
      tags: [["e", parentId, "", "reply"]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="reply-to"]')).toBeNull();
      expect(
        el.querySelector('[data-testid="event-view"][data-variant="compact"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("q タグが無くても本文の nostr: から引用を描く", () => {
    // 捕まえる変異: eventRefs を "text" 固定にする (q タグ無しの引用が消える)。
    const events = createRecordingEventRequests();
    const quoted = signed(32);
    const event = signed(33, {
      content: `見て nostr:${encodeBech32("note", quoted.id)}`,
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(events.requested).toContain(quoted.id);
      expect(
        element().querySelectorAll(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).toHaveLength(1);
    } finally {
      dispose();
    }
  });

  it("q タグ (id 形式) は本文の下に compact の EventView を出す", () => {
    // 捕まえる変異: quoteTargets を呼ばない/描かない
    const events = createRecordingEventRequests();
    const quotedId = signed(7).id;
    const event = signed(8, {
      tags: [["q", quotedId, "wss://relay/"]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(events.requested).toContain(quotedId);
      expect(
        element().querySelector(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("q タグが event-address を指すときは「未対応の参照です」を出す", () => {
    // 捕まえる変異: address 形式でも EventView を描こうとする (座標が
    // 渡り EventStore は永久に見つけられない)
    const events = createRecordingEventRequests();
    const event = signed(9, {
      tags: [["q", `30023:${pubkeyFor(10)}:my-article`, "wss://relay/"]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(
        el.querySelector('[data-testid="unsupported-ref"]'),
      ).not.toBeNull();
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
      // address 形式は id でないため request の対象にすらならない。
      expect(events.requested).toEqual([]);
    } finally {
      dispose();
    }
  });
});

describe("引用の置き場所 (仕様 4.1/4.2 節)", () => {
  it("本文に現れた引用は本文の中に描かれ、最下部には出ない (同じイベントが二重に出ない)", () => {
    // 捕まえる変異: quotes() を quoteTargets に戻す (本文と最下部で二重に出る)
    const events = createRecordingEventRequests();
    const quoted = signed(60);
    const event = signed(61, {
      tags: [["q", quoted.id, "wss://relay/"]],
      content: `見て nostr:${encodeBech32("note", quoted.id)}`,
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(
        el.querySelectorAll(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).toHaveLength(1);
      const content = el.querySelector('[data-testid="note-content"]');
      expect(
        content?.querySelector('[data-testid="event-view"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("本文に埋め込まれた引用は枠 (NestedEventCard) の中にある (I-3)", () => {
    // 捕まえる変異: 本文側の埋め込みから枠を外す (本文側と最下部で見た目が違う)。
    const events = createRecordingEventRequests();
    const quoted = signed(64);
    const event = signed(65, {
      tags: [["q", quoted.id, "wss://relay/"]],
      content: `見て nostr:${encodeBech32("note", quoted.id)} です`,
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      const content = el.querySelector('[data-testid="note-content"]');
      const embedded = content?.querySelector(
        '[data-testid="event-view"][data-variant="compact"]',
      );
      expect(embedded).not.toBeNull();
      // 最下部の引用と同じ枠 (`b-1 rounded p-1`) を親要素に持つ。
      expect(embedded?.parentElement?.className ?? "").toMatch(/(?:^|\s)b-\d/);
    } finally {
      dispose();
    }
  });

  it("q タグにしか無い引用は最下部に出る (本文には現れない)", () => {
    // 捕まえる変異: tagOnlyQuoteTargets を空配列にする
    const events = createRecordingEventRequests();
    const quoted = signed(62);
    const event = signed(63, {
      tags: [["q", quoted.id, "wss://relay/"]],
      content: "本文には貼っていない",
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      const content = el.querySelector('[data-testid="note-content"]');
      expect(content?.querySelector('[data-testid="event-view"]')).toBeNull();
      expect(
        el.querySelector('[data-testid="event-view"][data-variant="compact"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });
});

describe("compact は関連イベントを一切要求しない", () => {
  it("引用と返信を両方持つ kind:1 を compact で描いても request は一度も呼ばれない。同じイベントを full で描くと呼ばれる (対照)", () => {
    // 捕まえる変異: compact でも呼び <EventView> を描く (画面が動いてしまう)。
    const parentId = signed(11).id;
    const quotedId = signed(12).id;
    const event = signed(13, {
      tags: [
        ["e", parentId, "wss://relay/", "reply"],
        ["q", quotedId, "wss://relay/"],
      ],
    });

    const compactEvents = createRecordingEventRequests();
    const compactRun = mount(
      () => NoteCompact({ event }),
      contextWith(compactEvents),
    );
    try {
      expect(compactEvents.requested).toEqual([]);
    } finally {
      compactRun.dispose();
    }

    // 対照: full なら request が呼ばれる (無いと「何もしない実装」でも通る)。
    const fullEvents = createRecordingEventRequests();
    const fullRun = mount(() => NoteFull({ event }), contextWith(fullEvents));
    try {
      expect(fullEvents.requested.length).toBeGreaterThan(0);
      expect(fullEvents.requested).toEqual(
        expect.arrayContaining([parentId, quotedId]),
      );
    } finally {
      fullRun.dispose();
    }
  });
});

describe("NoteCompact", () => {
  it("著者・本文・時刻のみを出す (reply-to/unsupported-ref/event-view を出さない)", () => {
    // 捕まえる変異: compact でも reply-to や引用の EventView を描く
    const events = createRecordingEventRequests();
    const parentId = signed(14).id;
    const quotedId = signed(15).id;
    const event = signed(16, {
      content: "compact body",
      tags: [
        ["e", parentId, "wss://relay/", "reply", pubkeyFor(17)],
        ["q", quotedId, "wss://relay/"],
      ],
    });
    const { element, dispose } = mount(
      () => NoteCompact({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.dataset.testid).toBe("note");
      expect(
        el.querySelector('[data-testid="note-content"]')?.textContent,
      ).toBe("compact body");
      expect(el.querySelector('[data-testid="reply-to"]')).toBeNull();
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
      expect(el.querySelector('[data-testid="unsupported-ref"]')).toBeNull();
    } finally {
      dispose();
    }
  });

  it("本文の引用は埋め込まれずテキストになる (compact の規則を守る)", () => {
    // 捕まえる変異: eventRefs を "embed" 固定にする (compact の規則が破れる)。
    const events = createRecordingEventRequests();
    const quoted = signed(64);
    const event = signed(65, {
      content: `見て nostr:${encodeBech32("note", quoted.id)}`,
    });
    const { element, dispose } = mount(
      () => NoteCompact({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
      expect(el.querySelector('[data-testid="event-ref-text"]')).not.toBeNull();
      expect(events.requested).toEqual([]);
    } finally {
      dispose();
    }
  });
});

describe("アバターの寸法", () => {
  it("full は w-10、compact は w-8 になる", () => {
    // 捕まえる変異: full/compact で同じ寸法クラスを使う (size prop の渡し忘れ)
    const events = createRecordingEventRequests();
    const event = signed(20, { content: "x" });

    const fullRun = mount(() => NoteFull({ event }), contextWith(events));
    try {
      const avatar = fullRun.element().querySelector('[data-testid="avatar"]');
      expect(avatar?.className).toContain("w-10");
      expect(avatar?.className).not.toContain("w-8");
    } finally {
      fullRun.dispose();
    }

    const compactRun = mount(() => NoteCompact({ event }), contextWith(events));
    try {
      const avatar = compactRun
        .element()
        .querySelector('[data-testid="avatar"]');
      expect(avatar?.className).toContain("w-8");
      expect(avatar?.className).not.toContain("w-10");
    } finally {
      compactRun.dispose();
    }
  });
});

describe("compact は自分で padding を持たない", () => {
  it("full は padding を持ち、compact は持たない", () => {
    // 捕まえる変異: compact にも padding を足す (置く側と二重でガタつく)。
    const events = createRecordingEventRequests();
    const event = signed(25, { content: "x" });

    const fullRun = mount(() => NoteFull({ event }), contextWith(events));
    try {
      expect(fullRun.element().className).toMatch(/(?:^|\s)p[ltrbxy]?-\d/);
    } finally {
      fullRun.dispose();
    }

    const compactRun = mount(() => NoteCompact({ event }), contextWith(events));
    try {
      expect(compactRun.element().className).not.toMatch(/(?:^|\s)p-\d/);
    } finally {
      compactRun.dispose();
    }
  });
});

describe("group/event", () => {
  it("NoteFull の記事要素は group/event を持つ (ホバー判定の祖先)", () => {
    // 捕まえる変異: `group/event` を落とす (展開トグルの判定が効かない)。
    const events = createRecordingEventRequests();
    const event = signed(50, { content: "x" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(element().className).toMatch(/(?:^|\s)group\/event(?:\s|$)/);
    } finally {
      dispose();
    }
  });

  it("NoteFull の記事要素は group-[_]/event:p-0 を持つ (祖先の group/event の中で padding を潰す)", () => {
    // 捕まえる変異: `group-[_]/event:p-0` を落とす (置く側と padding が二重)。
    const events = createRecordingEventRequests();
    const event = signed(53, { content: "x" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(element().className).toMatch(
        /(?:^|\s)group-\[_\]\/event:p-0(?:\s|$)/,
      );
    } finally {
      dispose();
    }
  });
});

describe("リアクション一覧の設置", () => {
  it("NoteFull はリアクションがあれば reaction-list を出す", () => {
    // 捕まえる変異: NoteFull へ ReactionList を設置し忘れる
    const events = createRecordingEventRequests();
    const event = signed(51, { content: "x" });
    const store = new EventStore();
    store.put(
      signed(52, { kind: 7, tags: [["e", event.id]], content: "+" }),
      "wss://relay/",
    );
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events, store),
    );
    try {
      expect(
        element().querySelector('[data-testid="reaction-list"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("NoteCompact はリアクションがあっても reaction-list を出さない", () => {
    // 捕まえる変異: NoteCompact にも ReactionList を設置する。
    const events = createRecordingEventRequests();
    const event = signed(53, { content: "x" });
    const store = new EventStore();
    store.put(
      signed(54, { kind: 7, tags: [["e", event.id]], content: "+" }),
      "wss://relay/",
    );
    const { element, dispose } = mount(
      () => NoteCompact({ event }),
      contextWith(events, store),
    );
    try {
      expect(
        element().querySelector('[data-testid="reaction-list"]'),
      ).toBeNull();
    } finally {
      dispose();
    }
  });
});

describe("本文が空のとき本文の器を出さない (design 6 節)", () => {
  it("content が空文字列なら note-content を描かない (骨格は残る)", () => {
    // 捕まえる変異: 空でも常に NoteContent (note-content) を描く
    const events = createRecordingEventRequests();
    const event = signed(21, { content: "" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="note-content"]')).toBeNull();
      // 骨格 (アバター・著者) は残る —— 本文が無いだけで行ごと消えない
      expect(el.querySelector('[data-testid="avatar"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="note-author"]')).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("空白だけの本文も「空」として扱う", () => {
    // 捕まえる変異: trim しない (空白だけの本文で空の器が残る)
    const events = createRecordingEventRequests();
    const event = signed(22, { content: "   \n  " });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(
        element().querySelector('[data-testid="note-content"]'),
      ).toBeNull();
    } finally {
      dispose();
    }
  });
});

/**
 * `getBoundingClientRect` が返す高さを差し替える (`ResizeObserver` の
 * 発火を待たず ref 到着時に同期で一度読むため)。他はダミー値。
 */
const fakeRect = (height: number): DOMRect =>
  ({
    height,
    width: 300,
    top: 0,
    left: 0,
    right: 300,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  }) as DOMRect;

describe("本文の高さ制限", () => {
  it("400px 未満では展開ボタンが出ない", async () => {
    // 捕まえる変異: 高さに関わらず常に展開ボタンを出す
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(fakeRect(200));
    try {
      const events = createRecordingEventRequests();
      const event = signed(23, { content: "short body" });
      const { element, dispose } = mount(
        () => NoteFull({ event }),
        contextWith(events),
      );
      try {
        // 高さの計測は createEffect 経由 (マイクロタスク) なので waitFor する。
        await vi.waitFor(() => {
          expect(
            element().querySelector('[data-testid="note-content"]'),
          ).not.toBeNull();
        });
        expect(
          element().querySelector('[data-testid="note-expand"]'),
        ).toBeNull();
      } finally {
        dispose();
      }
    } finally {
      rect.mockRestore();
    }
  });

  it("展開ボタンの背景が透明 (UA 既定の buttonface が透けない)", async () => {
    // 捕まえる変異: `bg-transparent` を落とす。UA 既定の button 背景
    // (buttonface) は `appearance-none` では消えず、グラデーション下から
    // 灰色が透ける。始点も `from-white/0` に固定する —— 補間空間によって
    // `from-transparent` だと灰色を経由しうるため。
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(fakeRect(500));
    try {
      const events = createRecordingEventRequests();
      const event = signed(26, { content: "long body" });
      const { element, dispose } = mount(
        () => NoteFull({ event }),
        contextWith(events),
      );
      try {
        await vi.waitFor(() => {
          expect(
            element().querySelector('[data-testid="note-expand"]'),
          ).not.toBeNull();
        });
        const className =
          element().querySelector('[data-testid="note-expand"]')?.className ??
          "";
        expect(className).toContain("bg-transparent");
        expect(className).not.toContain("from-transparent");
        expect(className).toContain("from-white/0");
        expect(className).toContain("dark:from-ui-950/0");
      } finally {
        dispose();
      }
    } finally {
      rect.mockRestore();
    }
  });

  it("400px 以上では展開ボタンが出て、押すと全文が出る", async () => {
    // 捕まえる変異: 折り畳んだまま展開できない (max-height が外れない)
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(fakeRect(500));
    try {
      const events = createRecordingEventRequests();
      const event = signed(24, { content: "long body" });
      const { element, dispose } = mount(
        () => NoteFull({ event }),
        contextWith(events),
      );
      // delegated event が document 経由で拾われるため実 DOM に接続する。
      document.body.appendChild(element());
      try {
        await vi.waitFor(() => {
          expect(
            element().querySelector('[data-testid="note-expand"]'),
          ).not.toBeNull();
        });
        const expandButton = element().querySelector<HTMLButtonElement>(
          '[data-testid="note-expand"]',
        );

        const wrapper = element().querySelector('[data-testid="note-content"]')
          ?.parentElement as HTMLElement;
        expect(wrapper.style.maxHeight).toBe("400px");

        expandButton?.click();

        expect(
          element().querySelector('[data-testid="note-expand"]'),
        ).toBeNull();
        expect(wrapper.style.maxHeight).toBe("none");
      } finally {
        element().remove();
        dispose();
      }
    } finally {
      rect.mockRestore();
    }
  });
});

describe("プロフィールカードのホバー", () => {
  it("著者行 (note-author) は hover-card のトリガーを持つ", () => {
    // 捕まえる変異: `<Profile>` を `<ProfileHover>` で包むのをやめる
    // (著者名にホバーしてもカードが出なくなる)。
    const events = createRecordingEventRequests();
    const event = signed(70, { content: "x" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const author = element().querySelector('[data-testid="note-author"]');
      const trigger = author?.querySelector(
        '[data-scope="hover-card"][data-part="trigger"]',
      );
      expect(trigger).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("本文中の言及 (nostr:npub) も hover-card のトリガーを持つ", () => {
    // 捕まえる変異: `<Profile>` からホバーを外し著者行だけに戻す (全て
    // `<Profile>` を通るのでこの 1 件が代表して守る)。
    const events = createRecordingEventRequests();
    const mentioned = pubkeyFor(71);
    const event = signed(72, {
      content: `見て nostr:${encodeBech32("npub", mentioned)}`,
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const content = element().querySelector('[data-testid="note-content"]');
      expect(content).not.toBeNull();
      expect(
        content?.querySelector(
          '[data-scope="hover-card"][data-part="trigger"]',
        ),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });
});

describe("hideReplyPreview (ThreadView の focus が親を二重に描かないための prop)", () => {
  it("true なら親のプレビュー (compact の EventView) を出さないが、reply-to は残す", () => {
    // 捕まえる変異: hideReplyPreview を無視する (祖先が focus の中に二重に並ぶ)。
    const events = createRecordingEventRequests();
    const parentId = signed(95).id;
    const replierPubkey = pubkeyFor(96);
    const event = signed(97, {
      tags: [["e", parentId, "wss://relay/", "reply", replierPubkey]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event, hideReplyPreview: true }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(
        el.querySelector('[data-testid="event-view"][data-variant="compact"]'),
      ).toBeNull();
      // 誰への返信かのラベルは親プレビューとは別物なので残る。
      expect(el.querySelector('[data-testid="reply-to"]')).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("渡さなければ従来どおり親のプレビューを出す (対照)", () => {
    // これが無いと上のテストは「親を描かない実装」でも通ってしまう。
    const events = createRecordingEventRequests();
    const parentId = signed(98).id;
    const event = signed(99, {
      tags: [["e", parentId, "wss://relay/", "reply"]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(
        element().querySelector(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });
});

describe("スレッドを開く", () => {
  it("ノートを押すとそのイベントの id で開く", () => {
    // 捕まえる変異: 押せるようにしない / 別の id を渡す
    const events = createRecordingEventRequests();
    const event = signed(80, { content: "open me" });
    const opened: string[] = [];
    const { element, dispose } = mountWithNav(
      () => NoteFull({ event }),
      contextWith(events),
      (id) => opened.push(id),
    );
    document.body.appendChild(element());
    try {
      element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(opened).toEqual([event.id]);
    } finally {
      element().remove();
      dispose();
    }
  });

  it("入れ子のノートを押すと内側の id で開き、外側へ伝播しない", () => {
    // 捕まえる変異: stopPropagation を落とす (外側のスレッドも開く)。
    // renderer-registry 経由で本物を子に描くと Solid の DEV
    // `createComponent` が関数に印を付け以降のテストが壊れるので、内側の
    // 要素を直接呼んで外側の DOM に差し込む。
    const events = createRecordingEventRequests();
    const outer = signed(81, { content: "outer" });
    const inner = signed(82, { content: "inner" });
    const opened: string[] = [];
    const { element, dispose } = mountWithNav(
      () => {
        const outerEl = NoteFull({ event: outer }) as unknown as HTMLElement;
        const innerEl = NoteCompact({
          event: inner,
        }) as unknown as HTMLElement;
        outerEl.appendChild(innerEl);
        return outerEl;
      },
      contextWith(events),
      (id) => opened.push(id),
    );
    document.body.appendChild(element());
    try {
      const innerArticle = element().querySelector('[data-testid="note"]');
      innerArticle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(opened).toEqual([inner.id]);
    } finally {
      element().remove();
      dispose();
    }
  });

  it("名前のホバートリガーを押してもスレッドは開かない", () => {
    // 捕まえる変異: 対話要素の判定を落とす (名前を押すとスレッドが開く)。
    const events = createRecordingEventRequests();
    const event = signed(83, { content: "x" });
    const opened: string[] = [];
    const { element, dispose } = mountWithNav(
      () => NoteFull({ event }),
      contextWith(events),
      (id) => opened.push(id),
    );
    document.body.appendChild(element());
    try {
      const trigger = element().querySelector(
        '[data-testid="note-author"] [data-scope="hover-card"][data-part="trigger"]',
      );
      expect(trigger).not.toBeNull();
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(opened).toEqual([]);
    } finally {
      element().remove();
      dispose();
    }
  });

  it("useThreadNav が undefined なら押せる見た目を持たない", () => {
    // 捕まえる変異: 常に cursor-pointer と onClick を付ける。
    const events = createRecordingEventRequests();
    const event = signed(84, { content: "x" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    document.body.appendChild(element());
    try {
      expect(element().className).not.toMatch(/cursor-pointer/);
      // click しても例外を投げないことで onClick 未設定を確かめる。
      expect(() =>
        element().dispatchEvent(new MouseEvent("click", { bubbles: true })),
      ).not.toThrow();
    } finally {
      element().remove();
      dispose();
    }
  });

  it("disableThreadOpen が true なら useThreadNav があっても押せる見た目・動作を持たない", () => {
    // 捕まえる変異: disableThreadOpen を無視する (押しても実際は何も起きない)。
    const events = createRecordingEventRequests();
    const event = signed(86, { content: "x" });
    const opened: string[] = [];
    const { element, dispose } = mountWithNav(
      () => NoteFull({ event, disableThreadOpen: true }),
      contextWith(events),
      (id) => opened.push(id),
    );
    document.body.appendChild(element());
    try {
      expect(element().className).not.toMatch(/cursor-pointer/);
      element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(opened).toEqual([]);
    } finally {
      element().remove();
      dispose();
    }
  });

  it("EventMenu (Portal で描かれるメニュー項目) を押してもスレッドは開かない", () => {
    // 捕まえる変異: `article.contains(e.target)` のチェックを外す (Portal
    // 経由で article 外の click も届く)。
    const events = createRecordingEventRequests();
    const event = signed(90, { content: "x" });
    const opened: string[] = [];
    const { element, dispose } = mountWithNav(
      () => NoteFull({ event }),
      contextWith(events),
      (id) => opened.push(id),
    );
    document.body.appendChild(element());
    try {
      const menuItem = document.body.querySelector(
        '[data-testid="event-menu"] [role="menuitem"]',
      );
      expect(menuItem).not.toBeNull();
      menuItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(opened).toEqual([]);
    } finally {
      element().remove();
      dispose();
    }
  });

  it("アバター (asChild のホバートリガー) を押してもスレッドは開かない", () => {
    // 捕まえる変異: selector から `[data-part='trigger']` を落とす
    // (Avatar の asChild トリガーは role を受け取らない)。
    const events = createRecordingEventRequests();
    const event = signed(91, { content: "x" });
    const opened: string[] = [];
    const { element, dispose } = mountWithNav(
      () => NoteFull({ event }),
      contextWith(events),
      (id) => opened.push(id),
    );
    document.body.appendChild(element());
    try {
      const avatar = element().querySelector('[data-testid="avatar"]');
      expect(avatar).not.toBeNull();
      avatar?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(opened).toEqual([]);
    } finally {
      element().remove();
      dispose();
    }
  });

  it("ドラッグでテキストを選択した後は開かない", () => {
    // 捕まえる変異: mousedown の座標を覚えない (選択のたびに開いてしまう)。
    const events = createRecordingEventRequests();
    const event = signed(85, { content: "select me" });
    const opened: string[] = [];
    const { element, dispose } = mountWithNav(
      () => NoteFull({ event }),
      contextWith(events),
      (id) => opened.push(id),
    );
    document.body.appendChild(element());
    try {
      element().dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          clientX: 0,
          clientY: 0,
        }),
      );
      element().dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
      expect(opened).toEqual([]);
    } finally {
      element().remove();
      dispose();
    }
  });
});
