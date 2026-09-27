import { describe, expect, it } from "vite-plus/test";
import type { ColumnKind, ColumnSourceOf } from "./column-kinds";
import {
  type Deck,
  columnLinkCards,
  deckStorageKey,
  defaultDeck,
  groupsNotifications,
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

  it("activity 列を読み戻せる", () => {
    const withActivity: Deck = {
      version: 2,
      columns: [
        {
          id: "a",
          title: "アクティビティ",
          source: { kind: "activity", target: "a".repeat(64) },
        },
      ],
    };
    expect(loadDeck(saveDeck(withActivity))).toEqual(withActivity);
  });

  it("検索の列を読み戻せる", () => {
    // 捕まえる変異: search の variant を足さない。検索カラムが読み直すたびに消える。
    const withSearch: Deck = {
      version: 2,
      columns: [
        {
          id: "s",
          title: "#coffee",
          source: { kind: "search", query: "#coffee" },
        },
      ],
    };
    expect(loadDeck(saveDeck(withSearch))).toEqual(withSearch);
  });

  it("問い合わせが空の検索の列は捨てる", () => {
    const empty = {
      version: 2,
      columns: [
        { id: "s", title: "検索", source: { kind: "search", query: "" } },
      ],
    };
    expect(loadDeck(JSON.stringify(empty))?.columns).toEqual([]);
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

  it("column の必須フィールドが欠けていれば、そのカラムを捨てる", () => {
    // 捕まえる変異: 要素の中身を確かめない (title の無いカラムで描画時に落ちる)。
    // デッキ全体は守る —— 1 本のために並びごと失わない。
    expect(
      loadDeck(JSON.stringify({ version: 2, columns: [{ id: "a" }] }))?.columns,
    ).toEqual([]);
  });

  it("kind の無い source のカラムは捨てる", () => {
    // 捕まえる変異: variant の判別キーを見ずに union のどちらかへ通す
    expect(
      loadDeck(
        JSON.stringify({
          version: 2,
          columns: [
            { id: "a", title: "a", source: { filters: [{ kinds: [1] }] } },
          ],
        }),
      )?.columns,
    ).toEqual([]);
  });

  it("followees の kinds が数値配列でないカラムは捨てる", () => {
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
      )?.columns,
    ).toEqual([]);
  });

  it("filter の authors が配列でないカラムは捨てる", () => {
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
      )?.columns,
    ).toEqual([]);
  });

  it("filter の kinds が数値配列でないカラムは捨てる", () => {
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
      )?.columns,
    ).toEqual([]);
  });

  it("filter が空オブジェクトのカラムは捨てる", () => {
    // 捕まえる変異: 空フィルタを許す ({} は無制限購読になり、壊れたデッキが本物のリレーへそのまま通ってしまう)。
    expect(
      loadDeck(
        JSON.stringify({
          version: 2,
          columns: [
            { id: "a", title: "b", source: { kind: "literal", filters: [{}] } },
          ],
        }),
      )?.columns,
    ).toEqual([]);
  });

  it("filter が since/until/limit/search だけのカラムは捨てる", () => {
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
      )?.columns,
    ).toEqual([]);
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

  it("ユーザー関連カラムの公開鍵が不正なら、そのカラムを捨てる", () => {
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
      )?.columns,
    ).toEqual([]);
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
  const relays = ["wss://yabu.me/"];

  it("ホーム・リレー・通知の 3 本をこの順で返す", () => {
    const result = defaultDeck(relays);

    expect(result.version).toBe(2);
    expect(result.columns.map((c) => c.source)).toEqual([
      // ホーム: フォローの展開を resolveSource に任せる派生ソース
      { kind: "followees", kinds: [1, 6] },
      // 誰もフォローしていない新規ユーザーにも流れが見えるよう、渡したリレーを読む
      { kind: "literal", filters: [{ kinds: [1] }], relays },
      // 通知: 自分の投稿に対するリポスト・引用・リアクションを集める派生ソース
      { kind: "notifications" },
    ]);
  });

  it("リレーが 0 本ならホームと通知だけにする", () => {
    expect(defaultDeck([]).columns.map((c) => c.source.kind)).toEqual([
      "followees",
      "notifications",
    ]);
  });

  it("column の id が重複しない", () => {
    const result = defaultDeck(relays);
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

describe("groupsNotifications", () => {
  it("通知カラムは、指定が無ければまとめる", () => {
    expect(
      groupsNotifications({
        id: "n",
        title: "通知",
        source: { kind: "notifications" },
      }),
    ).toBe(true);
  });

  it("通知カラムでも、切っていればまとめない", () => {
    expect(
      groupsNotifications({
        id: "n",
        title: "通知",
        source: { kind: "notifications" },
        groupNotifications: false,
      }),
    ).toBe(false);
  });

  it("通知以外のカラムはまとめない", () => {
    expect(
      groupsNotifications({
        id: "h",
        title: "ホーム",
        source: { kind: "followees", kinds: [1, 6] },
      }),
    ).toBe(false);
  });
});

describe("デッキの見た目（appearance）", () => {
  it("色を保存して読み戻せる", () => {
    const withColors: Deck = {
      ...deck,
      appearance: { accent: "#8440BD", ui: "#302170" },
    };
    expect(loadDeck(saveDeck(withColors))).toEqual(withColors);
  });

  it("色が壊れていても、カラムの並びは捨てずに色だけ既定に戻す", () => {
    const broken = JSON.stringify({
      ...deck,
      appearance: { accent: "purple", ui: "#302170" },
    });
    const loaded = loadDeck(broken);
    expect(loaded?.columns).toEqual(deck.columns);
    expect(loaded?.appearance).toBeUndefined();
  });
});

describe("知らない種類のカラムが混ざったとき", () => {
  const deck = (columns: unknown[]) => JSON.stringify({ version: 2, columns });
  const home = {
    id: "home",
    title: "ホーム",
    source: { kind: "followees", kinds: [1] },
  };

  it("そのカラムだけ捨てて、残りは読む", () => {
    // 捕まえる変異: 1 本でも読めなければデッキ全体を捨てる（新しい版で足した
    // カラムがあるだけで、並びも設定も丸ごと失う）
    const loaded = loadDeck(
      deck([
        home,
        { id: "s", title: "ねこ", source: { kind: "みらいの種類", q: "ねこ" } },
      ]),
    );
    expect(loaded?.columns).toEqual([home]);
  });

  it("全部読めなければ、カラムの無いデッキになる", () => {
    const loaded = loadDeck(deck([{ id: "s", title: "x", source: {} }]));
    expect(loaded?.columns).toEqual([]);
  });

  it("デッキそのものの形が違えば、これまでどおり読めない", () => {
    expect(
      loadDeck(JSON.stringify({ version: 1, columns: [] })),
    ).toBeUndefined();
    expect(loadDeck("{")).toBeUndefined();
  });
});

describe("linkCards", () => {
  const column = deck.columns[0];
  if (!column) throw new Error("fixture");

  it("保存された値が無ければ小さなカードにする", () => {
    expect(columnLinkCards(column)).toBe("compact");
    expect(columnLinkCards({ ...column, linkCards: "off" })).toBe("off");
  });

  it("保存して読み戻せる", () => {
    const saved: Deck = {
      ...deck,
      columns: [{ ...column, linkCards: "large" }],
    };
    expect(loadDeck(saveDeck(saved))?.columns[0]?.linkCards).toBe("large");
  });

  it("知らない値ならカラムを残して既定に戻す", () => {
    const raw = JSON.stringify({
      ...deck,
      columns: [{ ...column, linkCards: "medium" }],
    });
    // 捕まえる変異: 知らない値でカラムごと捨てる（新しい版の設定を古い版で開くと消える）
    const loaded = loadDeck(raw)?.columns[0];
    expect(loaded?.id).toBe(column.id);
    expect(loaded && columnLinkCards(loaded)).toBe("compact");
  });
});

describe("カラムの種類ごとの保存", () => {
  // 種類をキーにした表なので、種類を足すとここにも例を書くまで型検査が落ちる。
  const EXAMPLES: { [K in ColumnKind]: ColumnSourceOf<K> } = {
    literal: {
      kind: "literal",
      filters: [{ kinds: [1], "#t": ["nostr"] }],
      relays: ["wss://relay.example/"],
    },
    search: { kind: "search", query: "ねこ kind:1" },
    followees: { kind: "followees", kinds: [1, 6] },
    notifications: { kind: "notifications" },
    bookmarks: { kind: "bookmarks" },
    thread: { kind: "thread", focus: "a".repeat(64) },
    activity: { kind: "activity", target: "b".repeat(64) },
    user: { kind: "user", pubkey: "c".repeat(64) },
    "followees-list": { kind: "followees-list", pubkey: "d".repeat(64) },
    "followers-list": { kind: "followers-list", pubkey: "e".repeat(64) },
    "channel-list": { kind: "channel-list" },
    "channel-info": { kind: "channel-info", id: "e".repeat(64) },
    channel: {
      kind: "channel",
      id: "f".repeat(64),
      relays: ["wss://yabu.me/"],
    },
  };

  it.each(Object.values(EXAMPLES))("$kind は保存して読み戻せる", (source) => {
    // 捕まえる変異: 型にある種類を保存形式の検証に書き忘れる（読み直すたびにカラムが消える）
    const deck: Deck = {
      version: 2,
      columns: [{ id: "x", title: "x", source }],
    };
    expect(loadDeck(saveDeck(deck))).toEqual(deck);
  });
});
