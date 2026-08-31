import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import { encodeBech32 } from "../../core/nostr/nip19";
import type { EngagementRequests } from "../../core/read/engagement-requests";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import NoteContent from "./NoteContent";
import type { NoteContentProps } from "./NoteContent";

const PUBKEY =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
const ID = "1".repeat(64);

const base: NostrEvent = {
  id: ID,
  pubkey: PUBKEY,
  created_at: 1000,
  kind: 1,
  tags: [],
  content: "",
  sig: "0".repeat(128),
};

const noteWith = (content: string, tags: string[][] = []): NostrEvent => ({
  ...base,
  content,
  tags,
});

// production の `encodeBech32` は hex しか受けないので、nprofile/nevent/naddr
// のテストデータを組むための最小 TLV エンコーダを持つ。
type TlvEntry = { type: number; value: Uint8Array };

const encodeTlv = (entries: TlvEntry[]): Uint8Array => {
  const chunks = entries.map(({ type, value }) => {
    const chunk = new Uint8Array(2 + value.length);
    chunk[0] = type;
    chunk[1] = value.length;
    chunk.set(value, 2);
    return chunk;
  });
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const asciiBytes = (value: string): Uint8Array =>
  new TextEncoder().encode(value);

const kindBytes = (kind: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, kind, false);
  return bytes;
};

const encodeEntity = (prefix: string, entries: TlvEntry[]): string =>
  encodeBech32(prefix, bytesToHex(encodeTlv(entries)));

/** mention の解決経路が `Profile`/`EventView` を通ることだけを確かめる最小実装。 */
const fakeEvents = (): EventRequests => ({
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

const contextWith = (
  store: EventStore = new EventStore(),
): RenderContextValue => ({
  store,
  events: fakeEvents(),
  profiles: fakeProfiles(),
  engagements: fakeReactions(),
  viewerPubkey: undefined,
  renderers: [],
});

/**
 * Solid コンポーネントを JSX を介さず関数として直接呼び、返ってきた DOM
 * ノードを検証する。
 */
const mount = (
  props: NoteContentProps,
  ctx: RenderContextValue = contextWith(),
): { element: () => HTMLElement; dispose: () => void } => {
  let element: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: ctx,
      get children() {
        element = NoteContent(props) as unknown as HTMLElement;
        return null;
      },
    });
  });
  return {
    element: () => {
      if (!element) throw new Error("NoteContent did not mount");
      return element;
    },
    dispose: disposeRoot,
  };
};

describe("NoteContent: url トークン", () => {
  it("full では画像 URL が <img> になる", () => {
    // 捕まえる変異: 画像を出さない (常にリンクへ倒す)
    const url = "https://example.com/cat.png";
    const event = noteWith(url);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      const img = element().querySelector('[data-testid="content-image"]');
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe(url);
    } finally {
      dispose();
    }
  });

  it("compact では画像 URL がリンクのまま (展開しない)", () => {
    // 捕まえる変異: variant を見ずに常に展開する (compact で原寸画像が
    // カラムを埋め、元の投稿が見えなくなる)。
    const url = "https://example.com/cat.png";
    const event = noteWith(url);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "compact",
      eventRefs: "text",
    });
    try {
      expect(
        element().querySelector('[data-testid="content-image"]'),
      ).toBeNull();
      const link = element().querySelector("a");
      expect(link?.getAttribute("href")).toBe(url);
      expect(link?.textContent).toBe(url);
    } finally {
      dispose();
    }
  });

  it("画像でない URL は full でもリンクのまま", () => {
    // 捕まえる変異: 拡張子を見ずに全部 <img> にする
    const url = "https://example.com/page";
    const event = noteWith(url);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      expect(
        element().querySelector('[data-testid="content-image"]'),
      ).toBeNull();
      const link = element().querySelector("a");
      expect(link?.getAttribute("href")).toBe(url);
    } finally {
      dispose();
    }
  });

  it("リンクに target=_blank と rel=noopener noreferrer が付く", () => {
    // 捕まえる変異: rel を落とす (window.opener 経由で元タブを操作できる
    // 穴を塞ぐため target="_blank" と組で要る)。
    const url = "https://example.com/page";
    const event = noteWith(url);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      const link = element().querySelector("a");
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    } finally {
      dispose();
    }
  });

  it("画像の読み込みに失敗したら代替のリンク表示に落ちる (本文は消えない)", () => {
    // 捕まえる変異: onError ハンドラを付けない (壊れた画像アイコンが残る)
    const url = "https://example.com/cat.png";
    const event = noteWith(url);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      const img = element().querySelector('[data-testid="content-image"]');
      expect(img).not.toBeNull();
      img?.dispatchEvent(new Event("error"));
      expect(
        element().querySelector('[data-testid="content-image"]'),
      ).toBeNull();
      const link = element().querySelector("a");
      expect(link?.getAttribute("href")).toBe(url);
      expect(link?.textContent).toBe(url);
    } finally {
      dispose();
    }
  });
});

describe("NoteContent: emoji トークン", () => {
  it("emoji タグが登録されていれば <img> になる", () => {
    // 捕まえる変異: テキストのまま出す (:shortcode: が画像にならない)
    const event = noteWith(":smile:", [
      ["emoji", "smile", "https://example.com/smile.png"],
    ]);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      const img = element().querySelector('[data-testid="content-emoji"]');
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("https://example.com/smile.png");
      expect(element().textContent).not.toContain(":smile:");
    } finally {
      dispose();
    }
  });

  it("画像の読み込みに失敗したら :shortcode: のテキストへ戻る", () => {
    // 捕まえる変異: onError ハンドラを付けない (ショートコードが消える)
    const event = noteWith(":smile:", [
      ["emoji", "smile", "https://example.com/smile.png"],
    ]);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      const img = element().querySelector('[data-testid="content-emoji"]');
      expect(img).not.toBeNull();
      img?.dispatchEvent(new Event("error"));
      expect(
        element().querySelector('[data-testid="content-emoji"]'),
      ).toBeNull();
      expect(element().textContent).toContain(":smile:");
    } finally {
      dispose();
    }
  });
});

describe("NoteContent: hashtag トークン", () => {
  it("押せる見た目にならない (リンクにしない)", () => {
    // 捕まえる変異: リンクの見た目にする (検索カラムが無く押せないので、
    // 押せそうに見せると「壊れている」と区別が付かなくなる)。
    const event = noteWith("#nostr");
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      const el = element();
      expect(el.querySelector("a")).toBeNull();
      expect(el.querySelector("button")).toBeNull();
      expect(el.textContent).toBe("#nostr");
      expect(el.innerHTML).not.toContain("text-link");
    } finally {
      dispose();
    }
  });
});

describe("NoteContent: mention トークン", () => {
  it("npub/nprofile は <Profile> を通る (pubkey をそのまま出さない)", () => {
    // 捕まえる変異: pubkey をそのまま出す (Profile を経由せず生の hex を貼る)
    const mentioned =
      "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93";
    const npub = `nostr:${encodeBech32("npub", mentioned)}`;
    const event = noteWith(`before ${npub} after`);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      const el = element();
      const profile = el.querySelector('[data-testid="profile"]');
      expect(profile).not.toBeNull();
      expect(profile?.textContent).toBe(
        `@${encodeBech32("npub", mentioned).slice(0, 12)}`,
      );
      // 生の pubkey が本文のどこにも裸のテキストとして出ていないこと。
      expect(el.textContent).not.toContain(mentioned);
      expect(el.textContent).toContain("before");
      expect(el.textContent).toContain("after");
    } finally {
      dispose();
    }
  });

  it('eventRefs="text" で note が event-ref-text になり、title に元の nostr: 文字列が入る', () => {
    // 捕まえる変異: 短縮せず全部出す / title を付けない
    const quotedId = "2".repeat(64);
    const raw = `nostr:${encodeBech32("note", quotedId)}`;
    const event = noteWith(`before ${raw} after`);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      const el = element();
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
      const ref = el.querySelector('[data-testid="event-ref-text"]');
      expect(ref).not.toBeNull();
      expect(ref?.getAttribute("title")).toBe(raw);
      // "nostr:" を削っただけの長さでは短縮なしでも一致するので、期待
      // するラベルそのものと比較する。
      const entity = raw.replace(/^nostr:/, "");
      expect(ref?.textContent).toBe(`${entity.slice(0, 12)}…`);
      expect(el.textContent).not.toContain(raw);
      expect(el.textContent).toContain("before");
      expect(el.textContent).toContain("after");
    } finally {
      dispose();
    }
  });

  it('eventRefs="text" で naddr も event-ref-text になる', () => {
    // 捕まえる変異: naddr だけ「未対応の参照です」のままにする
    const naddr = encodeEntity("naddr", [
      { type: 0, value: asciiBytes("article-1") },
      { type: 2, value: hexToBytes(PUBKEY) },
      { type: 3, value: kindBytes(30023) },
    ]);
    const event = noteWith(`before nostr:${naddr} after`);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      const el = element();
      expect(el.querySelector('[data-testid="event-ref-text"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="unsupported-ref"]')).toBeNull();
      expect(el.textContent).toContain("before");
      expect(el.textContent).toContain("after");
    } finally {
      dispose();
    }
  });

  it('eventRefs="embed" で note が compact の event-view になる', () => {
    // 捕まえる変異: text のまま出す
    const quotedId = "2".repeat(64);
    const raw = `nostr:${encodeBech32("note", quotedId)}`;
    const event = noteWith(`before ${raw} after`);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "embed",
    });
    try {
      const el = element();
      const view = el.querySelector('[data-testid="event-view"]');
      expect(view).not.toBeNull();
      expect(view?.getAttribute("data-variant")).toBe("compact");
      expect(el.querySelector('[data-testid="event-ref-text"]')).toBeNull();
      expect(el.textContent).toContain("before");
      expect(el.textContent).toContain("after");
    } finally {
      dispose();
    }
  });

  it('eventRefs="embed" でも naddr は「未対応の参照です」', () => {
    // 捕まえる変異: naddr を埋め込もうとする
    const naddr = encodeEntity("naddr", [
      { type: 0, value: asciiBytes("article-1") },
      { type: 2, value: hexToBytes(PUBKEY) },
      { type: 3, value: kindBytes(30023) },
    ]);
    const event = noteWith(`before nostr:${naddr} after`);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "embed",
    });
    try {
      const el = element();
      const unsupported = el.querySelector('[data-testid="unsupported-ref"]');
      expect(unsupported).not.toBeNull();
      expect(unsupported?.textContent).toBe("未対応の参照です");
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
      expect(el.textContent).toContain("before");
      expect(el.textContent).toContain("after");
    } finally {
      dispose();
    }
  });

  it("本文に同じ id が 2 回現れても引用カードは 1 枚 (2 つ目はテキストになる)", () => {
    // 捕まえる変異: 重複排除を外す (同じ引用カードが 2 枚並ぶ)
    const quotedId = "2".repeat(64);
    const raw = `nostr:${encodeBech32("note", quotedId)}`;
    const event = noteWith(`A ${raw} B ${raw} C`);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "embed",
    });
    try {
      const el = element();
      expect(
        el.querySelectorAll(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).toHaveLength(1);
      expect(
        el.querySelectorAll('[data-testid="event-ref-text"]'),
      ).toHaveLength(1);
    } finally {
      dispose();
    }
  });

  it("本文に違う id が 2 つ現れると引用カードが 2 枚出る", () => {
    // 捕まえる変異: 最初の 1 件だけ埋め込んで残りを全部テキストにする
    const idA = "3".repeat(64);
    const idB = "4".repeat(64);
    const rawA = `nostr:${encodeBech32("note", idA)}`;
    const rawB = `nostr:${encodeBech32("note", idB)}`;
    const event = noteWith(`A ${rawA} B ${rawB} C`);
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "embed",
    });
    try {
      const el = element();
      expect(
        el.querySelectorAll(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).toHaveLength(2);
      expect(
        el.querySelectorAll('[data-testid="event-ref-text"]'),
      ).toHaveLength(0);
    } finally {
      dispose();
    }
  });
});

describe("NoteContent: 本文の器", () => {
  it("whitespace-pre-wrap が付く (改行を保つ)", () => {
    // 捕まえる変異: whitespace-pre-wrap を落とす (改行が畳まれて消える)
    const event = noteWith("line1\nline2");
    const { element, dispose } = mount({
      content: event.content,
      tags: event.tags,
      variant: "full",
      eventRefs: "text",
    });
    try {
      // querySelector は子孫しか探さないので自身のクラスは直接見る。
      expect(element().dataset.testid).toBe("note-content");
      expect(element().className).toContain("whitespace-pre-wrap");
    } finally {
      dispose();
    }
  });
});
