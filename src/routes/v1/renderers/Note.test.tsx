import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../../core/nostr/event";
import type { EventRequests } from "../../../core/read/event-requests";
import { EventStore } from "../../../core/read/event-store";
import type { ProfileRequests } from "../../../core/read/profile-requests";
import { RenderProvider } from "../../../core/view/render-context";
import type { RenderContextValue } from "../../../core/view/render-context";
import { NoteCompact, NoteFull } from "./Note";

// EventView.test.tsx / profile-requests.test.ts と同じ手法: 種から 32 byte
// 鍵を作り schnorr で実署名する。
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

/**
 * `EventRequests` のテストダブル。`request` の呼び出しを記録するだけ ——
 * Step 2 の「compact は要求しない」を直接主張するのに必要な最小限。
 */
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

/**
 * `EventView.test.tsx` と同じ手法: `createRoot` の中で Solid コンポーネント
 * を JSX を介さず関数として直接呼び、返ってきた DOM ノードを検証する。
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

const contextWith = (
  events: EventRequests,
  store: EventStore = new EventStore(),
): RenderContextValue => ({
  store,
  events,
  profiles: fakeProfiles(),
  // kind:1 しかテスト対象にしないので、レンダラ集合は空でよい (引用・返信
  // 先は常に compact の EventView 経由で描かれ、store に無い間は
  // event-loading のまま — renderer の解決まで届かない)。
  renderers: [],
});

describe("NoteFull", () => {
  it("著者・本文・時刻を出す (旧 Note.tsx と同じ見た目)", () => {
    // 捕まえる変異: note-author/note-content/note-created-at のいずれかを
    // 落とす、または data-testid="note" を外す
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
      expect(
        el.querySelector('[data-testid="note-created-at"]')?.textContent,
      ).toBe("42");
      expect(el.querySelector('[data-testid="note-author"]')).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("reply の pubkey があれば reply-to を即座に出す (親の到着を待たない)", () => {
    // 捕まえる変異: reply-to を出さない、または EventView (親の compact) を
    // 描かない
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
      // pubkey は届く前でも短縮表示で即座に出る (Profile.tsx の縮退)。
      expect(replyTo?.textContent).toContain(`${replierPubkey.slice(0, 8)}…`);
      expect(replyTo?.textContent).toContain("への返信");
      // 親そのものは compact の EventView として続けて描かれる。
      expect(
        el.querySelector('[data-testid="event-view"][data-variant="compact"]'),
      ).not.toBeNull();
      // 要求はしている (親の compact 描画自体は要求してよい —— これは
      // full の話であり、compact 側の禁止規則とは無関係)。
      expect(events.requested).toContain(parentId);
    } finally {
      dispose();
    }
  });

  it("reply に pubkey が無ければ reply-to を出さないが、親の EventView は出す", () => {
    // 捕まえる変異: pubkey が無いのに reply-to を出す (存在しない著者名を
    // でっち上げることになる)
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
    // 捕まえる変異: address 形式でも id 形式と同じく EventView (compact) を
    // 描こうとする (id ではなく座標が渡り、EventStore は永久に見つけられない)
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
      // address 形式は request の対象にすらならない (id ではないので
      // EventRequests に渡しようが無い)。
      expect(events.requested).toEqual([]);
    } finally {
      dispose();
    }
  });
});

describe("compact は関連イベントを一切要求しない (spec 3 節・brief Step 2)", () => {
  it("引用と返信を両方持つ kind:1 を compact で描いても request は一度も呼ばれない。同じイベントを full で描くと呼ばれる (対照)", () => {
    // 捕まえる変異: compact でも replyTarget/quoteTargets を呼んで
    // <EventView> を描く。これが破れても画面は深くなるだけで動いてしまう
    // ため、ここで直接固定する (brief Step 2 の核心)。
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

    // 対照: 同じイベントを full で描くと (親・引用先の compact 描画を
    // 通じて) request が呼ばれる。この対照が無いと、上のアサーションは
    // 「そもそも何も request しない実装」でも通ってしまう。
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
});
