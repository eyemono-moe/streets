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
    // このアサーションが実際に保証すること: JSON.parse(null) は例外を
    // 投げない ("null" へ強制変換されて JSON の null リテラルとしてパースが
    // 成功する) —— raw === null の早期リターンを削っても isDeck() 側の
    // null チェックが最終的に undefined を返すので、この 1 本のアサーション
    // 単体では早期リターンの有無を区別できない (だから「捕まえる変異」は
    // 無い)。それでも早期リターンを残すのは、「raw が無い」という呼び出し
    // 側の意図を JSON.parse の型強制という偶然の挙動任せにせず、コードとして
    // 明示するため。
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
    // 捕まえる変異: filter の中身の型を確かめない。
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
    // 捕まえる変異: 空フィルタを許す。
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

  it("filter が since/until/limit/search だけなら undefined", () => {
    // 捕まえる変異: scoping フィールド (ids/authors/kinds/#tag) の有無を
    // 見ない。{ since: 123 } は空オブジェクトと同じ穴 —— since は範囲を
    // 絞り込むだけで、誰の・何のイベントかという範囲そのものは定めない
    // ので、これも無制限購読になる。
    expect(
      loadDeck(
        JSON.stringify({
          version: 1,
          columns: [
            {
              id: "a",
              title: "b",
              source: { type: "nostr", filters: [{ since: 123 }] },
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("filter が #tag だけでも scoping として受け付ける", () => {
    // 捕まえる変異: scoping フィールドの判定から #tag を落とす。#e/#p
    // などのタグ絞り込みは合法な scoping であり、空フィルタ扱いにして
    // 巻き添えで拒否してはいけない (退行防止)。
    const withTagFilter: Deck = {
      version: 1,
      columns: [
        {
          id: "a",
          title: "b",
          source: { type: "nostr", filters: [{ "#e": ["e".repeat(64)] }] },
        },
      ],
    };
    expect(loadDeck(JSON.stringify(withTagFilter))).toEqual(withTagFilter);
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
    // 構造を丸ごと比較する (relays.length > 0 だけの緩いアサーションだと
    // kinds を落とす変異を捕まえられない)。
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
