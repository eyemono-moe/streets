import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../../core/nostr/event";
import type { EngagementRequests } from "../../../core/read/engagement-requests";
import type { EventRequests } from "../../../core/read/event-requests";
import { EventStore } from "../../../core/read/event-store";
import type { ProfileRequests } from "../../../core/read/profile-requests";
import { RenderProvider } from "../../../core/view/render-context";
import type { RenderContextValue } from "../../../core/view/render-context";
import type { EventRenderer } from "../../../core/view/renderer-registry";
import { NoteCompact, NoteFull } from "./Note";
import { RepostCompact, RepostFull } from "./Repost";

// Note.test.tsx / EventView.test.tsx と同じ手法。
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
    kind: overrides.kind ?? 6,
    tags: overrides.tags ?? [],
    content: overrides.content ?? "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

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

const noteRenderer: EventRenderer = {
  kind: 1,
  full: NoteFull,
  compact: NoteCompact,
};

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

const contextWith = (options: {
  events?: EventRequests;
  store?: EventStore;
  renderers?: readonly EventRenderer[];
}): RenderContextValue => ({
  store: options.store ?? new EventStore(),
  events: options.events ?? createRecordingEventRequests(),
  profiles: fakeProfiles(),
  engagements: fakeReactions(),
  viewerPubkey: undefined,
  renderers: options.renderers ?? [noteRenderer],
});

describe("RepostFull", () => {
  it("『@x がリポスト』を出す", () => {
    // 捕まえる変異: repost-by を出さない
    const event = signed(1, { kind: 6, content: "" });
    const { element, dispose } = mount(
      () => RepostFull({ event }),
      contextWith({}),
    );
    try {
      expect(
        element().querySelector('[data-testid="repost-by"]')?.textContent,
      ).toContain("がリポスト");
    } finally {
      dispose();
    }
  });

  it("ルート要素は group/event と group-[_]/event:p-0 の両方を持つ", () => {
    // 捕まえる変異: どちらかを落とす。対象を `full` で描く (spec 3 節) ため
    // 対象のノート/リポスト/リアクションはこの枠の中にそのまま入る。
    // `group/event` が無いと、リポストの中のリポストで内側の padding が
    // 潰れない (祖先に group/event が無いため)。`group-[_]/event:p-0` が
    // 無いと、自分がさらに別の枠の中に置かれたとき自分の padding が
    // 二重になる。
    const event = signed(15, { kind: 6, content: "" });
    const { element, dispose } = mount(
      () => RepostFull({ event }),
      contextWith({}),
    );
    try {
      const className = element().className;
      expect(className).toMatch(/(?:^|\s)group\/event(?:\s|$)/);
      expect(className).toMatch(/(?:^|\s)group-\[_\]\/event:p-0(?:\s|$)/);
    } finally {
      dispose();
    }
  });

  it("見出しの名前は font-700 (太字) になる", () => {
    // 捕まえる変異: 見出しの名前に font-700 を付け忘れる/落とす。長い
    // 表示名で「がリポスト」まで見出しが 2 行に折り返す原因になる
    // (仕様 3.1 節)。単語境界で見る —— クラス文字列全体一致だと、無関係な
    // クラスを足しただけで壊れる脆いテストになる。
    const event = signed(14, { kind: 6, content: "" });
    const { element, dispose } = mount(
      () => RepostFull({ event }),
      contextWith({}),
    );
    try {
      const name = element().querySelector('[data-testid="repost-by-name"]');
      expect(name?.className ?? "").toMatch(/(?:^|\s)font-700(?:\s|$)/);
    } finally {
      dispose();
    }
  });

  it("リポストの対象は compact ではなく full で描く", () => {
    // 捕まえる変異: variant="compact" に戻す。v0 は対象を完全な Event として
    // 描いており (showReactions showActions 付き)、compact にすると対象の
    // 返信先・引用・リアクション一覧が消える (仕様 3 節)。
    const events = createRecordingEventRequests();
    const targetId = signed(40).id;
    const event = signed(41, {
      kind: 6,
      tags: [["e", targetId, "wss://relay/"]],
      content: "",
    });
    const { element, dispose } = mount(
      () => RepostFull({ event }),
      contextWith({ events }),
    );
    try {
      expect(
        element().querySelector(
          '[data-testid="event-view"][data-variant="full"]',
        ),
      ).not.toBeNull();
      expect(
        element().querySelector(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).toBeNull();
    } finally {
      dispose();
    }
  });

  it("content の埋め込みが有効な署名を持つなら、それを store.put に通し対象にする", () => {
    // 捕まえる変異: e タグの id を使う (埋め込みを無視する)。embedded と e
    // タグに別々の id を持たせることで、どちらが実際に使われたかを区別する。
    const target = signed(2, { kind: 1, content: "embedded body" });
    const eTagId = signed(3, { kind: 1 }).id; // embedded とは別の id
    const repost = signed(4, {
      kind: 6,
      content: JSON.stringify(target),
      tags: [["e", eTagId, "wss://relay/"]],
    });
    const store = new EventStore();
    const { element, dispose } = mount(
      () => RepostFull({ event: repost }),
      contextWith({ store }),
    );
    try {
      // put を通ったので store に入っている (実在するリレー URL ではない
      // "embedded" が記録されていることも合わせて確認する —— seenRelays が
      // routing-table のヒントとして読まれるので、埋め込み由来を実在リレー
      // の提供として記録してはいけない)。
      expect(store.get(target.id)).toEqual(target);
      expect(store.seenRelays(target.id)).toEqual(["embedded"]);
      // 対象として描かれているのは embedded の id (full の EventView が
      // 直ちに中身を描ける = 既に store にある) であって e タグの id ではない。
      expect(
        element().querySelector(
          `[data-testid="event-view"][data-variant="full"]`,
        )?.textContent,
      ).toContain("embedded body");
      expect(store.get(eTagId)).toBeUndefined();
    } finally {
      dispose();
    }
  });

  it("埋め込みの署名が壊れていれば e タグへ引き直す", () => {
    // 捕まえる変異: put が rejected を返しても embedded.id をそのまま使う
    // (署名検証を通っていない = 攻撃者が書いた任意の id を対象にしてしまう)
    const forged = signed(5, { kind: 1, content: "forged" });
    // sig を壊す (schnorr 検証に失敗させる)。
    const brokenEmbedded: NostrEvent = { ...forged, sig: "0".repeat(128) };
    const realTarget = signed(6, { kind: 1, content: "real fallback body" });
    const repost = signed(7, {
      kind: 6,
      content: JSON.stringify(brokenEmbedded),
      tags: [["e", realTarget.id, "wss://relay/"]],
    });
    const store = new EventStore();
    store.put(realTarget, "wss://relay/");
    const { element, dispose } = mount(
      () => RepostFull({ event: repost }),
      contextWith({ store }),
    );
    try {
      expect(store.get(brokenEmbedded.id)).toBeUndefined();
      expect(
        element().querySelector(
          '[data-testid="event-view"][data-variant="full"]',
        )?.textContent,
      ).toContain("real fallback body");
    } finally {
      dispose();
    }
  });

  it("埋め込みも e タグも無ければ「リポスト（対象不明）」を出す", () => {
    // 捕まえる変異: 何も無いのに何らかの EventView を描こうとする
    // (id を渡せず永久に読み込み中/読み込めませんでした表示になる)
    const repost = signed(8, { kind: 6, content: "", tags: [] });
    const { element, dispose } = mount(
      () => RepostFull({ event: repost }),
      contextWith({}),
    );
    try {
      expect(
        element().querySelector('[data-testid="repost-unknown"]')?.textContent,
      ).toContain("対象不明");
      expect(element().querySelector('[data-testid="event-view"]')).toBeNull();
    } finally {
      dispose();
    }
  });

  it("k タグが実際の kind と食い違っていても、対象の実イベントの kind で描く (k タグは読まない)", () => {
    // 捕まえる変異: k タグを読んで対象の見た目を決める。k タグは
    // "1" (kind:1) だが埋め込みの実イベントは未登録の kind:9999 —— k タグを
    // 信用すると NoteFull/NoteCompact を出そうとしてしまうが、正しい実装は
    // 対象自身の kind (9999) を EventView 経由で引き、未登録レンダラなので
    // fallback (kind 番号の表示) になる。
    const target = signed(9, { kind: 9999, content: "unregistered kind" });
    const repost = signed(10, {
      kind: 16,
      content: JSON.stringify(target),
      tags: [["k", "1"]],
    });
    const store = new EventStore();
    const { element, dispose } = mount(
      () => RepostFull({ event: repost }),
      contextWith({ store, renderers: [noteRenderer] }), // kind:9999 は未登録
    );
    try {
      // NoteFull/NoteCompact (data-testid="note") には決してならない ——
      // k タグの "1" を信じるとここが note になってしまう。
      expect(element().querySelector('[data-testid="note"]')).toBeNull();
      const fullView = element().querySelector(
        '[data-testid="event-view"][data-variant="full"]',
      );
      expect(fullView).not.toBeNull();
      expect(fullView?.textContent).toContain("9999");
    } finally {
      dispose();
    }
  });
});

describe("RepostCompact", () => {
  it("『@x がリポスト』の 1 行だけを出し、対象を描かない", () => {
    // 捕まえる変異: compact でも対象の EventView を描く
    const target = signed(11, { kind: 1, content: "should not appear" });
    const repost = signed(12, {
      kind: 6,
      content: JSON.stringify(target),
      tags: [["e", signed(13, { kind: 1 }).id, "wss://relay/"]],
    });
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const { element, dispose } = mount(
      () => RepostCompact({ event: repost }),
      contextWith({ events, store }),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="repost-by"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
      expect(el.querySelector('[data-testid="repost-unknown"]')).toBeNull();
      // 対象決定 (embeddedRepostEvent → store.put) 自体を呼ばない ——
      // compact は関連イベントを一切要求しない (spec 3 節)。
      expect(store.get(target.id)).toBeUndefined();
      expect(events.requested).toEqual([]);
    } finally {
      dispose();
    }
  });
});
