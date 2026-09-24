import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { EMOJI_SET_KIND } from "./emoji-list";
import {
  parseEmojiSet,
  setEmojiSetEmojis,
  setEmojiSetTitle,
} from "./emoji-set";

const PUBKEY = "a".repeat(64);

const event = (tags: string[][], kind = EMOJI_SET_KIND): NostrEvent => ({
  id: "1".repeat(64),
  pubkey: PUBKEY,
  created_at: 0,
  kind,
  tags,
  content: "",
  sig: "2".repeat(128),
});

describe("parseEmojiSet", () => {
  it("d・title・emoji を読む", () => {
    expect(
      parseEmojiSet(
        event([
          ["d", "neko"],
          ["title", "ねこスタンプ"],
          ["emoji", "neko1", "https://example/1.png"],
        ]),
      ),
    ).toEqual({
      identifier: "neko",
      pubkey: PUBKEY,
      title: "ねこスタンプ",
      emojis: [{ shortcode: "neko1", url: "https://example/1.png" }],
    });
  });

  it("title が無ければ d を名前に使う", () => {
    // 捕まえる変異: 空文字にする（名前の無い見出しが並ぶ）
    expect(parseEmojiSet(event([["d", "neko"]]))?.title).toBe("neko");
  });

  it("d が無ければ読まない", () => {
    // 捕まえる変異: 空の identifier を通す（10030 から指せないセットを画面に出す）
    expect(parseEmojiSet(event([["title", "名前だけ"]]))).toBeUndefined();
  });

  it("kind 違いは読まない", () => {
    expect(parseEmojiSet(event([["d", "neko"]], 30_003))).toBeUndefined();
  });
});

describe("書き換え", () => {
  it("中身を丸ごと差し替え、d と title は残す", () => {
    // 捕まえる変異: emoji 以外も作り直す（d が消えて別のセットになる）
    const next = setEmojiSetEmojis([{ shortcode: "a", url: "https://a" }])(
      event([
        ["d", "neko"],
        ["title", "ねこ"],
        ["emoji", "old", "https://old"],
      ]),
    );
    expect(next.tags).toEqual([
      ["emoji", "a", "https://a"],
      ["d", "neko"],
      ["title", "ねこ"],
    ]);
  });

  it("名前を変えても d は変わらない", () => {
    const next = setEmojiSetTitle("新しい名前")(
      event([
        ["d", "neko"],
        ["title", "ねこ"],
      ]),
    );
    expect(next.tags).toContainEqual(["d", "neko"]);
    expect(next.tags).toContainEqual(["title", "新しい名前"]);
  });
});
