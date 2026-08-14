import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import type { Component } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../../core/nostr/event";
import type { EventRequests } from "../../../core/read/event-requests";
import { EventStore } from "../../../core/read/event-store";
import type { ProfileRequests } from "../../../core/read/profile-requests";
import type { ReactionRequests } from "../../../core/read/reaction-requests";
import { RenderProvider } from "../../../core/view/render-context";
import type { RenderContextValue } from "../../../core/view/render-context";
import type { EventBodyProps } from "../../../core/view/renderer-registry";
import { ReactionCompact, ReactionFull } from "./Reaction";

// Note.test.tsx と同じ手法。
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
    kind: overrides.kind ?? 7,
    tags: overrides.tags ?? [],
    content: overrides.content ?? "+",
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

const fakeReactions = (): ReactionRequests => ({
  request() {},
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const contextWith = (events: EventRequests): RenderContextValue => ({
  store: new EventStore(),
  events,
  profiles: fakeProfiles(),
  reactions: fakeReactions(),
  renderers: [],
});

/**
 * `Note.test.tsx` の `mount` と同じ形。ここだけ返す値が `HTMLElement |
 * undefined` を許す —— `Reaction.tsx` のトップレベルは `<Show>` で、
 * 対象不明な kind:7 は**意図的に何も描かない**ため、Note.tsx の
 * `mount`(見つからなければ即例外) をそのまま使うと正常系まで落ちてしまう。
 */
const mount = (
  render: () => unknown,
  ctx: RenderContextValue,
): { element: () => HTMLElement | undefined; dispose: () => void } => {
  let element: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: ctx,
      get children() {
        element = render() as unknown as HTMLElement | undefined;
        return null;
      },
    });
  });
  return {
    element: () => element,
    dispose: disposeRoot,
  };
};

/**
 * `ReactionFull`/`ReactionCompact` を直接関数として呼ぶと、トップレベルが
 * `<Show>` (`solid-js` の `createMemo` の薄いラッパー) であるせいで戻り値は
 * DOM ノードではなく**アクセサ関数**になる (`element.dataset` 等ではなく
 * `element()` を経由しないと実体に届かない、実測して確認済み)。他の
 * レンダラ (`Note.tsx` など) はトップレベルが `<article>` なのでこの変換が
 * 要らない —— `Reaction.tsx` だけの事情なので、ここで一度だけ吸収する。
 */
const mountBody = (
  Body: Component<EventBodyProps>,
  event: NostrEvent,
  ctx: RenderContextValue,
): { element: () => HTMLElement | undefined; dispose: () => void } =>
  mount(
    () => (Body({ event }) as unknown as () => HTMLElement | undefined)(),
    ctx,
  );

describe("ReactionFull", () => {
  it("見出しと対象の full な EventView が出る", () => {
    // 捕まえる変異: 対象を描かない / variant="compact" にする
    const events = createRecordingEventRequests();
    const targetId = signed(101).id;
    const event = signed(102, { tags: [["e", targetId]] });
    const { element, dispose } = mountBody(
      ReactionFull,
      event,
      contextWith(events),
    );
    try {
      const el = element();
      expect(el).toBeDefined();
      expect(el?.querySelector('[data-testid="reacted-by"]')).not.toBeNull();
      expect(
        el?.querySelector('[data-testid="event-view"][data-variant="full"]'),
      ).not.toBeNull();
      expect(
        el?.querySelector('[data-testid="event-view"][data-variant="compact"]'),
      ).toBeNull();
    } finally {
      dispose();
    }
  });

  it("e タグが無い kind:7 は何も描かない", () => {
    // 捕まえる変異: 見出しだけ描く (対象不明のまま「@x がリアクション」の
    // 行だけが並ぶ意味の無い表示になる)
    const events = createRecordingEventRequests();
    const event = signed(103, { tags: [] });
    const { element, dispose } = mountBody(
      ReactionFull,
      event,
      contextWith(events),
    );
    try {
      expect(element()).toBeUndefined();
    } finally {
      dispose();
    }
  });

  it("+ でハートアイコンが出る", () => {
    // 捕まえる変異: 反応内容を見ずに常にテキスト (`+` という文字) を出す
    const events = createRecordingEventRequests();
    const targetId = signed(104).id;
    const event = signed(105, { content: "+", tags: [["e", targetId]] });
    const { element, dispose } = mountBody(
      ReactionFull,
      event,
      contextWith(events),
    );
    try {
      const el = element();
      expect(el?.querySelector('[data-testid="reaction-like"]')).not.toBeNull();
      expect(el?.querySelector('[data-testid="reaction-emoji"]')).toBeNull();
    } finally {
      dispose();
    }
  });

  it("カスタム絵文字で <img> が出る", () => {
    // 捕まえる変異: 絵文字タグを見ずにショートコードのテキストのまま出す
    const events = createRecordingEventRequests();
    const targetId = signed(106).id;
    const event = signed(107, {
      content: ":partyparrot:",
      tags: [
        ["e", targetId],
        ["emoji", "partyparrot", "https://example.com/pp.png"],
      ],
    });
    const { element, dispose } = mountBody(
      ReactionFull,
      event,
      contextWith(events),
    );
    try {
      const el = element();
      const img = el?.querySelector<HTMLImageElement>(
        '[data-testid="reaction-emoji"]',
      );
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("https://example.com/pp.png");
      expect(img?.getAttribute("alt")).toBe("partyparrot");
      expect(el?.textContent).not.toContain(":partyparrot:");
    } finally {
      dispose();
    }
  });
});

describe("ReactionCompact", () => {
  it("見出しだけを出し、対象の EventView は出さない", () => {
    // 捕まえる変異: compact でも対象の EventView を描く (関連イベント要求の
    // 規則が壊れる。`Note.tsx`/`Repost.tsx` の compact と同じ規則)
    const events = createRecordingEventRequests();
    const targetId = signed(108).id;
    const event = signed(109, { tags: [["e", targetId]] });
    const { element, dispose } = mountBody(
      ReactionCompact,
      event,
      contextWith(events),
    );
    try {
      const el = element();
      expect(el).toBeDefined();
      expect(el?.querySelector('[data-testid="reacted-by"]')).not.toBeNull();
      expect(el?.querySelector('[data-testid="event-view"]')).toBeNull();
      expect(events.requested).toEqual([]);
    } finally {
      dispose();
    }
  });
});
