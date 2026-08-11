import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import { encodeBech32 } from "../../core/nostr/nip19";
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

// content.test.ts / nip19.test.ts と同じ理由: production の `encodeBech32`
// は hex しか受けないので、nprofile/nevent/naddr のテストデータを組むための
// 最小 TLV エンコーダをここでも持つ。
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

/**
 * `EventRequests`/`ProfileRequests` のテストダブル。`request` の呼び出し方
 * そのものはこのタスクの主張に含まれない (mention の解決経路が `Profile`/
 * `EventView` を通ることだけが要求) ので、記録はしない最小実装。
 */
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

const contextWith = (
  store: EventStore = new EventStore(),
): RenderContextValue => ({
  store,
  events: fakeEvents(),
  profiles: fakeProfiles(),
  renderers: [],
});

/**
 * `EventView.test.tsx`/`Note.test.tsx` と同じ手法: Solid コンポーネントを
 * JSX を介さず関数として直接呼び、返ってきた DOM ノードを検証する。
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
    const { element, dispose } = mount({
      event: noteWith(url),
      variant: "full",
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
    // 捕まえる変異: variant を見ずに常に展開する。引用先・返信先・
    // リポスト対象は compact で置かれるので、これが破れると原寸画像が
    // カラムを埋めて元の投稿が見えなくなる (design 4 節)。
    const url = "https://example.com/cat.png";
    const { element, dispose } = mount({
      event: noteWith(url),
      variant: "compact",
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
    const { element, dispose } = mount({
      event: noteWith(url),
      variant: "full",
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
    // 捕まえる変異: rel を落とす。target="_blank" と組でしか意味を持たない
    // (window.opener 経由でリンク先が元タブを操作できる穴を塞ぐ)。
    const url = "https://example.com/page";
    const { element, dispose } = mount({
      event: noteWith(url),
      variant: "full",
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
    // 捕まえる変異: onError ハンドラを付けない (壊れた画像アイコンが残り、
    // 元 URL へのリンクという代替表示に落ちない)
    const url = "https://example.com/cat.png";
    const { element, dispose } = mount({
      event: noteWith(url),
      variant: "full",
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
    const { element, dispose } = mount({
      event: noteWith(":smile:", [
        ["emoji", "smile", "https://example.com/smile.png"],
      ]),
      variant: "full",
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
    // 捕まえる変異: onError ハンドラを付けない (絵文字が 404 したまま壊れた
    // 画像アイコンになり、書いたショートコードが跡形もなく消える)
    const { element, dispose } = mount({
      event: noteWith(":smile:", [
        ["emoji", "smile", "https://example.com/smile.png"],
      ]),
      variant: "full",
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
    // 捕まえる変異: リンクの見た目 (<a>/<button> や text-link クラス) にする。
    // 検索カラムが無く押しても何も起きない (#203/#204) —— 押せそうに見せる
    // と「まだ無い」と「壊れている」の区別が付かなくなる。
    const { element, dispose } = mount({
      event: noteWith("#nostr"),
      variant: "full",
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
    const { element, dispose } = mount({
      event: noteWith(`before ${npub} after`),
      variant: "full",
    });
    try {
      const el = element();
      const profile = el.querySelector('[data-testid="profile"]');
      expect(profile).not.toBeNull();
      expect(profile?.textContent).toBe(
        `@${encodeBech32("npub", mentioned).slice(0, 12)}`,
      );
      // 生の pubkey (64 桁 hex) が本文のどこにも裸のテキストとして
      // 出ていないこと。
      expect(el.textContent).not.toContain(mentioned);
      expect(el.textContent).toContain("before");
      expect(el.textContent).toContain("after");
    } finally {
      dispose();
    }
  });

  it("note/nevent は compact の <EventView> になる (テキストのまま出さない)", () => {
    // 捕まえる変異: テキストのまま出す (raw をそのまま貼るだけで EventView
    // を描かない)
    const quotedId = "2".repeat(64);
    const note = `nostr:${encodeBech32("note", quotedId)}`;
    const { element, dispose } = mount({
      event: noteWith(`before ${note} after`),
      variant: "full",
    });
    try {
      const el = element();
      const view = el.querySelector(
        '[data-testid="event-view"][data-variant="compact"]',
      );
      expect(view).not.toBeNull();
      expect(el.textContent).not.toContain(note);
    } finally {
      dispose();
    }
  });

  it("naddr は「未対応の参照です」になる (落として本文を欠けさせない)", () => {
    // 捕まえる変異: naddr の分岐を落とす/何も描かない。前後のテキスト
    // トークンだけが残り、参照があったこと自体が本文から消える。
    const naddr = encodeEntity("naddr", [
      { type: 0, value: asciiBytes("article-1") },
      { type: 2, value: hexToBytes(PUBKEY) },
      { type: 3, value: kindBytes(30023) },
    ]);
    const { element, dispose } = mount({
      event: noteWith(`before nostr:${naddr} after`),
      variant: "full",
    });
    try {
      const el = element();
      const unsupported = el.querySelector('[data-testid="unsupported-ref"]');
      expect(unsupported).not.toBeNull();
      expect(unsupported?.textContent).toBe("未対応の参照です");
      expect(el.textContent).toContain("before");
      expect(el.textContent).toContain("after");
    } finally {
      dispose();
    }
  });
});

describe("NoteContent: 本文の器", () => {
  it("whitespace-pre-wrap が付く (改行を保つ)", () => {
    // 捕まえる変異: whitespace-pre-wrap を落とす (改行が畳まれて消える)
    const { element, dispose } = mount({
      event: noteWith("line1\nline2"),
      variant: "full",
    });
    try {
      // element() 自身が本文の器 (data-testid="note-content") —— querySelector
      // は子孫しか探さないので自身のクラスは直接見る。
      expect(element().dataset.testid).toBe("note-content");
      expect(element().className).toContain("whitespace-pre-wrap");
    } finally {
      dispose();
    }
  });
});
