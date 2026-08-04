import { describe, expect, it } from "vitest";
import { type Deck, defaultDeck, loadDeck, saveDeck } from "./deck";

const deck: Deck = {
  version: 1,
  columns: [
    {
      id: "home",
      title: "ホーム",
      source: { type: "nostr", filters: [{ kinds: [1] }] },
    },
  ],
};

describe("loadDeck / saveDeck", () => {
  it("保存したものを読み戻せる", () => {
    expect(loadDeck(saveDeck(deck))).toEqual(deck);
  });

  it("null (未保存) は undefined", () => {
    // 捕まえる変異: null を JSON.parse に渡して例外を投げる
    expect(loadDeck(null)).toBeUndefined();
  });

  it("JSON として壊れていたら undefined", () => {
    // 捕まえる変異: try/catch を省く (初回起動時にアプリが白画面になる)
    expect(loadDeck("{ not json")).toBeUndefined();
  });

  it("version が違えば undefined", () => {
    // 捕まえる変異: version を見ない
    // (NIP-78 へ移すとき、古い形を新しい形として読んで壊れる)
    expect(loadDeck(JSON.stringify({ ...deck, version: 2 }))).toBeUndefined();
  });

  it("columns が配列でなければ undefined", () => {
    // 捕まえる変異: 形を確かめずキャストする
    expect(
      loadDeck(JSON.stringify({ version: 1, columns: "nope" })),
    ).toBeUndefined();
  });

  it("column の必須フィールドが欠けていれば undefined", () => {
    // 捕まえる変異: 要素の中身を確かめない (title の無いカラムで描画時に落ちる)
    expect(
      loadDeck(JSON.stringify({ version: 1, columns: [{ id: "a" }] })),
    ).toBeUndefined();
  });
});

describe("defaultDeck", () => {
  const viewerPubkey = "a".repeat(64);
  const followees = ["b".repeat(64), "c".repeat(64)];

  it("ホーム・単一著者・明示リレーの 3 本を返す", () => {
    const result = defaultDeck(viewerPubkey, followees);

    expect(result.version).toBe(1);
    expect(result.columns).toHaveLength(3);

    // ホーム: フォロー全員をルーティングに任せる (relays を指定しない)
    const home = result.columns.find((c) => c.id === "home");
    expect(home?.source).toEqual({
      type: "nostr",
      filters: [{ kinds: [1], authors: followees }],
    });

    // 単一著者: 自分の投稿だけを、フォロー数によらず必ず映す対照群
    const mine = result.columns.find(
      (c) => c.id !== "home" && !c.source.relays,
    );
    expect(mine?.source).toEqual({
      type: "nostr",
      filters: [{ kinds: [1], authors: [viewerPubkey] }],
    });

    // 明示リレー: Outbox をバイパスして relays を直接持つ
    const explicit = result.columns.find((c) => c.source.relays);
    expect(explicit?.source.relays?.length).toBeGreaterThan(0);
  });

  it("column の id が重複しない", () => {
    const result = defaultDeck(viewerPubkey, followees);
    const ids = result.columns.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
