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
    // 捕まえる変異: notifications の variant を足さない (variant は 1 つでも外れると全体が失敗し、カラムを全部失う)。
    const withNotifications = {
      version: 2 as const,
      columns: [
        { id: "n", title: "通知", source: { kind: "notifications" as const } },
      ],
    };
    expect(loadDeck(saveDeck(withNotifications))).toEqual(withNotifications);
  });

  it("null (未保存) は undefined", () => {
    // JSON.parse(null) は例外を投げず null 扱いになるため検証はできないが、意図を明示するため早期リターンを残す。
    expect(loadDeck(null)).toBeUndefined();
  });

  it("JSON として壊れていたら undefined", () => {
    // 捕まえる変異: try/catch を省く (初回起動時にアプリが白画面になる)
    expect(loadDeck("{ not json")).toBeUndefined();
  });

  it("version が違えば undefined", () => {
    // 捕まえる変異: version を見ない (NIP-78 移行時に古い形を新しい形として読み壊れる)。
    expect(loadDeck(JSON.stringify({ ...deck, version: 1 }))).toBeUndefined();
  });

  it("version 1 の古い形は undefined", () => {
    // 捕まえる変異: version と kind 判別を両方同時に緩めたときだけ検知
    // できる (片方だけなら他のテストが捕まえる)。旧 version 1 の
    // `{ type: "nostr", filters }` は kind を持たないため、素通りすると
    // resolveSource が壊れた literal (`filters: undefined`) を返してしまう。
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
    // 捕まえる変異: filter の中身の型を確かめない (`?? []` は null/undefined しか捕まえないので、authors が数値だと for...of が TypeError で白画面になる)。
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
    // 捕まえる変異: 空フィルタを許す ({} は無制限購読になり、壊れたデッキが本物のリレーへそのまま通ってしまう)。
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
    // 捕まえる変異: scoping フィールドの有無を見ない ({ since: 123 } も範囲を絞るだけで無制限購読と同じ穴)。
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
    // 捕まえる変異: scoping 判定から #tag を落とす (#e/#p は合法な scoping であり空フィルタ扱いにしない)。
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

  it("ユーザー関連カラムを保存形式から復元する", () => {
    // 捕まえる変異: 新しい source kind をスキーマへ追加せず、デッキ全体を既定値へ戻す。
    const pubkey = "a".repeat(64);
    const deck: Deck = {
      version: 2,
      columns: [
        { id: "user", title: "user", source: { kind: "user", pubkey } },
        {
          id: "followees",
          title: "followees",
          source: { kind: "followees-list", pubkey },
        },
        {
          id: "followers",
          title: "followers",
          source: { kind: "followers-list", pubkey },
        },
      ],
    };
    expect(loadDeck(saveDeck(deck))).toEqual(deck);
  });

  it("ユーザー関連カラムの不正な公開鍵を拒否する", () => {
    // 捕まえる変異: pubkey を任意文字列として受け付け、永久に一致しないカラムを復元する。
    expect(
      loadDeck(
        JSON.stringify({
          version: 2,
          columns: [
            {
              id: "user",
              title: "user",
              source: { kind: "user", pubkey: "invalid" },
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("旧 user プリセットをユーザー詳細カラムへ移行する", () => {
    // 捕まえる変異: version 2 の旧 literal をそのまま返し、既存ユーザーがプロフィール/フォロー操作を使えなくなる。
    const pubkey = "a".repeat(64);
    expect(
      loadDeck(
        JSON.stringify({
          version: 2,
          columns: [
            {
              id: "legacy-user",
              title: "@npub14242424",
              source: {
                kind: "literal",
                filters: [{ kinds: [1, 6], authors: [pubkey] }],
              },
            },
          ],
        }),
      ),
    ).toEqual({
      version: 2,
      columns: [
        {
          id: "legacy-user",
          title: "@npub14242424",
          source: { kind: "user", pubkey },
        },
      ],
    });
  });

  it("旧 user と区別できない改名済み literal は変換しない", () => {
    // 捕まえる変異: 単一著者の literal をすべて user に変え、任意フィルタの意図を変えてしまう。
    const literal: Deck = {
      version: 2,
      columns: [
        {
          id: "literal",
          title: "調査用",
          source: {
            kind: "literal",
            filters: [{ kinds: [1, 6], authors: ["a".repeat(64)] }],
          },
        },
      ],
    };
    expect(loadDeck(saveDeck(literal))).toEqual(literal);
  });

  it("旧 user に似ていても追加条件を持つ literal は変換しない", () => {
    // 捕まえる変異: authors/kinds だけで旧プリセットと判定し、limit などの追加条件を黙って失う。
    const pubkey = "a".repeat(64);
    const literal: Deck = {
      version: 2,
      columns: [
        {
          id: "limited",
          title: "@npub14242424",
          source: {
            kind: "literal",
            filters: [{ kinds: [1, 6], authors: [pubkey], limit: 1 }],
          },
        },
      ],
    };
    expect(loadDeck(saveDeck(literal))).toEqual(literal);
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

    // 明示リレー: 構造を丸ごと比較する (relays.length > 0 だけの緩いアサーションでは kinds を落とす変異を捕まえられない)。
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
    // 捕まえる変異: TIMELINE_KINDS から 6 を落とす (上の toEqual でも捕まるが、これはリポストが消える理由を明示する)。
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

describe("deckStorageKey", () => {
  const pubkeyA = "a".repeat(64);
  const pubkeyB = "b".repeat(64);

  it("同じ pubkey には同じキーを返す", () => {
    expect(deckStorageKey(pubkeyA)).toBe(deckStorageKey(pubkeyA));
  });

  it("pubkey ごとに異なるキーを返す", () => {
    // 捕まえる変異: pubkey を無視して固定キーを返す (B ログイン時に A のデッキをそのまま読み込んでしまう)。
    expect(deckStorageKey(pubkeyA)).not.toBe(deckStorageKey(pubkeyB));
  });

  it("A が保存したデッキは B のキーからは読めない", () => {
    // `window.localStorage` の代わりに Map で十分 —— 確かめたいのはキーの分離自体で Storage API の挙動ではない。
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

    // 捕まえる変異: deckStorageKey が pubkey を無視する、または呼び出し側が確かめずそのまま使う (アカウント境界の欠落)。
    expect(
      loadDeck(storage.get(deckStorageKey(pubkeyB)) ?? null),
    ).toBeUndefined();
    // A 自身のキーでは引き続き読める (退行防止)。
    expect(loadDeck(storage.get(deckStorageKey(pubkeyA)) ?? null)).toEqual(
      deckA,
    );
  });
});
