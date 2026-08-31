import { describe, expect, it } from "vitest";
import { FALLBACK_RELAYS } from "../../core/read/default-relays";
import { buildColumn } from "./column-presets";

const HEX = "a".repeat(64);
// HEX の npub 表現。実際に走らせた値 (手計算では出せない)。
const NPUB = "npub1424242424242424242424242424242424242424242424242424qamrcaj";

describe("buildColumn", () => {
  it("home は派生ソースを作る", () => {
    // 捕まえる変異: home もフィルタを焼き込む
    expect(buildColumn("home", "")?.source).toEqual({
      kind: "followees",
      kinds: [1, 6],
    });
  });

  it("home はリポストも集める", () => {
    // 捕まえる変異: kinds を [1] に戻す (6 を落とすとリポストが消える)。
    // toEqual の完全一致では「6 が何のためか」が読めないので単独で書く。
    const home = buildColumn("home", "")?.source;
    expect(home?.kind === "followees" && home.kinds).toContain(6);
  });

  it("hashtag と global はリポストを集めない", () => {
    // 捕まえる変異: TIMELINE_KINDS を全種別へ広げる (リポストは t タグを
    // 引き継がずハッシュタグ列では増えない)。
    const hashtag = buildColumn("hashtag", "#nostr")?.source;
    expect(hashtag?.kind === "literal" && hashtag.filters[0]?.kinds).toEqual([
      1,
    ]);

    const global = buildColumn("global", "")?.source;
    expect(global?.kind === "literal" && global.filters[0]?.kinds).toEqual([1]);
  });

  it("user はユーザー詳細の意図と hex 公開鍵を保存する", () => {
    expect(buildColumn("user", HEX)?.source).toEqual({
      kind: "user",
      pubkey: HEX,
    });

    // 捕まえる変異: 入力をデコードせずそのまま使う (HEX 入力では区別が
    // 付かないので npub 入力で確かめる)。
    expect(buildColumn("user", NPUB)?.source).toEqual({
      kind: "user",
      pubkey: HEX,
    });
  });

  it("user は不正な入力で undefined", () => {
    // 捕まえる変異: undefined を無視して空文字を入れる (誰にもマッチ
    // しないカラムを黙って作る)
    expect(buildColumn("user", "nope")).toBeUndefined();
  });

  it("hashtag は #t フィルタを作り、先頭の # を落とす", () => {
    // 捕まえる変異: 入力をそのまま入れる (NIP-12 のタグ値に # は含まれず
    // リレー側で一致しない)
    expect(buildColumn("hashtag", "#nostr")?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1], "#t": ["nostr"] }],
    });
    expect(buildColumn("hashtag", "nostr")?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1], "#t": ["nostr"] }],
    });
  });

  it("hashtag は先頭の # を複数個すべて落とす (最終レビュー Minor 3)", () => {
    // 捕まえる変異: 1 個しか落とさない (`##nostr` が `"#nostr"` になり、
    // # を含む本物のイベントは無いので永久に一致しない)
    expect(buildColumn("hashtag", "##nostr")?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1], "#t": ["nostr"] }],
    });
  });

  it("hashtag は大文字を小文字化する (最終レビュー Minor 3)", () => {
    // 捕まえる変異: 大文字小文字をそのまま保存する (NIP-24 は小文字化を
    // SHOULD しており、主要クライアントは小文字で publish するため)
    expect(buildColumn("hashtag", "#Nostr")?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1], "#t": ["nostr"] }],
    });
    expect(buildColumn("hashtag", "NOSTR")?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1], "#t": ["nostr"] }],
    });
  });

  it("hashtag は空文字で undefined", () => {
    // 捕まえる変異: 空を通す (`#t: [""]` のカラムができる)
    expect(buildColumn("hashtag", "  ")).toBeUndefined();
    expect(buildColumn("hashtag", "#")).toBeUndefined();
  });

  it("global は明示リレーを持つ", () => {
    // 捕まえる変異: relays を落とす (Outbox 経路になり明示リレーが消える)
    expect(buildColumn("global", "")?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1] }],
      relays: [...FALLBACK_RELAYS],
    });
  });

  it("notifications は意図だけを保存する", () => {
    // 捕まえる変異: フィルタや pubkey を焼き込む (リレーを移したユーザー
    // の通知列が古い場所を見続ける)。
    expect(buildColumn("notifications", "")?.source).toEqual({
      kind: "notifications",
    });
  });

  it("notifications は入力を見ずに成功する", () => {
    // 捕まえる変異: 入力を必須にする (NEEDS_INPUT が false だと入力欄が
    // 無く、押しても何も起きないボタンになる)。
    expect(buildColumn("notifications", "")).toBeDefined();
    expect(buildColumn("notifications", "  ")).toBeDefined();
  });

  it("id は呼び出しごとに違う", () => {
    // 捕まえる変異: id を種別から作る (同種別を 2 本足すと id が衝突し、
    // <For> のキーが壊れる)
    expect(buildColumn("home", "")?.id).not.toBe(buildColumn("home", "")?.id);
  });

  // タイトルの既定値。npub の bech32 表現は手計算できないので実測値を使う。
  describe("title の既定値", () => {
    it("home は「ホーム」", () => {
      // 捕まえる変異: タイトルを別の種別と取り違える
      expect(buildColumn("home", "")?.title).toBe("ホーム");
    });

    it("user は npub の先頭 12 文字を使う (hex ではない)", () => {
      // 捕まえる変異: hex の先頭を使う (`@aaaaaaaa` で見分けられなくなる)
      expect(buildColumn("user", HEX)?.title).toBe("@npub14242424");
    });

    it("hashtag は `#<tag>`", () => {
      // 捕まえる変異: # を落とさずに二重にする、またはタグ以外を使う
      expect(buildColumn("hashtag", "#nostr")?.title).toBe("#nostr");
    });

    it("global は「グローバル」", () => {
      // 捕まえる変異: タイトルを別の種別と取り違える
      expect(buildColumn("global", "")?.title).toBe("グローバル");
    });
  });
});
