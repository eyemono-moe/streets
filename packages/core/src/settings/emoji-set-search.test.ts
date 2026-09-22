import { describe, expect, it } from "vitest";
import { encodeBech32, encodeNaddr } from "../nostr/nip19";
import { emojiSetFilters, parseEmojiSetQuery } from "./emoji-set-search";

const PUBKEY = "a".repeat(64);
const NPUB = encodeBech32("npub", PUBKEY);
const NADDR = encodeNaddr({
  identifier: "neko",
  pubkey: PUBKEY,
  eventKind: 30_030,
}) as string;

describe("parseEmojiSetQuery", () => {
  it("空なら新着を見せる", () => {
    // 捕まえる変異: undefined を返す（押しても何も起きないボタンになる。
    // 言葉での検索に答えるリレーは少なく、新着一覧が主な探し方になる）
    expect(parseEmojiSetQuery("   ")).toEqual({ kind: "recent" });
  });

  it("naddr はその 1 つを指す", () => {
    expect(parseEmojiSetQuery(NADDR)).toEqual({
      kind: "address",
      ref: { pubkey: PUBKEY, identifier: "neko" },
    });
  });

  it("`nostr:` が付いていても読む", () => {
    // 捕まえる変異: そのまま復号する（貼り付けでよく付いてくる形で読めなくなる）
    expect(parseEmojiSetQuery(`nostr:${NADDR}`)).toMatchObject({
      kind: "address",
    });
  });

  it("絵文字セット以外の naddr は受け取らない", () => {
    // 捕まえる変異: kind を見ない（記事などを絵文字セットとして足してしまう）
    const article = encodeNaddr({
      identifier: "post",
      pubkey: PUBKEY,
      eventKind: 30_023,
    }) as string;
    expect(parseEmojiSetQuery(article)).toBeUndefined();
  });

  it("npub と hex はその人の作ったものを指す", () => {
    expect(parseEmojiSetQuery(NPUB)).toEqual({
      kind: "author",
      pubkey: PUBKEY,
    });
    expect(parseEmojiSetQuery(PUBKEY)).toEqual({
      kind: "author",
      pubkey: PUBKEY,
    });
  });

  it("それ以外は言葉として扱う", () => {
    expect(parseEmojiSetQuery(" ねこ ")).toEqual({
      kind: "words",
      words: "ねこ",
    });
  });
});

describe("emojiSetFilters", () => {
  it("新着は種別だけで取る（検索に対応したリレーが要らない）", () => {
    const filters = emojiSetFilters({ kind: "recent" });
    expect(filters).toEqual([{ kinds: [30_030], limit: 30 }]);
  });

  it("住所は作者と d を指定して 1 つだけ取る", () => {
    expect(
      emojiSetFilters({
        kind: "address",
        ref: { pubkey: PUBKEY, identifier: "neko" },
      }),
    ).toEqual([{ kinds: [30_030], authors: [PUBKEY], "#d": ["neko"] }]);
  });

  it("人は作者で絞る（検索に対応したリレーが要らない）", () => {
    // 捕まえる変異: search を付ける（NIP-50 に答えないリレーが何も返さなくなる）
    const filters = emojiSetFilters({ kind: "author", pubkey: PUBKEY });
    expect(filters[0]).toMatchObject({ authors: [PUBKEY] });
    expect(filters[0]).not.toHaveProperty("search");
  });

  it("言葉は search で送る", () => {
    expect(emojiSetFilters({ kind: "words", words: "ねこ" })).toEqual([
      { kinds: [30_030], search: "ねこ", limit: 30 },
    ]);
  });
});
