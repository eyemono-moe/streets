import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import type { ContentToken } from "./content";
import { isProbablyImageUrl, parseContent } from "./content";
import type { NostrEvent } from "./event";
import { encodeBech32 } from "./nip19";

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

/** `text` の `text`、`url` の `url`、`mention`/`hashtag` の `raw`、`emoji` の
 * `:${shortcode}:` を順に繋げば、パース前の content に戻るはずという不変
 * 条件をテストで固定するためのヘルパー。 */
const concatTokens = (tokens: ContentToken[]): string =>
  tokens
    .map((t) => {
      switch (t.type) {
        case "text":
          return t.text;
        case "url":
          return t.url;
        case "mention":
          return t.raw;
        case "hashtag":
          return t.raw;
        case "emoji":
          return `:${t.shortcode}:`;
      }
    })
    .join("");

// content.ts の production 側は hex しか受けないので、nprofile/nevent/naddr
// のテストデータを組むための最小 TLV エンコーダをここでも持つ
// (nip19.test.ts と同じ理由 —— production の encodeBech32 は hex しか受けない)。
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

const kindBytes = (kind: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, kind, false);
  return bytes;
};

const encodeEntity = (prefix: string, entries: TlvEntry[]): string =>
  encodeBech32(prefix, bytesToHex(encodeTlv(entries)));

describe("parseContent: 不変条件", () => {
  it("空白で区切られていない日本語が URL に飲み込まれない", () => {
    // 捕まえる変異: URL の文字集合を \S+ に戻す。RFC 3986 が URI に許す
    // 文字はすべて ASCII なので、非 ASCII で止めなければ区切りの空白が
    // 無い日本語の本文で URL が後続の文章を丸ごと取る
    const tokens = parseContent(
      noteWith("詳細は https://example.com/doc。ご確認ください"),
    );
    const url = tokens.find((t) => t.type === "url");
    expect(url).toEqual({ type: "url", url: "https://example.com/doc" });
    expect(tokens.map((t) => (t.type === "text" ? t.text : "")).join("")).toBe(
      "詳細は 。ご確認ください",
    );
  });

  it("トークンを連結すると元の content に戻る", () => {
    // 捕まえる変異: どのトークンでも、元の文字列の一部を落とす/重複させる。
    // トークン化は本文を「分ける」だけで「変える」処理ではない —— 落ちても
    // 画面には出ないので、この不変条件でしか機械的に検出できない。
    const npub = `nostr:${encodeBech32("npub", PUBKEY)}`;
    const emojiTag = ["emoji", "foo", "https://cdn.example/foo.png"];
    const samples = [
      "", // 空文字
      "#先頭 の後にテキスト", // 先頭がトークン
      "テキストの後に https://example.com/end", // 末尾がトークン
      "#foo#bar", // トークンが連続する（ハッシュタグ同士、区切りなし）
      `${npub}#tag`, // トークンが連続する（種類の異なるトークン、区切りなし）
      "一行目\n二行目 #tag\n三行目", // 改行を含む
      "全角記号、テスト。文章です（丸括弧）", // 全角記号を含む
      "見て https://example.com/foo。 すごい", // URL の直後に句読点
      "気分は :foo: です", // 絵文字トークンも含めておく
    ];
    for (const content of samples) {
      const event = noteWith(content, [emojiTag]);
      expect(concatTokens(parseContent(event))).toBe(content);
    }
  });

  it("content が空なら空配列を返す", () => {
    // 捕まえる変異: 空文字を長さ 0 の text トークン 1 件として返す
    // (concatTokens では区別できないが、レンダラ側が空配列を前提にしている
    // かもしれないので、型どおり [] を直接確認しておく)
    expect(parseContent(noteWith(""))).toEqual([]);
  });
});

describe("parseContent: URL", () => {
  it("# を含む URL がハッシュタグに割れない", () => {
    // 捕まえる変異: URL がフラグメントの # を取り込まない
    // (ハッシュタグがそれを横取りする形と等価)
    const content = "見て https://example.com/path#section です";
    expect(parseContent(noteWith(content))).toEqual([
      { type: "text", text: "見て " },
      { type: "url", url: "https://example.com/path#section" },
      { type: "text", text: " です" },
    ] satisfies ContentToken[]);
  });

  it(": を含む URL（ポート番号相当）が絵文字に割れない", () => {
    // 捕まえる変異: URL の文字集合が埋め込みの ':' を手放す
    // (URL の 4 マッチャは開始文字が h/n/:/# で互いに排他なので、?? の並び順
    // 自体を入れ替えても各マッチャの開始位置では衝突しない —— 実際に確認
    // した。真に効くのは URL 自身の切り出しが ':' の手前で止まる変異で、
    // これだと URL が "http://example.com/room" で終わり、残りの
    // ":8080:live" が絵文字マッチャに渡って emoji タグのショートコード
    // "8080" を拾ってしまう)
    const event = noteWith("詳細 http://example.com/room:8080:live へ", [
      ["emoji", "8080", "https://cdn.example/8080.png"],
    ]);
    expect(parseContent(event)).toEqual([
      { type: "text", text: "詳細 " },
      { type: "url", url: "http://example.com/room:8080:live" },
      { type: "text", text: " へ" },
    ] satisfies ContentToken[]);
  });

  it("末尾の句読点（。）を URL に含めない", () => {
    // 捕まえる変異: 貪欲に取る（末尾の約物を剥がさない）
    const content = "資料は https://example.com/doc。 ご確認ください";
    expect(parseContent(noteWith(content))).toEqual([
      { type: "text", text: "資料は " },
      { type: "url", url: "https://example.com/doc" },
      { type: "text", text: "。 ご確認ください" },
    ] satisfies ContentToken[]);
  });

  it("外側の丸括弧に対応しない ')' を URL に含めない", () => {
    // 捕まえる変異: 貪欲に取る（末尾の約物を剥がさない）
    const content = "見て (https://example.com/foo) です";
    expect(parseContent(noteWith(content))).toEqual([
      { type: "text", text: "見て (" },
      { type: "url", url: "https://example.com/foo" },
      { type: "text", text: ") です" },
    ] satisfies ContentToken[]);
  });

  it("URL 内部で対応している ')' は含める", () => {
    // 捕まえる変異: 対応を見ず常に末尾の ')' を剥がす
    // (Wikipedia のような URL の一部を落としてしまう)
    const content =
      "https://en.wikipedia.org/wiki/Example_(disambiguation) 参照";
    expect(parseContent(noteWith(content))).toEqual([
      {
        type: "url",
        url: "https://en.wikipedia.org/wiki/Example_(disambiguation)",
      },
      { type: "text", text: " 参照" },
    ] satisfies ContentToken[]);
  });
});

describe("parseContent: nostr: URI", () => {
  it.each<[string, string]>([
    ["npub", encodeBech32("npub", PUBKEY)],
    ["note", encodeBech32("note", ID)],
    [
      "nprofile",
      encodeEntity("nprofile", [{ type: 0, value: hexToBytes(PUBKEY) }]),
    ],
    ["nevent", encodeEntity("nevent", [{ type: 0, value: hexToBytes(ID) }])],
    [
      "naddr",
      encodeEntity("naddr", [
        { type: 0, value: new Uint8Array(0) },
        { type: 2, value: hexToBytes(PUBKEY) },
        { type: 3, value: kindBytes(30023) },
      ]),
    ],
  ])("%s が mention になる", (_kind, entity) => {
    // 捕まえる変異: 一部の prefix しか mention として扱わない
    const raw = `nostr:${entity}`;
    const tokens = parseContent(noteWith(`見て ${raw} です`));
    const mention = tokens.find((t) => t.type === "mention");
    expect(mention).toMatchObject({ type: "mention", raw });
  });

  it("nsec がテキストのまま残る", () => {
    // 捕まえる変異: decodeNip19 が undefined を返したことを無視して
    // mention トークンを作ってしまう (ADR-0008 違反 —— 秘密鍵を構造化データ
    // にしてはいけない)
    const raw = `nostr:${encodeBech32("nsec", PUBKEY)}`;
    const content = `危険 ${raw} 注意`;
    const tokens = parseContent(noteWith(content));
    expect(tokens.some((t) => t.type === "mention")).toBe(false);
    expect(concatTokens(tokens)).toBe(content);
  });

  it("壊れた nostr: 入力がテキストのまま残る", () => {
    // 捕まえる変異: デコードできない参照を消す（本文が欠ける）
    const content = "壊れてる nostr:npub1invalidchecksumvalue です";
    const tokens = parseContent(noteWith(content));
    expect(tokens.some((t) => t.type === "mention")).toBe(false);
    expect(concatTokens(tokens)).toBe(content);
  });
});

describe("parseContent: 絵文字", () => {
  it("emoji タグにあるものだけが絵文字になる", () => {
    // 捕まえる変異: 本文中の :word: を索引を見ずに全部絵文字にする
    const event = noteWith("気分は :happy: です、:sad: は無し", [
      ["emoji", "happy", "https://cdn.example/happy.png"],
    ]);
    expect(parseContent(event)).toEqual([
      { type: "text", text: "気分は " },
      {
        type: "emoji",
        shortcode: "happy",
        url: "https://cdn.example/happy.png",
      },
      { type: "text", text: " です、:sad: は無し" },
    ] satisfies ContentToken[]);
  });

  it("12:30:45 のような時刻表記が絵文字にならない", () => {
    // 捕まえる変異: 索引を見ずに :word: を全部絵文字にする
    const content = "開始は 12:30:45 です";
    const tokens = parseContent(noteWith(content));
    expect(tokens.some((t) => t.type === "emoji")).toBe(false);
    expect(concatTokens(tokens)).toBe(content);
  });

  it("文字集合（英数字・ハイフン・アンダースコア）に合わないショートコードのタグを無視する", () => {
    // 捕まえる変異: NIP-30 の文字集合検証をせず索引に入れる
    const event = noteWith("変な絵文字 :bad!name: です", [
      ["emoji", "bad!name", "https://cdn.example/x.png"],
    ]);
    const tokens = parseContent(event);
    expect(tokens.some((t) => t.type === "emoji")).toBe(false);
    expect(concatTokens(tokens)).toBe(event.content);
  });

  it("emoji タグの url が空ならそのショートコードは絵文字にしない", () => {
    // 捕まえる変異: url の空チェックをしない
    const event = noteWith("空URL :foo: です", [["emoji", "foo", ""]]);
    const tokens = parseContent(event);
    expect(tokens.some((t) => t.type === "emoji")).toBe(false);
    expect(concatTokens(tokens)).toBe(event.content);
  });

  it("同じショートコードのタグが 2 つあれば先勝ち", () => {
    // 捕まえる変異: 索引を後勝ちにする（Map.set を無条件で行う）
    const event = noteWith(":dup: です", [
      ["emoji", "dup", "https://cdn.example/first.png"],
      ["emoji", "dup", "https://cdn.example/second.png"],
    ]);
    expect(parseContent(event)).toEqual([
      { type: "emoji", shortcode: "dup", url: "https://cdn.example/first.png" },
      { type: "text", text: " です" },
    ] satisfies ContentToken[]);
  });
});

describe("parseContent: ハッシュタグ", () => {
  it("日本語のハッシュタグが取れる", () => {
    // 捕まえる変異: 文字クラスを ASCII だけに絞る
    // (\p{L}/\p{N} ではなく [a-zA-Z0-9_-] にする)
    const content = "今日は #天気 がいい";
    expect(parseContent(noteWith(content))).toEqual([
      { type: "text", text: "今日は " },
      { type: "hashtag", tag: "天気", raw: "#天気" },
      { type: "text", text: " がいい" },
    ] satisfies ContentToken[]);
  });

  it("tag は小文字化され、raw に元の表記が残る", () => {
    // 捕まえる変異: tag を小文字化しない
    // (カラムの #t フィルタは小文字で引くので、タップしても何も出なくなる)
    const content = "#HelloWorld です";
    expect(parseContent(noteWith(content))).toEqual([
      { type: "hashtag", tag: "helloworld", raw: "#HelloWorld" },
      { type: "text", text: " です" },
    ] satisfies ContentToken[]);
  });
});

describe("isProbablyImageUrl", () => {
  it("拡張子つき URL は画像と判定する", () => {
    // 捕まえる変異: 常に false を返す
    expect(isProbablyImageUrl("https://example.com/cat.png")).toBe(true);
  });

  it("拡張子なし URL は画像と判定しない", () => {
    // 捕まえる変異: 拡張子の有無を確認せず常に true を返す
    expect(isProbablyImageUrl("https://example.com/cat")).toBe(false);
  });

  it("クエリ文字列つきでも拡張子で判定する", () => {
    // 捕まえる変異: クエリ文字列を切り離さずに拡張子を判定する
    // (末尾が拡張子ではなくクエリ値になり、常に false になる)
    expect(isProbablyImageUrl("https://example.com/cat.jpg?w=100")).toBe(true);
  });

  it("フラグメントつきでも拡張子で判定する", () => {
    // 捕まえる変異: フラグメントを切り離さずに拡張子を判定する
    expect(isProbablyImageUrl("https://example.com/cat.gif#preview")).toBe(
      true,
    );
  });

  it("拡張子の大小を区別しない", () => {
    // 捕まえる変異: toLowerCase() をせず大文字拡張子を見逃す
    expect(isProbablyImageUrl("https://example.com/cat.JPG")).toBe(true);
  });

  it("画像でない拡張子は false", () => {
    // 捕まえる変異: 拡張子を確認せず常に true を返す
    expect(isProbablyImageUrl("https://example.com/doc.pdf")).toBe(false);
  });
});
