import { describe, expect, it } from "vite-plus/test";
import { encodeBech32 } from "../nostr/nip19";
import {
  emptySearchQuery,
  formatSearchQuery,
  isEmptySearchQuery,
  parseSearchQuery,
  searchFilter,
} from "./query";

const pubkey = "a".repeat(64);
const npub = encodeBech32("npub", pubkey);

describe("parseSearchQuery", () => {
  it("ふつうの言葉は、そのまま本文の検索になる", () => {
    expect(parseSearchQuery("ねこ 写真")).toEqual({
      ...emptySearchQuery(),
      words: ["ねこ", "写真"],
    });
  });

  it("書いた人を npub でも 16 進でも受ける", () => {
    expect(parseSearchQuery(`from:${npub}`).from).toBe(pubkey);
    expect(parseSearchQuery(`by:${pubkey.toUpperCase()}`).from).toBe(pubkey);
  });

  it("日付は、その日の始まりとして読む", () => {
    const query = parseSearchQuery("since:2026-09-01");
    expect(query.since).toBe(
      Math.floor(new Date("2026-09-01T00:00:00").getTime() / 1000),
    );
  });

  it("ハッシュタグは小文字にそろえる", () => {
    expect(parseSearchQuery("#Nostr hashtag:Streets").hashtags).toEqual([
      "nostr",
      "streets",
    ]);
  });

  it("kind を指定できる。いくつでも足せる", () => {
    expect(parseSearchQuery("kind:1 kind:30023").kinds).toEqual([1, 30023]);
  });

  it("読み取れない指定は、ふつうの言葉として残す", () => {
    // 打っている途中に消えてしまわないようにする。
    const query = parseSearchQuery("from:こわれた since:きのう kind:あ");
    expect(query.from).toBeUndefined();
    expect(query.since).toBeUndefined();
    expect(query.kinds).toEqual([]);
    expect(query.words).toEqual(["from:こわれた", "since:きのう", "kind:あ"]);
  });

  it("空の文字列は、何も指定していない条件になる", () => {
    expect(parseSearchQuery("   ")).toEqual(emptySearchQuery());
    expect(isEmptySearchQuery(parseSearchQuery(""))).toBe(true);
  });
});

describe("文字列と条件を行き来できる", () => {
  const cases = [
    "ねこ",
    "ねこ 写真 #nostr",
    `ねこ from:${pubkey} since:2026-09-01 kind:1`,
    `to:${pubkey} until:2026-12-31`,
  ];
  for (const text of cases) {
    it(`往復しても変わらない: ${text}`, () => {
      const query = parseSearchQuery(text);
      expect(parseSearchQuery(formatSearchQuery(query))).toEqual(query);
    });
  }

  it("npub で書いても、書き戻すと 16 進になる（指すものは同じ）", () => {
    const query = parseSearchQuery(`from:${npub}`);
    expect(formatSearchQuery(query)).toBe(`from:${pubkey}`);
  });
});

describe("searchFilter", () => {
  it("言葉は NIP-50 の search に入れる。kind の指定が無ければテキストノート", () => {
    expect(searchFilter(parseSearchQuery("ねこ 写真"))).toEqual({
      kinds: [1],
      search: "ねこ 写真",
    });
  });

  it("人・宛先・日付・ハッシュタグは、ふつうの絞り込みに入れる", () => {
    expect(
      searchFilter(
        parseSearchQuery(`ねこ from:${pubkey} to:${pubkey} #nostr kind:1`),
      ),
    ).toEqual({
      kinds: [1],
      search: "ねこ",
      "#t": ["nostr"],
      authors: [pubkey],
      "#p": [pubkey],
    });
  });

  it("言葉が無ければ search を付けない（絞り込みだけで探せる）", () => {
    expect(searchFilter(parseSearchQuery("#nostr"))).toEqual({
      kinds: [1],
      "#t": ["nostr"],
    });
  });

  it("日本語のハッシュタグを #t で探せる", () => {
    expect(searchFilter(parseSearchQuery("#東京Nostr散歩2026"))).toEqual({
      kinds: [1],
      "#t": ["東京nostr散歩2026"],
    });
  });
});
