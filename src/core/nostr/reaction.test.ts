import { describe, expect, it } from "vitest";
import type { NostrEvent } from "./event";
import { parseReaction } from "./reaction";

const base: NostrEvent = {
  id: "1".repeat(64),
  pubkey: "2".repeat(64),
  created_at: 1000,
  kind: 7,
  tags: [],
  content: "+",
  sig: "0".repeat(128),
};

const TARGET = "a".repeat(64);
const AUTHOR = "b".repeat(64);
const reaction = (over: Partial<NostrEvent>): NostrEvent => ({
  ...base,
  ...over,
});

describe("parseReaction", () => {
  it("`+` は like", () => {
    // 捕まえる変異: like の分岐を消して全部 text にする
    expect(
      parseReaction(reaction({ tags: [["e", TARGET]], content: "+" }))?.content,
    ).toEqual({ type: "like" });
  });

  it("空文字も like", () => {
    // 捕まえる変異: `content === "+"` だけを like にする (v0 がこの誤りを
    // 持っている)。NIP-25 は「空文字はクライアントが `+` とみなすべき」と
    // 定めており、text に落とすと空のリアクションが画面に出る。
    expect(
      parseReaction(reaction({ tags: [["e", TARGET]], content: "" }))?.content,
    ).toEqual({ type: "like" });
  });

  it("emoji タグと `:name:` が一致すれば emoji", () => {
    // 捕まえる変異: emoji タグを見ずに text にする
    const parsed = parseReaction(
      reaction({
        tags: [
          ["e", TARGET],
          ["emoji", "smile", "https://example.com/smile.png"],
        ],
        content: ":smile:",
      }),
    );
    expect(parsed?.content).toEqual({
      type: "emoji",
      name: "smile",
      url: "https://example.com/smile.png",
    });
  });

  it("emoji タグがあっても content が一致しなければ text", () => {
    // 捕まえる変異: content を見ずに emoji タグがあれば emoji にする。
    // `:smile:` 以外の本文で登録済みの画像が出てしまう。
    const parsed = parseReaction(
      reaction({
        tags: [
          ["e", TARGET],
          ["emoji", "smile", "https://example.com/smile.png"],
        ],
        content: "🎉",
      }),
    );
    expect(parsed?.content).toEqual({ type: "text", content: "🎉" });
  });

  it("対象は最後の e タグ", () => {
    // 捕まえる変異: 最初の e タグを取る。NIP-25 はスレッドの祖先を前に
    // 並べるので、先頭を取ると祖先へリアクションしたことになる。
    const other = "c".repeat(64);
    expect(
      parseReaction(
        reaction({
          tags: [
            ["e", other],
            ["e", TARGET],
          ],
        }),
      )?.targetId,
    ).toBe(TARGET);
  });

  it("対象の著者は最後の p タグ", () => {
    // 捕まえる変異: 最初の p タグを取る (e タグと同じ理由)
    const other = "d".repeat(64);
    expect(
      parseReaction(
        reaction({
          tags: [
            ["e", TARGET],
            ["p", other],
            ["p", AUTHOR],
          ],
        }),
      )?.targetPubkey,
    ).toBe(AUTHOR);
  });

  it("p タグが無くても対象 id は取れる", () => {
    // 捕まえる変異: p タグを必須にする。NIP-25 は SHOULD であって MUST では
    // なく、付けないクライアントは実在する。
    const parsed = parseReaction(reaction({ tags: [["e", TARGET]] }));
    expect(parsed?.targetId).toBe(TARGET);
    expect(parsed?.targetPubkey).toBeUndefined();
  });

  it("e タグが無ければ undefined (例外を投げない)", () => {
    // 捕まえる変異: throw する (v0 がそうしている)。1 件の壊れたイベントで
    // カラム全体が落ちる。
    expect(() => parseReaction(reaction({ tags: [] }))).not.toThrow();
    expect(parseReaction(reaction({ tags: [] }))).toBeUndefined();
  });

  it("64 桁 hex でない e タグは対象として採らない", () => {
    // 捕まえる変異: 形を確かめずに採る。存在しない id を延々と引きに行く。
    expect(
      parseReaction(reaction({ tags: [["e", "not-an-id"]] })),
    ).toBeUndefined();
  });

  it("kind が 7 でなければ undefined", () => {
    // 捕まえる変異: kind を見ない。リポスト (kind:6) も e タグを持つので、
    // 見ないとリポストがリアクションとして解釈される。
    expect(
      parseReaction(reaction({ kind: 1, tags: [["e", TARGET]] })),
    ).toBeUndefined();
  });
});
