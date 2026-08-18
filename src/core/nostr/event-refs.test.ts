import { describe, expect, it } from "vitest";
import type { NostrEvent } from "./event";
import {
  embeddedRepostEvent,
  quoteTargets,
  replyTarget,
  repostTarget,
  tagOnlyQuoteTargets,
} from "./event-refs";
import { encodeBech32 } from "./nip19";

const ID_A = "a".repeat(64);
const ID_B = "b".repeat(64);
const PK = "c".repeat(64);

const noteWith = (
  tags: string[][],
  overrides: Partial<NostrEvent> = {},
): NostrEvent => ({
  id: ID_A,
  pubkey: PK,
  created_at: 1_700_000_000,
  kind: 1,
  tags,
  content: "",
  // isNostrEvent は sig を hex として検証するので、"s" のような非 hex 文字は使えない
  // (embeddedRepostEvent のテストが isNostrEvent を通すため)
  sig: "1".repeat(128),
  ...overrides,
});

describe("replyTarget", () => {
  it("reply marker があればそれを返す", () => {
    // 捕まえる変異: root を優先する (親ではなくスレッドの先頭を親として
    // 表示してしまう —— 長いスレッドで「誰への返信か」が常に間違う)
    expect(
      replyTarget(
        noteWith([
          ["e", ID_A, "wss://a/", "root", PK],
          ["e", ID_B, "wss://b/", "reply", PK],
        ]),
      ),
    ).toEqual({ form: "id", id: ID_B, relay: "wss://b/", pubkey: PK });
  });

  it("reply が無ければ root を返す", () => {
    // 捕まえる変異: reply marker だけを見る。NIP-10 は「ルートへの直接の
    // 返信は root marker の e タグ 1 本だけを持つ」と定めているので、
    // reply だけを見ると最も普通の返信が親を持たないことになる
    expect(replyTarget(noteWith([["e", ID_B, "", "root"]]))).toEqual({
      form: "id",
      id: ID_B,
    });
  });

  it("marker の無い e タグは無視する", () => {
    // 捕まえる変異: 位置ベースの旧形式を解釈する。NIP-10 自身が
    // deprecated かつ「曖昧で解決不能」としている
    expect(replyTarget(noteWith([["e", ID_B, "wss://b/"]]))).toBeUndefined();
  });

  it("空文字のリレー URL は relay を持たせない", () => {
    // 捕まえる変異: 空文字をそのまま relay に入れる (NIP-10 は
    // 「may be empty string」と明記している。空文字をリレーヒントとして
    // 下流へ渡すと接続先として使われうる)
    expect(replyTarget(noteWith([["e", ID_B, "", "root"]]))).not.toHaveProperty(
      "relay",
    );
  });

  it("pubkey が 64 桁 hex でなければ落とす", () => {
    // 捕まえる変異: 5 番目の要素を検証せずそのまま入れる (仕様 9 節)
    expect(replyTarget(noteWith([["e", ID_B, "", "root", "nope"]]))).toEqual({
      form: "id",
      id: ID_B,
    });
  });

  it("id が 64 桁 hex でなければタグごと落とす", () => {
    // 捕まえる変異: id を検証しない (壊れた id で fetchOnce を撃つ)
    expect(replyTarget(noteWith([["e", "short", "", "root"]]))).toBeUndefined();
  });
});

describe("quoteTargets", () => {
  it("q タグを順に返す", () => {
    // 捕まえる変異: 最初の 1 件だけ返す (複数引用が消える)
    expect(
      quoteTargets(
        noteWith([
          ["q", ID_A, "wss://a/", PK],
          ["q", ID_B, "", ""],
        ]),
      ),
    ).toEqual([
      { form: "id", id: ID_A, relay: "wss://a/", pubkey: PK },
      { form: "id", id: ID_B },
    ]);
  });

  it("event-address 形式を address として返す", () => {
    // 捕まえる変異: id と同じ扱いにする (`30023:<pubkey>:<d>` を
    // `{ ids: [...] }` で引きに行き、永久に見つからない)
    expect(
      quoteTargets(noteWith([["q", `30023:${PK}:slug`, "wss://a/"]])),
    ).toEqual([
      { form: "address", address: `30023:${PK}:slug`, relay: "wss://a/" },
    ]);
  });

  it("e タグは引用ではない", () => {
    // 捕まえる変異: e タグも引用として拾う。NIP-18 が q タグを作った目的
    // そのものが「引用がスレッドの返信として現れないようにする」ことなので、
    // 逆向きに混ぜると返信が引用として二重に描かれる
    expect(quoteTargets(noteWith([["e", ID_B, "", "root"]]))).toEqual([]);
  });
});

describe("tagOnlyQuoteTargets", () => {
  it("本文に出てこない q タグだけを返す", () => {
    // 捕まえる変異: 本文の言及を引かずに q タグを全部返す。本文の位置に
    // 埋め込んだ引用が最下部にもう一度出て、同じイベントが 2 回描かれる。
    const inBody = "a".repeat(64);
    const tagOnly = "b".repeat(64);
    const event = noteWith(
      [
        ["q", inBody],
        ["q", tagOnly],
      ],
      { content: `見て nostr:${encodeBech32("note", inBody)}` },
    );

    expect(tagOnlyQuoteTargets(event)).toEqual([{ form: "id", id: tagOnly }]);
  });

  it("本文にしかない引用は返さない", () => {
    // 捕まえる変異: 本文の言及も足して返す。本文側は MentionToken が
    // その位置に描くので、ここで返すと二重になる。
    const inBody = "c".repeat(64);
    const event = noteWith([], {
      content: `nostr:${encodeBech32("note", inBody)}`,
    });

    expect(tagOnlyQuoteTargets(event)).toEqual([]);
  });

  it("q タグの座標形式は本文と突き合わせずに残す", () => {
    // 捕まえる変異: address 形式を落とす。本文の nostr: は id しか
    // 運ばないので突き合わせようがなく、落とすと naddr の引用が消える。
    const event = noteWith([["q", "30023:abc:slug"]], { content: "本文" });

    expect(tagOnlyQuoteTargets(event)).toEqual([
      { form: "address", address: "30023:abc:slug" },
    ]);
  });
});

describe("repostTarget", () => {
  it("e タグを返す", () => {
    // 捕まえる変異: relay (tag[2]) を idRef へ渡さない/無視する。id だけ
    // 拾って relay を落としても他のアサーションは undefined 判定しか
    // 見ていないので気付けない —— relay まで含めて構造を丸ごと比較する
    // ことで、リポスト対象を引き直すためのリレーヒントが消えていないか
    // 確かめる (検証済み: tag[2] を undefined に差し替えると本テストだけ
    // 落ち、他の 14 本は通る)。
    expect(
      repostTarget(noteWith([["e", ID_B, "wss://b/"]], { kind: 6 })),
    ).toEqual({
      form: "id",
      id: ID_B,
      relay: "wss://b/",
    });
  });

  it("e タグが無ければ undefined (例外を投げない)", () => {
    // 捕まえる変異: throw する。v0 のパーサはそうしているが、1 件の不正な
    // イベントでカラム全体を壊してはいけない (仕様 9 節)
    expect(() => repostTarget(noteWith([], { kind: 6 }))).not.toThrow();
    expect(repostTarget(noteWith([], { kind: 6 }))).toBeUndefined();
  });
});

describe("embeddedRepostEvent", () => {
  it("content の JSON がイベントの形なら返す", () => {
    // 捕まえる変異: isNostrEvent を通した後、パースした埋め込みイベント
    // ではなく外側の repost イベント自身などの別の値を返す。他のテストは
    // すべて undefined 判定なので、この成功系だけが「返ってきた値の中身」
    // を確かめる (検証済み: `parsed` を `event` に差し替えると本テストだけ
    // 落ち、他の 14 本は通る)。
    const embedded = noteWith([], { id: ID_B });
    expect(
      embeddedRepostEvent(
        noteWith([], { kind: 6, content: JSON.stringify(embedded) }),
      ),
    ).toEqual(embedded);
  });

  it("content が空なら undefined", () => {
    // このアサーションが実際に保証すること: 空文字を JSON.parse に渡すと
    // SyntaxError を投げるが、下の try/catch がそのまま吸収して undefined
    // を返すので、event-refs.ts の `event.content.trim().length === 0` の
    // 早期リターンを削ってもこの 1 本のアサーション単体では有無を区別
    // できない (だから「捕まえる変異」は無い、検証済み: 早期リターンを
    // 削っても 15/15 通る)。それでも早期リターンを残す理由は
    // embeddedRepostEvent 側のコメントを参照。
    expect(
      embeddedRepostEvent(noteWith([], { kind: 6, content: "" })),
    ).toBeUndefined();
  });

  it("JSON として壊れていれば undefined", () => {
    // 捕まえる変異: try/catch を省く
    expect(
      embeddedRepostEvent(noteWith([], { kind: 6, content: "{ not json" })),
    ).toBeUndefined();
  });

  it("イベントの形をしていなければ undefined", () => {
    // 捕まえる変異: isNostrEvent を通さずキャストする。埋め込みは
    // **リポストした人が書いた任意の文字列**であり、形すら信用できない
    expect(
      embeddedRepostEvent(
        noteWith([], { kind: 6, content: JSON.stringify({ hello: 1 }) }),
      ),
    ).toBeUndefined();
  });
});
