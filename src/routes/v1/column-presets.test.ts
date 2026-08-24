import { describe, expect, it } from "vitest";
import { FALLBACK_RELAYS } from "../../core/read/default-relays";
import { buildColumn } from "./column-presets";

const HEX = "a".repeat(64);
// HEX の npub 表現。`encodeBech32("npub", HEX)` を実際に走らせた値
// (手計算では出せない —— column-presets.ts のコメント参照)。
const NPUB = "npub1424242424242424242424242424242424242424242424242424qamrcaj";

describe("buildColumn", () => {
  it("home は派生ソースを作る", () => {
    // 捕まえる変異: home もフィルタを焼き込む (Task 1 が消した欠陥の再導入)
    expect(buildColumn("home", "")?.source).toEqual({
      kind: "followees",
      kinds: [1, 6],
    });
  });

  it("home と user はリポストも集める", () => {
    // 捕まえる変異: kinds を [1] に戻す。v0 の Followings.tsx / User.tsx は
    // どちらも [ShortTextNote, Repost] を購読しており、6 を落とすと
    // フォロー相手がリポストした投稿が列から丸ごと消える。
    //
    // toEqual の完全一致だけだと「6 が入っている」ことは主張できても
    // 「何のために入っているか」が読めないので、kind:6 の含有を単独で書く。
    const home = buildColumn("home", "")?.source;
    expect(home?.kind === "followees" && home.kinds).toContain(6);

    const user = buildColumn("user", HEX)?.source;
    expect(user?.kind === "literal" && user.filters[0]?.kinds).toContain(6);
  });

  it("hashtag と global はリポストを集めない", () => {
    // 捕まえる変異: TIMELINE_KINDS を 4 種別すべてへ広げる。リポストは
    // 元イベントの t タグを引き継がないのでハッシュタグ列では何も増えず、
    // グローバル列は元から流量が多い (column-presets.ts のコメント)。
    const hashtag = buildColumn("hashtag", "#nostr")?.source;
    expect(hashtag?.kind === "literal" && hashtag.filters[0]?.kinds).toEqual([
      1,
    ]);

    const global = buildColumn("global", "")?.source;
    expect(global?.kind === "literal" && global.filters[0]?.kinds).toEqual([1]);
  });

  it("user は hex 著者フィルタを作る", () => {
    expect(buildColumn("user", HEX)?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1, 6], authors: [HEX] }],
    });

    // 捕まえる変異: 入力をデコードせずそのまま authors へ入れる。
    // **HEX 入力だけでは捕まらない**（decodeNpub は既に hex の入力を
    // そのまま返すので「デコードした」場合と「デコードせず生入力を使う」
    // 場合が偶然同じ値になり、区別が付かない）。npub 入力で hex に
    // 変換されていることまで確かめて初めて、この変異を殺せる。
    expect(buildColumn("user", NPUB)?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1, 6], authors: [HEX] }],
    });
  });

  it("user は不正な入力で undefined", () => {
    // 捕まえる変異: decodeNpub の undefined を無視して空文字を入れる
    // (`authors: [""]` は誰にもマッチしないカラムを黙って作る)
    expect(buildColumn("user", "nope")).toBeUndefined();
  });

  it("hashtag は #t フィルタを作り、先頭の # を落とす", () => {
    // 捕まえる変異: 入力をそのまま入れる (`#t: ["#nostr"]` はリレー側で
    // 一致しない —— NIP-12 のタグ値に # は含まれない)
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
    // 捕まえる変異: `/^#/` のように 1 個しか落とさない —— `##nostr` が
    // タグ値 `"#nostr"` になり、NIP-12 のタグ値に # を含む本物のイベントは
    // 無いので永久に一致しない
    expect(buildColumn("hashtag", "##nostr")?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1], "#t": ["nostr"] }],
    });
  });

  it("hashtag は大文字を小文字化する (最終レビュー Minor 3)", () => {
    // 捕まえる変異: 大文字小文字をそのまま保存する —— NIP-24 は t タグの値を
    // 小文字にする SHOULD を定めており、主要クライアントは小文字で publish
    // するため、大文字混じりのタグ値は実在するイベントと一致せず永久に
    // 何も来ない
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
    // 捕まえる変異: relays を落とす (Outbox 経路になり、global カラムが
    // 通すはずの「明示リレー」という経路が一本も無くなる)
    expect(buildColumn("global", "")?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1] }],
      relays: [...FALLBACK_RELAYS],
    });
  });

  it("notifications は意図だけを保存する", () => {
    // 捕まえる変異: フィルタや pubkey を焼き込む。read リレーを焼き込むと
    // リレーを移したユーザーの通知列は作り直すまで古い場所を見続ける ——
    // 2026-08-06 に「フォローしてもホーム列が反映されない」として実際に
    // 起きた壊れ方と同型 (resolve-source.ts のコメント参照)。
    expect(buildColumn("notifications", "")?.source).toEqual({
      kind: "notifications",
    });
  });

  it("notifications は入力を見ずに成功する", () => {
    // 捕まえる変異: 入力を必須にする。AddColumnForm は NEEDS_INPUT が
    // false の種別に入力欄を出さないので、必須にすると「押しても何も
    // 起きないボタン」になる。
    expect(buildColumn("notifications", "")).toBeDefined();
    expect(buildColumn("notifications", "  ")).toBeDefined();
  });

  it("id は呼び出しごとに違う", () => {
    // 捕まえる変異: id を種別から作る (同じ種別のカラムを 2 本足すと
    // id が衝突し、Solid の <For> のキーと削除の対象指定が壊れる)
    expect(buildColumn("home", "")?.id).not.toBe(buildColumn("home", "")?.id);
  });

  // タイトルの既定値。実際に走らせた値を使う (npub の bech32 表現は手計算
  // できない) —— `encodeBech32("npub", "a".repeat(64))` は
  // "npub1424242424242424242424242424242424242424242424242424qamrcaj"
  // になり、その先頭 12 文字は "npub14242424"。
  describe("title の既定値", () => {
    it("home は「ホーム」", () => {
      // 捕まえる変異: タイトルを別の種別と取り違える
      expect(buildColumn("home", "")?.title).toBe("ホーム");
    });

    it("user は npub の先頭 12 文字を使う (hex ではない)", () => {
      // 捕まえる変異: hex の先頭を使う (`@aaaaaaaa` になり、複数の user
      // カラムを見分けられなくなる)
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
