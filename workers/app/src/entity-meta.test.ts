import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import { describe, expect, it } from "vite-plus/test";
import {
  canonicalEntityPath,
  entityMeta,
  entityOfPath,
  wantsCard,
  withMeta,
} from "./entity-meta";

const PUBKEY = "a".repeat(64);
const URL_ = "https://streets.example/note1x";

const event = (
  kind: number,
  content: string,
  tags: string[][] = [],
): NostrEvent => ({
  id: "e".repeat(64),
  pubkey: PUBKEY,
  created_at: 1,
  kind,
  tags,
  content,
  sig: "",
});

const profile = (fields: Record<string, string>) =>
  event(0, JSON.stringify(fields));

describe("entityOfPath", () => {
  it("1 語の bech32 だけを読む", () => {
    const npub = encodeBech32("npub", PUBKEY);
    expect(entityOfPath(`/${npub}`)).toEqual({ kind: "npub", pubkey: PUBKEY });
    expect(entityOfPath(`/${npub}/extra`)).toBeUndefined();
    expect(entityOfPath("/npub1broken")).toBeUndefined();
    expect(entityOfPath("/")).toBeUndefined();
  });
});

describe("canonicalEntityPath", () => {
  it("nostr: 付きのパスを、外したパスに直す", () => {
    const npub = encodeBech32("npub", PUBKEY);
    expect(canonicalEntityPath(`/nostr:${npub}`)).toBe(`/${npub}`);
    expect(canonicalEntityPath(`/nostr%3A${npub}`)).toBe(`/${npub}`);
  });

  it("直す必要が無いものと、外しても読めないものは直さない", () => {
    const npub = encodeBech32("npub", PUBKEY);
    expect(canonicalEntityPath(`/${npub}`)).toBeUndefined();
    expect(canonicalEntityPath("/nostr:npub1broken")).toBeUndefined();
    expect(canonicalEntityPath(`/nostr:${npub}/extra`)).toBeUndefined();
  });
});

describe("wantsCard", () => {
  const CHROME =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
  const NAVIGATE = {
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  };

  it("ブラウザでページを開いた人には、リレーを待たせない", () => {
    expect(wantsCard(new Headers({ ...NAVIGATE, "user-agent": CHROME }))).toBe(
      false,
    );
  });

  it("ページを開くのでない取得には、名乗りによらずカードを入れる", () => {
    for (const agent of [
      "Twitterbot/1.0",
      "Mozilla/5.0 (compatible; Discordbot/2.0)",
      // 確認ツールや Nostr クライアントの取得口は、ブラウザを名乗ることが多い。
      CHROME,
      "node",
    ]) {
      expect(wantsCard(new Headers({ "user-agent": agent })), agent).toBe(true);
    }
    expect(wantsCard(new Headers())).toBe(true);
  });

  it("ブラウザを動かして読むボットにもカードを入れる", () => {
    for (const agent of [
      "Mozilla/5.0 (compatible; Googlebot/2.1)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36",
    ]) {
      expect(
        wantsCard(new Headers({ ...NAVIGATE, "user-agent": agent })),
        agent,
      ).toBe(true);
    }
  });
});

describe("entityMeta", () => {
  it("投稿は、書き手の名前と本文と最初の画像でカードにする", () => {
    const meta = entityMeta(
      { kind: "note", id: "e".repeat(64) },
      {
        event: event(
          1,
          "お昼 https://img.example/a.jpg nostr:npub1abcdefghij を見て",
        ),
        profile: profile({
          display_name: "ありす",
          picture: "https://img.example/me.png",
        }),
      },
      URL_,
    );
    expect(meta).toEqual({
      title: "ありすさんの投稿 | Streets",
      description: "お昼 … を見て",
      image: "https://img.example/a.jpg",
      type: "article",
      largeImage: true,
      url: URL_,
    });
  });

  it("画像の無い投稿は、書き手のアイコンを小さいカードで出す", () => {
    const meta = entityMeta(
      { kind: "note", id: "e".repeat(64) },
      {
        event: event(1, "本文だけ"),
        profile: profile({
          name: "alice",
          picture: "https://img.example/me.png",
        }),
      },
      URL_,
    );
    expect(meta?.image).toBe("https://img.example/me.png");
    expect(meta?.largeImage).toBe(false);
  });

  it("閲覧注意の投稿は、本文も画像も出さない", () => {
    const meta = entityMeta(
      { kind: "note", id: "e".repeat(64) },
      {
        event: event(1, "見せない本文 https://img.example/a.jpg", [
          ["content-warning", "nsfw"],
        ]),
      },
      URL_,
    );
    expect(meta?.description).toBe("閲覧注意の投稿です。");
    expect(meta?.image).toBeUndefined();
  });

  it("記事は題名・要約・見出しの画像を使う", () => {
    const meta = entityMeta(
      {
        kind: "naddr",
        identifier: "a",
        pubkey: PUBKEY,
        eventKind: 30_023,
        relays: [],
      },
      {
        event: event(30_023, "# 本文", [
          ["d", "a"],
          ["title", "記事の題名"],
          ["summary", "要約"],
          ["image", "https://img.example/cover.png"],
        ]),
      },
      URL_,
    );
    expect(meta).toMatchObject({
      title: "記事の題名 | Streets",
      description: "要約",
      image: "https://img.example/cover.png",
      largeImage: true,
    });
  });

  it("人はプロフィールの名前と自己紹介を使う", () => {
    const meta = entityMeta(
      { kind: "npub", pubkey: PUBKEY },
      { profile: profile({ name: "alice", about: "自己紹介" }) },
      URL_,
    );
    expect(meta).toMatchObject({
      title: "alice | Streets",
      description: "自己紹介",
      type: "profile",
      largeImage: false,
    });
  });

  it("見つからなければ作らない", () => {
    expect(
      entityMeta({ kind: "note", id: "e".repeat(64) }, {}, URL_),
    ).toBeUndefined();
    expect(
      entityMeta({ kind: "npub", pubkey: PUBKEY }, {}, URL_),
    ).toBeUndefined();
  });

  it("http の画像はカードに使わない", () => {
    const meta = entityMeta(
      { kind: "npub", pubkey: PUBKEY },
      {
        profile: profile({
          name: "alice",
          picture: "http://img.example/me.png",
        }),
      },
      URL_,
    );
    expect(meta?.image).toBeUndefined();
  });
});

describe("withMeta", () => {
  const html = `<!doctype html>
<html lang="ja">
  <head>
    <title>Streets — 既定</title>
    <link rel="canonical" href="https://streets.example/" />
    <meta
      name="description"
      content="既定の説明"
    />
    <meta property="og:title" content="既定" />
    <meta property="og:image" content="https://streets.example/ogp.webp" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="viewport" content="width=device-width" />
  </head>
  <body><div id="root"></div></body>
</html>`;

  it("カードの行だけを差し替え、ほかは残す", () => {
    const out = withMeta(html, {
      title: "ありすさんの投稿 | Streets",
      description: "本文",
      type: "article",
      largeImage: false,
      url: "https://streets.example/note1x",
    });
    expect(out).toContain("<title>ありすさんの投稿 | Streets</title>");
    expect(out).toContain('<meta property="og:description" content="本文" />');
    expect(out).toContain('<meta name="twitter:card" content="summary" />');
    expect(out).toContain(
      '<meta name="viewport" content="width=device-width" />',
    );
    expect(out).toContain('<div id="root"></div>');
    expect(out).not.toContain("既定");
    // 画像が無いときに、アプリの既定の画像を残さない（投稿と関係のない絵が出る）
    expect(out).not.toContain("ogp.webp");
  });

  it("本文の記号で HTML を壊さない", () => {
    const out = withMeta(html, {
      title: '"><script>alert(1)</script>',
      description: "a & b < c",
      type: "article",
      largeImage: false,
      url: "https://streets.example/note1x",
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("a &amp; b &lt; c");
  });
});
