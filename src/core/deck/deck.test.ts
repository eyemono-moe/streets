import { describe, expect, it } from "vitest";
import { FALLBACK_RELAYS } from "../read/default-relays";
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
    // 捕まえる変異: raw === null の早期リターンを削る。
    // 注意: JSON.parse(null) は例外を投げない ("null" へ強制変換されて
    // JSON の null リテラルとしてパースが成功する) —— 早期リターンを削って
    // も isDeck() 側の null チェックが最終的に undefined を返すので、この
    // アサーション単体は早期リターンの有無を区別できない。ここで守っている
    // のは「raw が無い」という呼び出し側の意図を JSON.parse の型強制と
    // いう偶然の挙動に委ねないこと (fix round 1: 旧コメントの「例外を
    // 投げる」は誤りだった)。
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

  it("filter の authors が配列でなければ undefined", () => {
    // 捕まえる変異: filter の中身の型を確かめない (fix round 1, Critical)。
    // subscription-manager.ts の `for (const author of filter.authors ?? [])`
    // は `??` が null/undefined しか捕まえないので `42 ?? []` は `42` のまま
    // になり、`for...of` が非同期の外、createSection のマウント中に同期的に
    // TypeError を投げて白画面になる。
    expect(
      loadDeck(
        JSON.stringify({
          version: 1,
          columns: [
            {
              id: "a",
              title: "b",
              source: {
                type: "nostr",
                filters: [{ kinds: [1], authors: 42 }],
              },
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("filter の kinds が数値配列でなければ undefined", () => {
    // 捕まえる変異: kinds の要素型を確かめない
    expect(
      loadDeck(
        JSON.stringify({
          version: 1,
          columns: [
            {
              id: "a",
              title: "b",
              source: {
                type: "nostr",
                filters: [{ kinds: ["not-a-number"] }],
              },
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("filter が空オブジェクトなら undefined", () => {
    // 捕まえる変異: 空フィルタを許す (fix round 1, Important)。
    // {} は「著者も種類も問わない」= 無制限購読 (firehose) になり、壊れた
    // デッキが本物のリレーへの無制限購読として通ってしまう。
    expect(
      loadDeck(
        JSON.stringify({
          version: 1,
          columns: [
            { id: "a", title: "b", source: { type: "nostr", filters: [{}] } },
          ],
        }),
      ),
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

    // 明示リレー: Outbox をバイパスして relays を直接持つ。他の 2 本と同じく
    // 構造を丸ごと比較する (fix round 1, Minor: 以前は relays.length > 0 だけ
    // で、kinds を落とす変異を捕まえられなかった)。
    const explicit = result.columns.find((c) => c.source.relays);
    expect(explicit?.source).toEqual({
      type: "nostr",
      filters: [{ kinds: [1] }],
      relays: [...FALLBACK_RELAYS],
    });
  });

  it("column の id が重複しない", () => {
    const result = defaultDeck(viewerPubkey, followees);
    const ids = result.columns.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
