import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import type { Component } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../../core/nostr/event";
import type { EngagementRequests } from "../../../core/read/engagement-requests";
import type { EventRequests } from "../../../core/read/event-requests";
import { EventStore } from "../../../core/read/event-store";
import type { ProfileRequests } from "../../../core/read/profile-requests";
import { RenderProvider } from "../../../core/view/render-context";
import type { RenderContextValue } from "../../../core/view/render-context";
import type { EventBodyProps } from "../../../core/view/renderer-registry";
import { ReactionCompact, ReactionFull } from "./Reaction";

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

const fakeReactions = (): EngagementRequests => ({
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
  engagements: fakeReactions(),
  viewerPubkey: undefined,
  renderers: [],
});

/**
 * 返す値が `HTMLElement | undefined` を許す —— `Reaction.tsx` の
 * トップレベルは `<Show>` で、対象不明な kind:7 は意図的に何も描かない。
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
 * トップレベルが `<Show>` のコンポーネントを直接呼ぶと、戻り値は DOM
 * ノードでなくアクセサ関数になる。ここで一度だけ吸収する。
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
  it("ルート要素は group/event と group-[_]/event:p-0 の両方を持つ", () => {
    // 捕まえる変異: どちらかを落とす。
    const targetId = signed(112).id;
    const event = signed(113, { tags: [["e", targetId]] });
    const { element, dispose } = mountBody(
      ReactionFull,
      event,
      contextWith(createRecordingEventRequests()),
    );
    try {
      const className = element()?.className ?? "";
      expect(className).toMatch(/(?:^|\s)group\/event(?:\s|$)/);
      expect(className).toMatch(/(?:^|\s)group-\[_\]\/event:p-0(?:\s|$)/);
    } finally {
      dispose();
    }
  });

  it("見出しの名前は font-700 (太字) になる", () => {
    // 捕まえる変異: font-700 を付け忘れる。単語境界で見る (全体一致だと
    // クラス追加で壊れる)。
    const targetId = signed(110).id;
    const event = signed(111, { tags: [["e", targetId]] });
    const { element, dispose } = mountBody(
      ReactionFull,
      event,
      contextWith(createRecordingEventRequests()),
    );
    try {
      const name = element()?.querySelector('[data-testid="reacted-by-name"]');
      expect(name?.className ?? "").toMatch(/(?:^|\s)font-700(?:\s|$)/);
    } finally {
      dispose();
    }
  });

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
    // 捕まえる変異: 見出しだけ描く (対象不明のまま意味の無い表示になる)
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
    // 捕まえる変異: compact でも対象の EventView を描く (関連イベントを
    // 要求しない規則が壊れる)
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
