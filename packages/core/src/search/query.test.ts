import { describe, expect, it } from "vite-plus/test";
import { encodeBech32 } from "../nostr/nip19";
import {
  emptySearchQuery,
  formatSearchQuery,
  hasSearchExclusions,
  isEmptySearchQuery,
  parseSearchQuery,
  passesSearchExclusions,
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

describe("除く指定", () => {
  it("- を付けた言葉・ハッシュタグ・人・bot を除く指定として読む", () => {
    expect(
      parseSearchQuery(
        `あいもの -いも -#Bot -hashtag:spam -from:${npub} -is:bot`,
      ),
    ).toEqual({
      ...emptySearchQuery(),
      words: ["あいもの"],
      excludeWords: ["いも"],
      excludeHashtags: ["bot", "spam"],
      excludeFrom: [pubkey],
      excludeBots: true,
    });
  });

  it("- だけや、読み取れない人の指定は除く指定にしない／言葉として除く", () => {
    const query = parseSearchQuery("- -- -from:こわれた");
    expect(query.words).toEqual(["-", "--"]);
    expect(query.excludeWords).toEqual(["from:こわれた"]);
    expect(query.excludeFrom).toEqual([]);
  });

  it("除く指定だけでは、何も探していない", () => {
    const query = parseSearchQuery("-いも -is:bot");
    expect(isEmptySearchQuery(query)).toBe(true);
    expect(hasSearchExclusions(query)).toBe(true);
    expect(hasSearchExclusions(parseSearchQuery("いも"))).toBe(false);
  });

  it("除く指定はリレーへ送らない", () => {
    expect(
      searchFilter(parseSearchQuery(`あいもの -いも -#bot -from:${pubkey}`)),
    ).toEqual({ kinds: [1], search: "あいもの" });
  });
});

describe("passesSearchExclusions", () => {
  const other = "b".repeat(64);
  const event = (content: string, tags: string[][] = [], author = other) => ({
    id: "0".repeat(64),
    pubkey: author,
    created_at: 0,
    kind: 1,
    tags,
    content,
    sig: "",
  });
  const human = () => false;

  it("除く言葉を本文に含むものを落とす。全角・大文字の違いはそろえる", () => {
    const query = parseSearchQuery("あいもの -芋 -abc");
    expect(passesSearchExclusions(query, event("あいもの"), human)).toBe(true);
    expect(passesSearchExclusions(query, event("あいものと芋"), human)).toBe(
      false,
    );
    expect(passesSearchExclusions(query, event("ＡＢＣ"), human)).toBe(false);
  });

  it("除く宛先を指す投稿を落とす", () => {
    const query = parseSearchQuery(`ねこ -to:${npub}`);
    expect(query.excludeTo).toEqual([pubkey]);
    expect(
      passesSearchExclusions(query, event("ねこ", [["p", pubkey]]), human),
    ).toBe(false);
    expect(passesSearchExclusions(query, event("ねこ"), human)).toBe(true);
  });

  it("除くハッシュタグと人を落とす", () => {
    const query = parseSearchQuery(`ねこ -#bot -from:${pubkey}`);
    expect(
      passesSearchExclusions(query, event("ねこ", [["t", "Bot"]]), human),
    ).toBe(false);
    expect(
      passesSearchExclusions(query, event("ねこ", [], pubkey), human),
    ).toBe(false);
    expect(passesSearchExclusions(query, event("ねこ"), human)).toBe(true);
  });

  it("bot と名乗る人と、まだ分からない人を落とす", () => {
    const query = parseSearchQuery("ねこ -is:bot");
    expect(passesSearchExclusions(query, event("ねこ"), () => true)).toBe(
      false,
    );
    expect(passesSearchExclusions(query, event("ねこ"), () => undefined)).toBe(
      false,
    );
    expect(passesSearchExclusions(query, event("ねこ"), human)).toBe(true);
    // bot を除かないなら、分からなくても残す。
    expect(
      passesSearchExclusions(
        parseSearchQuery("ねこ"),
        event("ねこ"),
        () => undefined,
      ),
    ).toBe(true);
  });
});

describe("文字列と条件を行き来できる", () => {
  const cases = [
    "ねこ",
    "ねこ 写真 #nostr",
    `ねこ from:${pubkey} since:2026-09-01 kind:1`,
    `to:${pubkey} until:2026-12-31`,
    `あいもの -いも #nostr -#bot -from:${pubkey} -to:${pubkey} -is:bot`,
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
