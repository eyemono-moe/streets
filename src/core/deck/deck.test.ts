import { describe, expect, it } from "vitest";
import { FALLBACK_RELAYS } from "../read/default-relays";
import {
  type Deck,
  deckStorageKey,
  defaultDeck,
  loadDeck,
  saveDeck,
} from "./deck";

const deck: Deck = {
  version: 2,
  columns: [
    {
      id: "home",
      title: "ホーム",
      source: { kind: "literal", filters: [{ kinds: [1] }] },
    },
  ],
};

describe("loadDeck / saveDeck", () => {
  it("保存したものを読み戻せる", () => {
    expect(loadDeck(saveDeck(deck))).toEqual(deck);
  });

  it("notifications 列を読み戻せる", () => {
    // 捕まえる変異: columnSourceSchema に notifications の variant を
    // 足さない。保存はできてもリロードで **デッキ全体が** undefined になり
    // (valibot の variant は 1 つでも外れると全体が失敗)、通知カラムを
    // 足したユーザーは次の起動でカラムを全部失う。
    const withNotifications = {
      version: 2 as const,
      columns: [
        { id: "n", title: "通知", source: { kind: "notifications" as const } },
      ],
    };
    expect(loadDeck(saveDeck(withNotifications))).toEqual(withNotifications);
  });

  it("null (未保存) は undefined", () => {
    // このアサーションが実際に保証すること: JSON.parse(null) は例外を
    // 投げない ("null" へ強制変換されて JSON の null リテラルとしてパースが
    // 成功する) —— raw === null の早期リターンを削っても valibot 側の
    // スキーマ検証が最終的に undefined を返すので、この 1 本のアサーション
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
    expect(loadDeck(JSON.stringify({ ...deck, version: 1 }))).toBeUndefined();
  });

  it("version 1 の古い形は undefined", () => {
    // 捕まえる変異: version チェックと kind 判別のどちらか片方だけを外す。
    // このフィクスチャは二重に守られている —— version を見なくても、旧
    // source `{ type: "nostr", filters }` には `kind` が無いので
    // v.variant("kind", ...) が弾く。逆に kind 判別を緩めても、version が
    // 2 でなければ弾かれる。実際に落とせたのは両方を同時に緩めたときだけ
    // (`version: v.number()` かつ `kind` を optional にして `v.union` へ
    // 差し替え) —— 検証済み。どちらか一方だけを壊す変異は他のテスト
    // (「version が違えば undefined」「kind の無い source は undefined」)
    // が個別に捕まえる。それでもこのフィクスチャを残すのは、実際に手元の
    // localStorage に残りうる「本物の旧デッキ」の形を通しで確かめるため。
    //
    // 旧 version 1 の source は `{ type: "nostr", filters }` という別の形
    // なので、これを Deck として読むと `source.kind` が undefined になり、
    // resolveSource がどちらの分岐にも入らない (= literal 側へ落ちて
    // `filters: undefined` を読み取り層へ渡す)。
    expect(
      loadDeck(
        JSON.stringify({
          version: 1,
          columns: [
            {
              id: "home",
              title: "ホーム",
              source: { type: "nostr", filters: [{ kinds: [1] }] },
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("columns が配列でなければ undefined", () => {
    // 捕まえる変異: 形を確かめずキャストする
    expect(
      loadDeck(JSON.stringify({ version: 2, columns: "nope" })),
    ).toBeUndefined();
  });

  it("column の必須フィールドが欠けていれば undefined", () => {
    // 捕まえる変異: 要素の中身を確かめない (title の無いカラムで描画時に落ちる)
    expect(
      loadDeck(JSON.stringify({ version: 2, columns: [{ id: "a" }] })),
    ).toBeUndefined();
  });

  it("kind の無い source は undefined", () => {
    // 捕まえる変異: variant の判別キーを見ずに union のどちらかへ通す
    expect(
      loadDeck(
        JSON.stringify({
          version: 2,
          columns: [
            { id: "a", title: "a", source: { filters: [{ kinds: [1] }] } },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("followees の kinds が数値配列でなければ undefined", () => {
    // 捕まえる変異: valibot のスキーマで kinds を v.unknown() にする
    expect(
      loadDeck(
        JSON.stringify({
          version: 2,
          columns: [
            {
              id: "a",
              title: "a",
              source: { kind: "followees", kinds: ["1"] },
            },
          ],
        }),
      ),
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
          version: 2,
          columns: [
            {
              id: "a",
              title: "b",
              source: {
                kind: "literal",
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
          version: 2,
          columns: [
            {
              id: "a",
              title: "b",
              source: {
                kind: "literal",
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
          version: 2,
          columns: [
            { id: "a", title: "b", source: { kind: "literal", filters: [{}] } },
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
          version: 2,
          columns: [
            {
              id: "a",
              title: "b",
              source: { kind: "literal", filters: [{ since: 123 }] },
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
      version: 2,
      columns: [
        {
          id: "a",
          title: "b",
          source: {
            kind: "literal",
            filters: [{ "#e": ["e".repeat(64)] }],
          },
        },
      ],
    };
    expect(loadDeck(JSON.stringify(withTagFilter))).toEqual(withTagFilter);
  });
});

describe("defaultDeck", () => {
  const viewerPubkey = "a".repeat(64);

  it("ホーム・単一著者・明示リレーの 3 本を返す", () => {
    const result = defaultDeck(viewerPubkey);

    expect(result.version).toBe(2);
    expect(result.columns).toHaveLength(3);

    // ホーム: フォローの展開を resolveSource に任せる派生ソース
    const home = result.columns.find((c) => c.id === "home");
    expect(home?.source).toEqual({ kind: "followees", kinds: [1, 6] });

    // 単一著者: 自分の投稿だけを、フォロー数によらず必ず映す対照群
    const mine = result.columns.find(
      (c) => c.source.kind === "literal" && !c.source.relays,
    );
    expect(mine?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1, 6], authors: [viewerPubkey] }],
    });

    // 明示リレー: Outbox をバイパスして relays を直接持つ。他の 2 本と同じく
    // 構造を丸ごと比較する (relays.length > 0 だけの緩いアサーションだと
    // kinds を落とす変異を捕まえられない)。
    const explicit = result.columns.find(
      (c) => c.source.kind === "literal" && c.source.relays,
    );
    expect(explicit?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1] }],
      relays: [...FALLBACK_RELAYS],
    });
  });

  it("ホームと自分の投稿はリポストも集める", () => {
    // 捕まえる変異: TIMELINE_KINDS から 6 を落とす。上の toEqual でも
    // 落とせるが、そちらは 3 本の構造をまとめて見ているので「なぜ 6 が
    // 要るのか」が読めない。フォロー相手のリポストが列から丸ごと消える、
    // というのがこの 1 行が守っているもの。
    const result = defaultDeck(viewerPubkey);

    const home = result.columns.find((c) => c.id === "home");
    expect(home?.source.kind === "followees" && home.source.kinds).toContain(6);

    const mine = result.columns.find((c) => c.id === "mine");
    expect(
      mine?.source.kind === "literal" && mine.source.filters[0]?.kinds,
    ).toContain(6);
  });

  it("column の id が重複しない", () => {
    const result = defaultDeck(viewerPubkey);
    const ids = result.columns.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("deckStorageKey (final review, Important 3)", () => {
  const pubkeyA = "a".repeat(64);
  const pubkeyB = "b".repeat(64);

  it("同じ pubkey には同じキーを返す", () => {
    expect(deckStorageKey(pubkeyA)).toBe(deckStorageKey(pubkeyA));
  });

  it("pubkey ごとに異なるキーを返す", () => {
    // 捕まえる変異: pubkey を無視して固定のキーを返す (旧 DECK_STORAGE_KEY
    // が全アカウントで 1 本を共有していたバグに逆戻りする)。これを見逃す
    // と、B でログインしたときに A が保存したデッキ (A の followees を
    // 焼き込んだ home 列、A の pubkey を著者に持つ mine 列) をそのまま
    // 読み込んでしまう。
    expect(deckStorageKey(pubkeyA)).not.toBe(deckStorageKey(pubkeyB));
  });

  it("A が保存したデッキは B のキーからは読めない", () => {
    // v1.tsx の `window.localStorage` の代わりに Map で十分 ——
    // ここで確かめたいのはキーの分離そのもので、Storage API の挙動では
    // ない。
    const storage = new Map<string, string>();
    const deckA: Deck = {
      version: 2,
      columns: [
        {
          id: "home",
          title: "A のホーム",
          source: {
            kind: "literal",
            filters: [{ kinds: [1], authors: [pubkeyA] }],
          },
        },
      ],
    };
    storage.set(deckStorageKey(pubkeyA), saveDeck(deckA));

    // 捕まえる変異: deckStorageKey が pubkey を無視する、あるいは
    // v1.tsx 側が保存済みデッキを pubkey を確かめずそのまま使う
    // (アカウント境界の欠落)。B のキーでは A のデッキは存在しない
    // (undefined = defaultDeck へ落ちる) ことを確かめる。
    expect(
      loadDeck(storage.get(deckStorageKey(pubkeyB)) ?? null),
    ).toBeUndefined();
    // A 自身のキーでは引き続き読める (退行防止)。
    expect(loadDeck(storage.get(deckStorageKey(pubkeyA)) ?? null)).toEqual(
      deckA,
    );
  });
});
