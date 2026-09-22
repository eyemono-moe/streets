import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import {
  EMOJI_LIST_KIND,
  addEmoji,
  addEmojiSet,
  emojiSetAddress,
  parseEmojiList,
  parseEmojiSetAddress,
  removeEmoji,
  removeEmojiSet,
} from "./emoji-list";

const PUBKEY = "a".repeat(64);

const event = (tags: string[][]): NostrEvent => ({
  id: "1".repeat(64),
  pubkey: PUBKEY,
  created_at: 0,
  kind: EMOJI_LIST_KIND,
  tags,
  content: "",
  sig: "2".repeat(128),
});

describe("parseEmojiList", () => {
  it("emoji タグと a タグを分けて読む", () => {
    expect(
      parseEmojiList(
        event([
          ["emoji", "pika", "https://example/pika.png"],
          ["a", `30030:${PUBKEY}:neko`],
        ]),
      ),
    ).toEqual({
      emojis: [{ shortcode: "pika", url: "https://example/pika.png" }],
      sets: [{ pubkey: PUBKEY, identifier: "neko" }],
    });
  });

  it("名前か URL が欠けた emoji タグは読まない", () => {
    // 捕まえる変異: 欠けたまま通す（url が undefined の <img> が出る）
    expect(
      parseEmojiList(
        event([
          ["emoji", "pika"],
          ["emoji", "", "https://x"],
        ]),
      ).emojis,
    ).toEqual([]);
  });

  it("kind 違いの a タグは読まない", () => {
    // 捕まえる変異: kind を見ない（ブックマークなどの a タグを絵文字セット扱いする）
    expect(parseEmojiList(event([["a", `30003:${PUBKEY}:neko`]])).sets).toEqual(
      [],
    );
  });

  it("同じセットを 2 回書いてあっても 1 つにする", () => {
    const tags = [
      ["a", `30030:${PUBKEY}:neko`],
      ["a", `30030:${PUBKEY}:neko`],
    ];
    expect(parseEmojiList(event(tags)).sets).toHaveLength(1);
  });

  it("イベントが無ければ空", () => {
    expect(parseEmojiList(undefined)).toEqual({ emojis: [], sets: [] });
  });
});

describe("parseEmojiSetAddress", () => {
  it("identifier に : が入っていても切らない", () => {
    // 捕まえる変異: split の 3 つ目だけを使う（`a:b` という名前のセットを見失う）
    expect(parseEmojiSetAddress(`30030:${PUBKEY}:a:b`)).toEqual({
      pubkey: PUBKEY,
      identifier: "a:b",
    });
  });

  it("identifier が空なら読まない", () => {
    expect(parseEmojiSetAddress(`30030:${PUBKEY}:`)).toBeUndefined();
    expect(parseEmojiSetAddress(`30030:${PUBKEY}`)).toBeUndefined();
  });

  it("書いたものは読み戻せる", () => {
    const ref = { pubkey: PUBKEY, identifier: "neko" };
    expect(parseEmojiSetAddress(emojiSetAddress(ref))).toEqual(ref);
  });
});

describe("書き換え", () => {
  it("セットを足す・外す", () => {
    const ref = { pubkey: PUBKEY, identifier: "neko" };
    const added = addEmojiSet(ref)(undefined);
    expect(added.tags).toEqual([["a", `30030:${PUBKEY}:neko`]]);
    expect(removeEmojiSet(ref)(event(added.tags)).tags).toEqual([]);
  });

  it("同じショートコードを足すと URL を差し替える", () => {
    // 捕まえる変異: そのまま足す（同じ名前が 2 つ並び、どちらが送られるか読めない）
    const first = addEmoji({ shortcode: "pika", url: "https://old" })(
      undefined,
    );
    const second = addEmoji({ shortcode: "pika", url: "https://new" })(
      event(first.tags),
    );
    expect(second.tags).toEqual([["emoji", "pika", "https://new"]]);
  });

  it("知らないタグは残す", () => {
    // 捕まえる変異: タグを作り直す（他クライアントが書いた設定が消える）
    const next = addEmoji({ shortcode: "pika", url: "https://x" })(
      event([["unknown", "value"]]),
    );
    expect(next.tags).toContainEqual(["unknown", "value"]);
  });

  it("絵文字を名前で外す", () => {
    const next = removeEmoji("pika")(
      event([
        ["emoji", "pika", "https://x"],
        ["emoji", "dora", "https://y"],
      ]),
    );
    expect(next.tags).toEqual([["emoji", "dora", "https://y"]]);
  });
});
