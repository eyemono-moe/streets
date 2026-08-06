# A-1 デッキとカラム 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/v1-preview` の固定 3 カラムを、追加・削除・並べ替えのできる本物のデッキ（`/v1`）に置き換え、5〜10 カラムを実地で回せるようにする。

**Architecture:** データモデルを「フィルタの焼き込み」から「意図を保存する派生ソース」へ変え、解決を 1 関数に集める。永続化フォーマットの検証は valibot に寄せる。異常表示は [ADR-0026](../../adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md) に従い、ユーザーが行動できるものだけを常時出し、診断値は開発者モードの背後へ移す。読み取り層には一切手を入れない。

**Tech Stack:** SolidJS / TypeScript / valibot / Vitest / Playwright。

**仕様:** [docs/superpowers/specs/2026-08-07-deck-and-columns-design.md](../specs/2026-08-07-deck-and-columns-design.md)。**タスクの記述と仕様が食い違ったら仕様が正。**

## Global Constraints

- **完了の判定は `pnpm vitest run && pnpm typecheck && pnpm check` の 3 つすべて。**
  `pnpm check` は Biome と読み取り層の依存チェックだけで、**型検査を含まない**
  （型検査は `pnpm typecheck` = `tsc -b`）。Vitest は esbuild で変換するため型
  エラーを一切見ない。3 つ全部が緑になるまで DONE と報告しないこと。
- **すべてのテストは、捕まえる変異をコメントで名指しし、実際にその変異を製品
  コードへ入れて `pnpm vitest run` が落ちることを確認してから報告すること。**
  期待値を頭の中で導出しただけのテストは未完成とみなす。確認したら変異は必ず
  戻すこと。落ちなかった場合はテストのほうが間違っている。
- **読み取り層 (`src/core/read/`, `src/core/relay/`) は変更しない。** このスライス
  は既存の読み取り層を*使う*ものであり、直すものではない。読み取り層に手を
  入れたくなったら、それは繰延事項として `docs/design/read-layer-followups.md`
  へ書くこと（見つけた時点で書く。まとめて後で移す形にしない）。
- **valibot を使ってよいのは永続化フォーマットとユーザー入力の検証だけ。**
  `NostrEvent` / `RelayFilter` そのもののワイヤ検証（`EventStore.put` の
  `isNostrEvent` など）は [ADR-0020](../../adr/0020-no-nostr-library-noble-primitives-only.md)
  のとおり自前のまま。
- 作業ブランチは `v1`。`main` へは触らない。旧実装（`src/features/`,
  `src/routes/index.tsx` など v0 側）は無視してよい。
- コメントとドキュメントは日本語。既存ファイルの記述密度に合わせ、「なぜ」を
  書き「何を」は書かない。
- `data-testid` は既存のものを変えない（`deck-column` / `deck-column-title` /
  `deck-column-phase` / `deck-column-incomplete` / `connections` /
  `peak-connections` / `optimistic-insert-ms` / `viewer-pubkey` / `note`）。
  実鍵での検証手順もこの名前で書かれている。

---

### Task 1: データモデル — `ColumnSource`・valibot・`resolveSource`

**Files:**
- Modify: `src/core/deck/deck.ts`（`ColumnDef` / `Deck` / `loadDeck` / `defaultDeck` を書き換え）
- Modify: `src/core/deck/deck.test.ts`
- Create: `src/core/deck/resolve-source.ts`
- Create: `src/core/deck/resolve-source.test.ts`

**Interfaces:**
- Consumes: `NostrSource` / `RelayFilter`（`src/core/read/source.ts`, `src/core/relay/relay-connection.ts`）、`FALLBACK_RELAYS`（`src/core/read/default-relays.ts`）
- Produces:
  - `export type ColumnSource = { kind: "literal"; filters: RelayFilter[]; relays?: RelayUrl[] } | { kind: "followees"; kinds: number[] }`
  - `export type ColumnDef = { id: string; title: string; source: ColumnSource }`
  - `export type Deck = { version: 2; columns: ColumnDef[] }`
  - `export const defaultDeck = (viewerPubkey: string): Deck`（**`followees` 引数は消える**）
  - `export const resolveSource = (source: ColumnSource, context: { followees: readonly string[] }): NostrSource`
  - `deckStorageKey` / `saveDeck` / `loadDeck` はシグネチャ据え置き

**このタスクは純関数だけ。UI には一切触らない。**

- [ ] **Step 1: `resolve-source.ts` の失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";
import { resolveSource } from "./resolve-source";

describe("resolveSource", () => {
  it("literal は filters をそのまま渡す", () => {
    // 捕まえる変異: literal のときも followees 側の分岐を通す
    expect(
      resolveSource(
        { kind: "literal", filters: [{ kinds: [1], authors: ["abc"] }] },
        { followees: ["zzz"] },
      ),
    ).toEqual({ type: "nostr", filters: [{ kinds: [1], authors: ["abc"] }] });
  });

  it("literal の relays は指定があるときだけ載る", () => {
    // 捕まえる変異: relays を無条件に展開する (`relays: undefined` という
    // キーが生え、`NostrSource.relays !== undefined` を見ている
    // subscription-manager の明示リレー判定が、Outbox に任せたいカラムを
    // 「リレー 0 本の明示指定」として扱ってしまう)
    expect(
      resolveSource({ kind: "literal", filters: [{ kinds: [1] }] }, { followees: [] }),
    ).not.toHaveProperty("relays");

    expect(
      resolveSource(
        { kind: "literal", filters: [{ kinds: [1] }], relays: ["wss://a/"] },
        { followees: [] },
      ),
    ).toEqual({ type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://a/"] });
  });

  it("followees は context のフォローリストを展開する", () => {
    // 捕まえる変異: context を無視して authors を空にする
    // (ホーム列が永久に空になる)
    expect(
      resolveSource({ kind: "followees", kinds: [1] }, { followees: ["a", "b"] }),
    ).toEqual({ type: "nostr", filters: [{ kinds: [1], authors: ["a", "b"] }] });
  });

  it("フォロー 0 人でも authors を落とさない", () => {
    // 捕まえる変異: 空のときは authors を付けない
    // (`{ kinds: [1] }` は「誰の投稿でもよい」= firehose。フォロー 0 人の
    // 新規ユーザーのホーム列が、本物のリレーへの無制限購読になる)
    expect(
      resolveSource({ kind: "followees", kinds: [1] }, { followees: [] }),
    ).toEqual({ type: "nostr", filters: [{ kinds: [1], authors: [] }] });
  });

  it("context のフォローリストを共有しない", () => {
    // 捕まえる変異: `authors: context.followees` と参照をそのまま渡す
    // (呼び出し側が後で配列を破壊的に変更すると、既に作った NostrSource の
    // 中身が黙って変わる)
    const followees = ["a"];
    const resolved = resolveSource({ kind: "followees", kinds: [1] }, { followees });
    followees.push("b");
    expect(resolved.filters[0].authors).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/deck/resolve-source.test.ts`
Expected: FAIL —— モジュールが存在しない。

- [ ] **Step 3: `resolve-source.ts` を実装する**

```ts
import type { NostrSource } from "../read/source";
import type { ColumnSource } from "./deck";

export type ResolveContext = { followees: readonly string[] };

/**
 * デッキが保存している「意図」(`ColumnSource`) を、読み取り層が理解する
 * 「クエリ」(`NostrSource`) へ変える唯一の場所。
 *
 * 分けている理由は、フォローリストのような**変わる値をデッキに焼き込まない**
 * ため。焼き込むと、誰かをフォローしてもホーム列はデッキを作り直すまで
 * 永久に反映されない (2026-08-06 時点の実装がまさにそうだった)。
 */
export const resolveSource = (
  source: ColumnSource,
  context: ResolveContext,
): NostrSource => {
  if (source.kind === "followees") {
    // フォロー 0 人でも `authors` を落とさない —— `{ kinds: [1] }` は
    // NIP-01 では「誰の投稿でもよい」であり、本物のリレーへの無制限購読に
    // なる。空配列は「該当者なし」であって「無制限」ではない。
    return {
      type: "nostr",
      filters: [{ kinds: source.kinds, authors: [...context.followees] }],
    };
  }

  // `relays` は指定があるときだけ載せる。`relays: undefined` というキーを
  // 生やすと、明示リレーかどうかを `!== undefined` で見ている側から
  // 「リレー 0 本の明示指定」に見える。
  return source.relays
    ? { type: "nostr", filters: source.filters, relays: source.relays }
    : { type: "nostr", filters: source.filters };
};
```

- [ ] **Step 4: `deck.ts` を書き換える**

型を差し替え、`loadDeck` の手書き型ガード（`isDeck` / `isColumnDef` /
`isNostrSource` / `isRelayFilter` と補助の `isStringArray` / `isNumberArray`）を
すべて削除して valibot のスキーマに置き換える。

```ts
import * as v from "valibot";
import { FALLBACK_RELAYS } from "../read/default-relays";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

export type ColumnSource =
  | { kind: "literal"; filters: RelayFilter[]; relays?: RelayUrl[] }
  | { kind: "followees"; kinds: number[] };

export type ColumnDef = { id: string; title: string; source: ColumnSource };

/**
 * `version` は ADR-0013 の NIP-78 移行のために残す。バージョンを持たない
 * 形式は「今の形と違う」ことしか言えず「壊れている」と区別できない。
 *
 * 1 → 2 の移行コードは書かない。version 1 は `loadDeck` が「壊れている」
 * として弾き、呼び出し側が既定デッキへ落ちる —— v1 は開発中であり、
 * version 1 の値が存在するのは開発者の手元の localStorage だけである。
 */
export type Deck = { version: 2; columns: ColumnDef[] };

/**
 * NIP-01 のフィルタ。**これはワイヤ形式の検証ではなく、localStorage に
 * 保存されたデッキの検証である** —— ADR-0020 が自前実装を求めているのは
 * 前者だけで、永続化フォーマットの検証に valibot を使うことは同 ADR の
 * 「この ADR の射程」節で明示的に許されている。
 *
 * `looseObject` にしているのは `#<tag>` の任意キー (NIP-01) を落とさない
 * ため。既知フィールドの型は下の entries が、`#<tag>` の値が `string[]`
 * であることは 1 つ目の `check` が見る。
 */
const relayFilterSchema = v.pipe(
  v.looseObject({
    ids: v.optional(v.array(v.string())),
    authors: v.optional(v.array(v.string())),
    kinds: v.optional(v.array(v.number())),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
  }),
  v.check(
    (filter) =>
      Object.entries(filter)
        .filter(([key]) => key.startsWith("#"))
        .every(
          ([, value]) =>
            Array.isArray(value) &&
            value.every((item) => typeof item === "string"),
        ),
    "#<tag> の値は string[] でなければならない",
  ),
  // `ids`/`authors`/`kinds`/`#tag` のどれも無いフィルタは「誰の・何を
  // 問わない」= 無制限購読 (firehose) になる。`{}` だけでなく
  // `{ since: 123 }` のような形も同じ穴 —— `since`/`until`/`limit`/`search`
  // はクエリを絞り込みはするが、誰の・何のイベントかという範囲そのものは
  // 定めない。壊れたデッキから偶然この形が出てきて、本物のリレーへの
  // 無制限購読として通ってしまう実害のほうが大きいので、永続化された
  // デッキのフィルタとしては受け付けない。
  v.check(
    (filter) =>
      filter.ids !== undefined ||
      filter.authors !== undefined ||
      filter.kinds !== undefined ||
      Object.keys(filter).some((key) => key.startsWith("#")),
    "scoping フィールドを 1 つも持たないフィルタは無制限購読になる",
  ),
);

const columnSourceSchema = v.variant("kind", [
  v.object({
    kind: v.literal("literal"),
    filters: v.array(relayFilterSchema),
    relays: v.optional(v.array(v.string())),
  }),
  v.object({
    kind: v.literal("followees"),
    kinds: v.array(v.number()),
  }),
]);

const columnDefSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  title: v.pipe(v.string(), v.minLength(1)),
  source: columnSourceSchema,
});

const deckSchema = v.object({
  version: v.literal(2),
  columns: v.array(columnDefSchema),
});
```

`loadDeck` は次の形にする。**`raw === null` の早期リターンは残すこと** ——
`JSON.parse(null)` が例外を投げない（`"null"` へ強制変換されてパースが成功
する）という偶然の挙動に「未保存」の判定を任せない、という既存の意図が
`deck.test.ts` のコメントに記録されている。

```ts
export const loadDeck = (raw: string | null): Deck | undefined => {
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const result = v.safeParse(deckSchema, parsed);
  return result.success ? result.output : undefined;
};
```

**`result.output` が `Deck` に代入できることを `pnpm typecheck` で確かめること。**
通らなければ、スキーマ側を `Deck` の形に寄せて直す。`as Deck` でごまかさない
—— 型が合わないなら、それはスキーマが `Deck` と違うものを受け付けている
という本当の情報である。

`defaultDeck` は 3 本のまま、`followees` 引数を落とす。

```ts
/**
 * 初回起動時 (localStorage に何も無い、または壊れている) の既定デッキ。
 * ADR-0009 が「既定デッキは必須要件」としている —— モバイルから初めて
 * 訪れたユーザーはデスクトップでデッキを組んでいないため。
 *
 * 3 本の設計意図が違う:
 * - `home`: 派生ソース + Outbox ルーティング。**かつてここで followees を
 *   フィルタへ焼き込んでいたため、この引数が必要だった** —— 派生ソースに
 *   したことで引数ごと不要になった。
 * - `mine`: 単一著者。フォロー 0 人でも自分の投稿だけは必ず映る、
 *   ルーティングの成否を切り分けるための対照群。
 * - `global`: 明示リレー。Outbox をバイパスする経路が実際に機能することを
 *   見せる。
 */
export const defaultDeck = (viewerPubkey: string): Deck => ({
  version: 2,
  columns: [
    {
      id: "home",
      title: "ホーム",
      source: { kind: "followees", kinds: [1] },
    },
    {
      id: "mine",
      title: "自分の投稿",
      source: {
        kind: "literal",
        filters: [{ kinds: [1], authors: [viewerPubkey] }],
      },
    },
    {
      id: "global",
      title: "グローバル",
      source: {
        kind: "literal",
        filters: [{ kinds: [1] }],
        relays: [...FALLBACK_RELAYS],
      },
    },
  ],
});
```

- [ ] **Step 5: `deck.test.ts` を書き換える**

既存のテストは `version: 1` と `source: { type: "nostr", ... }` を前提にして
いるので、新しい形に直す。**既存のテストを消さないこと** —— どれも捕まえる
変異が明記されており、その変異は新しい実装でも同じように起こりうる。

とくに次の 2 つは意味が反転するので必ず直す。

- `it("version が違えば undefined")` —— 現在は `version: 2` を「違う」側の例に
  している。**`version: 1` を例にする**（今度はこちらが古い形）
- 有効なデッキのフィクスチャ —— `{ version: 2, columns: [{ ..., source: { kind: "literal", filters: [{ kinds: [1] }] } }] }`

足すテスト:

```ts
  it("version 1 の古い形は undefined", () => {
    // 捕まえる変異: version を見ない。
    // 旧 version 1 の source は `{ type: "nostr", filters }` という別の形
    // なので、これを Deck として読むと `source.kind` が undefined になり、
    // resolveSource がどちらの分岐にも入らない (= literal 側へ落ちて
    // `filters: undefined` を読み取り層へ渡す)。
    expect(
      loadDeck(
        JSON.stringify({
          version: 1,
          columns: [
            { id: "home", title: "ホーム", source: { type: "nostr", filters: [{ kinds: [1] }] } },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("kind の無い source は undefined", () => {
    // 捕まえる変異: variant の判別キーを見ずに union のどちらかへ通す
    expect(
      loadDeck(
        JSON.stringify({
          version: 2,
          columns: [{ id: "a", title: "a", source: { filters: [{ kinds: [1] }] } }],
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
          columns: [{ id: "a", title: "a", source: { kind: "followees", kinds: ["1"] } }],
        }),
      ),
    ).toBeUndefined();
  });
```

**`scoping フィールドを持たないフィルタを拒否する`テストは必ず残すこと。**
手書きの実装から valibot へ移す過程でいちばん落としやすく、落ちると壊れた
デッキから本物のリレーへの無制限購読が生まれる。

- [ ] **Step 6: 3 つのゲートを走らせる**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Expected: `src/routes/v1-preview.tsx` が古い `defaultDeck(pk, followees)` を
呼んでいるため **`pnpm typecheck` が落ちる**。これは想定どおり —— Task 3 が
直す。**このタスクでは `v1-preview.tsx` を触らない。**

代わりに、このタスクの完了は次の 3 つで判定する:

1. `pnpm exec vitest run src/core/deck/` が緑
2. `pnpm exec tsc -b` の失敗が `src/routes/v1-preview.tsx` の
   `defaultDeck` 呼び出しに関するものだけであること（**他のファイルの
   エラーが出たら、それはこのタスクの見落とし**）
3. `pnpm check` が緑

- [ ] **Step 7: 名指しした変異を実際に入れて、テストが落ちることを確認する**

`resolve-source.test.ts` の 5 件と、`deck.test.ts` に足した 3 件、および
`scoping フィールド` のテストについて、コメントが名指しする変異を製品コードへ
入れ、そのテストが落ちることを確認する。確認できたら戻す。結果は報告ファイルに
全件書く。

- [ ] **Step 8: コミット**

```bash
git add src/core/deck/
git commit -m "feat(deck): store intent instead of baked-in filters

フォローリストをフィルタへ焼き込むのをやめ、ColumnSource の派生指定として
保存する。永続化フォーマットの検証は valibot へ寄せた (ADR-0020 の射程外)。"
```

---

### Task 2: 小さな純関数 3 つ — `decodeNpub` / `columnAlerts` / 開発者モード

**Files:**
- Modify: `src/core/nostr/nip19.ts`
- Create: `src/core/nostr/nip19.test.ts`（存在しなければ新規、あれば追記）
- Create: `src/core/deck/column-alerts.ts`
- Create: `src/core/deck/column-alerts.test.ts`
- Create: `src/core/settings/developer-mode.ts`
- Create: `src/core/settings/developer-mode.test.ts`

**Interfaces:**
- Consumes: `ColumnDef`（Task 1）、`SectionStatus`（`src/core/read/source.ts`）、既存の `decodeBech32`
- Produces:
  - `export const decodeNpub = (input: string): string | undefined`
  - `export type ColumnAlert = { message: string; action: string }`
  - `export const columnAlerts = (column: ColumnDef, status: SectionStatus): ColumnAlert[]`
  - `export const DEVELOPER_MODE_STORAGE_KEY = "streets.v1.developerMode"`
  - `export const loadDeveloperMode = (raw: string | null): boolean`
  - `export const saveDeveloperMode = (enabled: boolean): string`

**3 つとも純関数。UI には触らない。**

- [ ] **Step 1: `decodeNpub` のテストを書く**

`decodeBech32`（既存）は不正な入力に対して**例外を投げる**。`decodeNpub` は
投げずに `undefined` を返す —— ユーザーがフォームに打ち込む値を受けるため。

```ts
import { describe, expect, it } from "vitest";
import { decodeNpub, encodeBech32 } from "./nip19";

const HEX = "a".repeat(64);

describe("decodeNpub", () => {
  it("64 桁 hex はそのまま返す", () => {
    // 捕まえる変異: hex 経路を消して npub だけ受け付ける
    expect(decodeNpub(HEX)).toBe(HEX);
  });

  it("npub を hex へ変換する", () => {
    // 捕まえる変異: prefix を確かめずに dataHex を返す
    expect(decodeNpub(encodeBech32("npub", HEX))).toBe(HEX);
  });

  it("npub 以外の bech32 は undefined", () => {
    // 捕まえる変異: prefix を見ない (nsec を貼られたら秘密鍵を著者フィルタ
    // として扱ってしまう —— ADR-0008 は秘密鍵をアプリに渡さないと決めて
    // いるので、受け付けた時点で方針違反になる)
    expect(decodeNpub(encodeBech32("nsec", HEX))).toBeUndefined();
  });

  it("壊れた入力は例外ではなく undefined", () => {
    // 捕まえる変異: try/catch を省く (decodeBech32 が投げ、フォームの
    // 送信ハンドラから例外が抜けて画面が壊れる)
    expect(decodeNpub("not-a-key")).toBeUndefined();
  });

  it("前後の空白を無視する", () => {
    // 捕まえる変異: trim しない (コピペに空白が混じるのは普通)
    expect(decodeNpub(` ${HEX} `)).toBe(HEX);
  });

  it("長さの違う hex は undefined", () => {
    // 捕まえる変異: 正規表現の長さ指定を外す
    expect(decodeNpub("a".repeat(63))).toBeUndefined();
  });
});
```

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/nostr/nip19.test.ts`
Expected: FAIL —— `decodeNpub` が存在しない。

- [ ] **Step 3: `decodeNpub` を実装する**

```ts
/** 小文字 hex のみ。NIP-01 の pubkey は 32 バイトの hex 表現である。 */
const HEX_PUBKEY = /^[0-9a-f]{64}$/;

/**
 * ユーザーが打ち込んだ文字列から pubkey (hex) を取り出す。npub と hex の
 * 両方を受ける。**不正な入力に対して例外を投げない** —— `decodeBech32` は
 * 投げるが、これはフォームの入力を受ける関数であり、呼び出し側が
 * try/catch を書く前提にすると書き忘れがそのまま画面の破壊になる。
 *
 * `npub` 以外の prefix は受け付けない。とくに `nsec` を弾くことには意味が
 * ある —— 貼り間違いを黙って著者フィルタとして扱うと、ADR-0008 の
 * 「秘密鍵をアプリに渡さない」を入力の側から破ることになる。
 */
export const decodeNpub = (input: string): string | undefined => {
  const trimmed = input.trim();
  if (HEX_PUBKEY.test(trimmed)) return trimmed;

  try {
    const { prefix, dataHex } = decodeBech32(trimmed);
    return prefix === "npub" && HEX_PUBKEY.test(dataHex) ? dataHex : undefined;
  } catch {
    return undefined;
  }
};
```

- [ ] **Step 4: `column-alerts.ts` のテストを書く**

```ts
import { describe, expect, it } from "vitest";
import type { SectionStatus } from "../read/source";
import type { ColumnDef } from "./deck";
import { columnAlerts } from "./column-alerts";

const status = (incomplete?: SectionStatus["incomplete"]): SectionStatus => ({
  phase: "settled",
  ...(incomplete ? { incomplete } : {}),
});

const explicit: ColumnDef = {
  id: "a",
  title: "a",
  source: { kind: "literal", filters: [{ kinds: [1] }], relays: ["wss://a/"] },
};

const routed: ColumnDef = {
  id: "b",
  title: "b",
  source: { kind: "followees", kinds: [1] },
};

describe("columnAlerts", () => {
  it("明示リレーが到達不能なら 1 件返す", () => {
    // 捕まえる変異: unreachableRelays を見ない
    expect(
      columnAlerts(explicit, status({ unreachableRelays: 1, unroutableAuthors: 0, uncoveredAuthors: 0 })),
    ).toHaveLength(1);
  });

  it("Outbox が選んだリレーが到達不能でも 0 件", () => {
    // 捕まえる変異: source の種類を見ずに unreachableRelays だけで判定する。
    // ADR-0026: ユーザーはどのリレーが選ばれたかを指定していないし変え
    // られない —— 行動できない以上これは診断値であって異常表示ではない。
    expect(
      columnAlerts(routed, status({ unreachableRelays: 3, unroutableAuthors: 0, uncoveredAuthors: 0 })),
    ).toEqual([]);
  });

  it("uncoveredAuthors だけでは 0 件", () => {
    // 捕まえる変異: incomplete が立っていれば何でも alert にする
    // (接続予算の超過はユーザーが行動できない)
    expect(
      columnAlerts(explicit, status({ unreachableRelays: 0, unroutableAuthors: 0, uncoveredAuthors: 12 })),
    ).toEqual([]);
  });

  it("incomplete が無ければ 0 件", () => {
    // 捕まえる変異: incomplete を undefined のまま数値として読む
    expect(columnAlerts(explicit, status())).toEqual([]);
  });

  it("literal でも relays を指定していなければ 0 件", () => {
    // 捕まえる変異: literal かどうかだけを見て relays の有無を見ない。
    // relays を持たない literal は Outbox に任せているので、上の
    // 「Outbox が選んだリレー」と同じく行動できない。
    const routedLiteral: ColumnDef = {
      id: "c",
      title: "c",
      source: { kind: "literal", filters: [{ kinds: [1], authors: ["abc"] }] },
    };
    expect(
      columnAlerts(routedLiteral, status({ unreachableRelays: 2, unroutableAuthors: 0, uncoveredAuthors: 0 })),
    ).toEqual([]);
  });
});
```

- [ ] **Step 5: `column-alerts.ts` を実装する**

```ts
import type { SectionStatus } from "../read/source";
import type { ColumnDef } from "./deck";

export type ColumnAlert = {
  /** ヘッダのアイコンを押したときに出る一行 */
  message: string;
  /** ユーザーが取れる行動 */
  action: string;
};

/**
 * カラムに起きたことのうち、**ユーザーが行動できるものだけ**を返す
 * (ADR-0026)。行動できない値 (`uncoveredAuthors` など) は診断値であり、
 * 開発者モードの背後で生の数値として出す —— ここには入れない。
 *
 * 判定をこの 1 関数に集めるのは、カラムの実装に散らすと「この条件は
 * 行動できるのか」という判断が UI のあちこちで独立に下されるようになる
 * ため。ADR-0026 はその判断そのものを決定として記録している。
 *
 * 今は 1 種類しか返さないが、返り値を配列にしてあるのは、A-2 以降で
 * レンダラの失敗や未知の kind が同じ入口へ集まるため。
 */
export const columnAlerts = (
  column: ColumnDef,
  status: SectionStatus,
): ColumnAlert[] => {
  const alerts: ColumnAlert[] = [];
  const source = column.source;
  const unreachable = status.incomplete?.unreachableRelays ?? 0;

  // ユーザーが自分で URL を指定したカラムだけが対象。Outbox が選んだ
  // リレーが落ちている場合、ユーザーには変える手立てが無い。
  if (source.kind === "literal" && source.relays !== undefined && unreachable > 0) {
    alerts.push({
      message: `指定したリレーに接続できません (${unreachable} 本)`,
      action: "カラムの設定でリレーの URL を確認してください",
    });
  }

  return alerts;
};
```

- [ ] **Step 6: 開発者モードのテストと実装**

```ts
// developer-mode.test.ts
import { describe, expect, it } from "vitest";
import { loadDeveloperMode, saveDeveloperMode } from "./developer-mode";

describe("開発者モードの永続化", () => {
  it("保存したものを読み戻せる", () => {
    // 捕まえる変異: save が真偽値を落とす
    expect(loadDeveloperMode(saveDeveloperMode(true))).toBe(true);
    expect(loadDeveloperMode(saveDeveloperMode(false))).toBe(false);
  });

  it("未設定 (null) は false", () => {
    // 捕まえる変異: 既定を true にする。ADR-0026 は「既定は無効」と決めて
    // いる —— 既定で出ていたら、そもそもこの ADR が要らない。
    expect(loadDeveloperMode(null)).toBe(false);
  });

  it("壊れた値は false", () => {
    // 捕まえる変異: 値の中身を見ず「キーがあれば true」にする
    expect(loadDeveloperMode("yes")).toBe(false);
    expect(loadDeveloperMode("{}")).toBe(false);
  });
});
```

```ts
// developer-mode.ts
/**
 * 開発者モードは**端末ごと**の設定であり、アカウントごとではない
 * (ADR-0026) —— どの端末で開発者として見ているかはアカウントの設定では
 * ないので、`deckStorageKey` のような pubkey の継ぎ足しはしない。
 */
export const DEVELOPER_MODE_STORAGE_KEY = "streets.v1.developerMode";

/** 既定は無効 (ADR-0026)。`"true"` 以外はすべて無効として扱う。 */
export const loadDeveloperMode = (raw: string | null): boolean => raw === "true";

export const saveDeveloperMode = (enabled: boolean): string => String(enabled);
```

- [ ] **Step 7: ゲートと変異検証**

Run: `pnpm exec vitest run src/core/nostr src/core/deck src/core/settings`
Expected: PASS

`pnpm typecheck` は Task 1 と同じ理由（`v1-preview.tsx`）で落ちたままでよい。
それ以外のエラーが出ていないことを確認すること。`pnpm check` は緑であること。

名指しした変異（14 件）を全部入れて確認し、報告ファイルに書く。

- [ ] **Step 8: コミット**

```bash
git add src/core/nostr src/core/deck src/core/settings
git commit -m "feat(deck): add decodeNpub, columnAlerts and the developer-mode flag"
```

---

### Task 3: `/v1-preview` を `/v1` へ移す（挙動を変えない）

**Files:**
- Create: `src/routes/v1.tsx`（`v1-preview.tsx` から）
- Create: `src/routes/v1/DeckColumn.tsx`（`v1-preview.tsx` から切り出し）
- Move: `src/routes/v1-preview/{Note,Profile}.tsx` → `src/routes/v1/`
- Move: `src/routes/v1-preview/{parse-relays.ts,parse-relays.test.ts,verify-optimistic-insert.ts,verify-optimistic-insert.test.ts}` → `src/routes/v1/`
- Delete: `src/routes/v1-preview.tsx`, `src/routes/v1-preview/`
- Rename: `e2e/v1-preview.spec.ts` → `e2e/v1.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `ColumnSource` / `resolveSource` / `defaultDeck(viewerPubkey)`
- Produces: `DeckColumn` コンポーネント。props は現在の `v1-preview.tsx` のものに
  `followees: () => readonly string[]` を足した形

**このタスクの成功条件は「見た目と挙動が今と同じであること」。** 新機能は
一切足さない。カラム操作は Task 4、異常表示と開発者モードは Task 5。

- [ ] **Step 1: ファイルを移す**

`git mv` を使うこと（履歴を切らない）。`v1-preview.tsx` → `v1.tsx` も同様。
import のパスを直す。`DeckColumn` は `v1.tsx` の中に定義されているので、
`src/routes/v1/DeckColumn.tsx` へ切り出して import する。

- [ ] **Step 2: 新しいデータモデルに合わせる**

3 箇所だけ変わる。

1. `defaultDeck(pk, warmUp()?.followees ?? [])` → `defaultDeck(pk)`
2. `DeckColumn` の `source` memo が `resolveSource` を通る:

```ts
const source = createMemo<NostrSource>(() => {
  const resolved = resolveSource(props.column.source, {
    followees: props.followees(),
  });
  // `?relays=` の e2e 上書きは**解決した後**に当てる —— 上書きが見るのは
  // `NostrSource.relays` であって `ColumnSource` ではない。順序を逆に
  // すると、明示リレーを持つカラムがローカルリレーへ差し替わらず、
  // e2e が外部ネットワークへ繋ぎに行く。
  return RELAYS_OVERRIDE && resolved.relays
    ? { ...resolved, relays: RELAYS_OVERRIDE }
    : resolved;
});
```

3. `v1.tsx` が `followees` を `DeckColumn` へ渡す:

```tsx
<DeckColumn
  column={column}
  followees={() => warmUp()?.followees ?? []}
  ...
/>
```

**デッキの読み込み順は変えないこと。** 現在の `createEffect` は「保存済みが
あれば `warmUp` を待たずに使う」形になっている。これがリロードのたびに同じ
カラムが即座に出る理由である。派生ソースにしたことで、`defaultDeck` を
組むときに `warmUp` を待つ必要も無くなる —— **`if (warmUp.loading) return;`
は削除できる**。削除すること。理由をコメントに残すこと。

- [ ] **Step 3: ルートの登録を直す**

`src/router.tsx` の末尾（`satisfies RouteDefinition[]` の直前）にある
`/v1-preview` の項を書き換える。**トップレベルの経路のまま**にすること ——
既存のコメントが理由を記録している（`Root` は旧実装の `<Columns />` を常時
描画するので、その子にするとカラムが押し潰されて画面幅が足りなくなる）。
そのコメントは経路名だけ直して残す。

```ts
  {
    path: "/v1",
    component: lazy(() => import("./routes/v1")),
  },
```

- [ ] **Step 4: e2e を直す**

`e2e/v1-preview.spec.ts` → `e2e/v1.spec.ts`。`page.goto` の `/v1-preview?relays=`
を `/v1?relays=` に。**それ以外のアサーションは変えない** —— このタスクは
挙動を変えないので、変えたくなったら何かを壊している。

`grep -rn "v1-preview" .` で残りを洗い出し、すべて潰すこと（docs 内の記述は
除く —— そちらは Task 6）。

- [ ] **Step 5: 3 つのゲートを走らせる**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Expected: 全部 PASS。**Task 1/2 で残っていた `tsc -b` のエラーがここで消える。**

- [ ] **Step 6: e2e を走らせる**

Run: `pnpm exec playwright test e2e/v1.spec.ts`
Expected: PASS。落ちたら、移設で何かを壊している。

（docker のリレーが要る。`compose.yaml` と既存の e2e の走らせ方に従うこと。
起動できない環境なら、その旨を報告に書き、ユニットテストと型検査だけで
判定すること —— **走らせずに「通るはず」と書かないこと。**）

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "refactor(v1): move the preview route to /v1 with no behaviour change"
```

---

### Task 4: カラムの追加・削除・並べ替え・タイトル編集

**Files:**
- Modify: `src/routes/v1.tsx`
- Modify: `src/routes/v1/DeckColumn.tsx`
- Create: `src/routes/v1/AddColumnForm.tsx`
- Create: `src/routes/v1/column-presets.ts`
- Create: `src/routes/v1/column-presets.test.ts`
- Modify: `e2e/v1.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `ColumnDef` / `ColumnSource` / `saveDeck` / `deckStorageKey`、Task 2 の `decodeNpub`
- Produces: `column-presets.ts` の
  `export type ColumnPresetKind = "home" | "user" | "hashtag" | "global"` と
  `export const buildColumn = (kind: ColumnPresetKind, input: string) => ColumnDef | undefined`

- [ ] **Step 1: `column-presets.ts` のテストを書く**

`buildColumn` は純関数。**UI と分けるのは、4 種別が正しい `ColumnSource` を
作るかどうかをブラウザ無しで固定するため。**

```ts
import { describe, expect, it } from "vitest";
import { FALLBACK_RELAYS } from "../../core/read/default-relays";
import { buildColumn } from "./column-presets";

const HEX = "a".repeat(64);

describe("buildColumn", () => {
  it("home は派生ソースを作る", () => {
    // 捕まえる変異: home もフィルタを焼き込む (Task 1 が消した欠陥の再導入)
    expect(buildColumn("home", "")?.source).toEqual({
      kind: "followees",
      kinds: [1],
    });
  });

  it("user は hex 著者フィルタを作る", () => {
    // 捕まえる変異: 入力をデコードせずそのまま authors へ入れる
    expect(buildColumn("user", HEX)?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1], authors: [HEX] }],
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

  it("id は呼び出しごとに違う", () => {
    // 捕まえる変異: id を種別から作る (同じ種別のカラムを 2 本足すと
    // id が衝突し、Solid の <For> のキーと削除の対象指定が壊れる)
    expect(buildColumn("home", "")?.id).not.toBe(buildColumn("home", "")?.id);
  });
});
```

**タイトルの既定値もテストすること**（`home` → `"ホーム"`、`user` →
`` `@${npub の先頭 8 文字}` ``、`hashtag` → `` `#${tag}` ``、`global` →
`"グローバル"`）。user のタイトルは hex ではなく npub の先頭を使う ——
hex の先頭 8 文字は人が見て区別できない。

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/routes/v1/column-presets.test.ts`
Expected: FAIL —— モジュールが存在しない。

- [ ] **Step 3: `column-presets.ts` を実装する**

```ts
import type { ColumnDef } from "../../core/deck/deck";
import { decodeNpub, encodeBech32 } from "../../core/nostr/nip19";
import { FALLBACK_RELAYS } from "../../core/read/default-relays";

export type ColumnPresetKind = "home" | "user" | "hashtag" | "global";

/**
 * 追加フォームの入力から `ColumnDef` を作る。**UI から分けてあるのは、
 * 4 種別が正しい `ColumnSource` を作るかどうかをブラウザ無しで固定する
 * ため。** 種別ごとに読み取り層の別々の経路を通す (仕様 4 節) ので、
 * ここを間違えると「カラムは出来たが何も来ない」という、原因の遠い
 * 壊れ方になる。
 *
 * 入力が不正なら `undefined`。呼び出し側はフォームを閉じずにエラーを
 * 出す —— 黙って「誰にもマッチしないカラム」を作らない。
 */
export const buildColumn = (
  kind: ColumnPresetKind,
  input: string,
): ColumnDef | undefined => {
  // id は種別ではなく呼び出しごとに振る。種別から作ると、同じ種別を
  // 2 本足した瞬間に id が衝突し、<For> のキーと削除の対象指定が壊れる。
  const id = crypto.randomUUID();

  switch (kind) {
    case "home":
      return {
        id,
        title: "ホーム",
        source: { kind: "followees", kinds: [1] },
      };

    case "user": {
      const pubkey = decodeNpub(input);
      if (!pubkey) return undefined;
      return {
        id,
        // hex の先頭 8 文字は人が見て区別できない。npub のほうを見せる。
        title: `@${encodeBech32("npub", pubkey).slice(0, 12)}`,
        source: {
          kind: "literal",
          filters: [{ kinds: [1], authors: [pubkey] }],
        },
      };
    }

    case "hashtag": {
      // NIP-12 のタグ値に `#` は含まれない。ユーザーは `#nostr` と打つ
      // ほうが自然なので、ここで落とす。
      const tag = input.trim().replace(/^#/, "");
      if (tag.length === 0) return undefined;
      return {
        id,
        title: `#${tag}`,
        source: { kind: "literal", filters: [{ kinds: [1], "#t": [tag] }] },
      };
    }

    case "global":
      return {
        id,
        title: "グローバル",
        source: {
          kind: "literal",
          filters: [{ kinds: [1] }],
          relays: [...FALLBACK_RELAYS],
        },
      };
  }
};
```

**`title` の期待値をテストに書くときは、実際に走らせた値を使うこと。**
`encodeBech32("npub", "a".repeat(64)).slice(0, 12)` が何になるかは
計算では出せない。

- [ ] **Step 4: デッキ操作を `v1.tsx` に足す**

```ts
// デッキの変更は必ずこの 1 関数を通す —— 保存を忘れた経路が 1 つでも
// あると、その操作だけリロードで消える (ユーザーには「たまに保存され
// ない」としか見えない、いちばん報告しにくい壊れ方になる)。
const updateDeck = (next: Deck) => {
  const pk = pubkey();
  if (!pk) return;
  setDeck(next);
  window.localStorage.setItem(deckStorageKey(pk), saveDeck(next));
};

const addColumn = (column: ColumnDef) => {
  const current = deck();
  if (!current) return;
  updateDeck({ ...current, columns: [...current.columns, column] });
};

const removeColumn = (id: string) => {
  const current = deck();
  if (!current) return;
  updateDeck({
    ...current,
    columns: current.columns.filter((column) => column.id !== id),
  });
};

const moveColumn = (id: string, direction: -1 | 1) => {
  const current = deck();
  if (!current) return;
  const from = current.columns.findIndex((column) => column.id === id);
  const to = from + direction;
  // 端では何もしない。ここで clamp すると「左端のカラムの ← を押したら
  // 自分自身と入れ替わる」= 保存だけ走って何も変わらない、という無駄な
  // 書き込みが起きる。
  if (from < 0 || to < 0 || to >= current.columns.length) return;
  const columns = [...current.columns];
  const [moved] = columns.splice(from, 1);
  columns.splice(to, 0, moved);
  updateDeck({ ...current, columns });
};

const renameColumn = (id: string, title: string) => {
  const current = deck();
  const trimmed = title.trim();
  // 空のタイトルを保存してはいけない。`loadDeck` の `minLength(1)` が
  // そのカラムを弾き、**カラム 1 本ではなくデッキ全体**が「壊れている」
  // 判定になって次のリロードで既定デッキに戻る —— 1 本のタイトルを消し
  // ただけで全部消えるという壊れ方になる。
  if (!current || trimmed.length === 0) return;
  updateDeck({
    ...current,
    columns: current.columns.map((column) =>
      column.id === id ? { ...column, title: trimmed } : column,
    ),
  });
};
```

**この 4 つにユニットテストは要らない**（Solid のシグナルと localStorage に
絡むので、テストするなら e2e のほうが素直）。Step 6 の e2e が
「操作 → リロード → 保たれている」で 3 つを覆う。`renameColumn` の空文字
拒否だけは e2e でも覆われないので、**`moveColumn` を含めて純関数として
切り出したくなったら切り出してよい** —— その場合はユニットテストを書くこと。
判断は実装者に委ねる。

- [ ] **Step 5: `AddColumnForm.tsx` と `DeckColumn` のヘッダ操作**

- ヘッダの「+」ボタンでフォームを開く。種別を選び、`user` / `hashtag` は
  入力欄を出す。確定すると `buildColumn` を呼び、`undefined` なら入力欄に
  エラーを出してフォームを閉じない
- `DeckColumn` のヘッダに「←」「→」「×」を置く。タイトルはクリックで
  インライン編集
- デッキが 0 カラムのときは「+ でカラムを追加してください」を出す

`data-testid` を足す: `add-column`（+ ボタン）、`add-column-form`、
`add-column-kind-<kind>`、`add-column-input`、`add-column-submit`、
`add-column-error`、`column-move-left`、`column-move-right`、`column-remove`、
`empty-deck`。

- [ ] **Step 6: e2e を足す**

`e2e/v1.spec.ts` に 3 本。既存のテストのログイン手順（`page.exposeFunction`
による署名）とローカルリレーの使い方をそのまま踏襲すること。

1. カラムを追加 → `deck-column` が 4 本 → リロード → まだ 4 本
2. カラムを削除 → 3 本 → リロード → まだ 3 本
3. 先頭のカラムを右へ → 順序が入れ替わる → リロード → 入れ替わったまま

**リロード後の確認を必ず入れること。** 画面上で並べ替わることと、その順序が
保存されていることは別の主張であり、後者だけが `updateDeck` を通ったことの
証拠になる。

- [ ] **Step 7: ゲートと変異検証**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Run: `pnpm exec playwright test e2e/v1.spec.ts`

`column-presets.test.ts` の名指しした変異を全件確認し、報告ファイルへ書く。

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat(v1): add, remove, reorder and rename deck columns"
```

---

### Task 5: 異常表示と開発者モード

**Files:**
- Create: `src/routes/v1/ColumnAlertBadge.tsx`
- Create: `src/routes/v1/DiagnosticsPanel.tsx`
- Modify: `src/routes/v1.tsx`
- Modify: `src/routes/v1/DeckColumn.tsx`
- Modify: `e2e/v1.spec.ts`

**Interfaces:**
- Consumes: Task 2 の `columnAlerts` / `ColumnAlert` / `loadDeveloperMode` /
  `saveDeveloperMode` / `DEVELOPER_MODE_STORAGE_KEY`

- [ ] **Step 1: 開発者モードのシグナルを `v1.tsx` に足す**

```ts
const [developerMode, setDeveloperMode] = createSignal(
  loadDeveloperMode(window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY)),
);
const toggleDeveloperMode = () => {
  const next = !developerMode();
  setDeveloperMode(next);
  window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, saveDeveloperMode(next));
};
```

ヘッダの隅にトグルを置く（`data-testid="developer-mode-toggle"`）。**設定画面は
作らない**（ADR-0026 の Consequences どおり、設定画面はフェーズ C）。

- [ ] **Step 2: 診断値を `DiagnosticsPanel` へ移す**

現在ヘッダに直接置かれている `connections` / `peak-connections` /
`optimistic-insert-ms` と、`DeckColumn` の `deck-column-phase` /
`deck-column-incomplete` を、`developerMode()` が真のときだけ描画する。

**`data-testid` は変えない。** 移すのは描画位置と条件だけ。

`unrequestedEventsByRelay`（`manager.unrequestedEventsByRelay`）も
`DiagnosticsPanel` に出す。**これは今どこにも出ていない** —— リレーが要求して
いないイベントを送ってきた回数であり、開発者モードができたことで初めて
置き場所ができた。`data-testid="unrequested-relays"`。

- [ ] **Step 3: `ColumnAlertBadge` を足す**

`columnAlerts(props.column, section.status())` が 1 件以上返すときだけ、
カラムヘッダにアイコン（`data-testid="column-alert"`）を出す。押すと
`message` と `action` を並べる（`data-testid="column-alert-detail"`）。

**開発者モードとは無関係に常時出す**（ADR-0026: 行動できる異常は常に見せる）。

- [ ] **Step 4: e2e を足す**

1. 開発者モードが無効（既定）のとき、`connections` / `deck-column-phase` /
   `deck-column-incomplete` が **DOM に存在しない**
2. トグルを押すと 3 つとも現れる
3. リロードしても有効なまま

`page.addInitScript` で `localStorage` に `streets.v1.developerMode` を書いて
最初から有効な状態で開くヘルパーを作る。**既存の
`connection-budget.spec.ts` / `section-cap.spec.ts` は触らないこと** ——
どちらも `/debug/v1-section` を見ており、この変更の影響を受けない（仕様 8 節）。

異常表示（`column-alert`）の e2e は書かない。**到達不能な明示リレーを
ローカル docker 環境で安定して作る手段が無く**、無理に作ると e2e が不安定に
なる。`columnAlerts` の判定は Task 2 のユニットテストが固定しており、
描画の条件分岐 1 つのために不安定な e2e を足す価値は無い。**この判断を
報告に書くこと。**

- [ ] **Step 5: ゲート**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Run: `pnpm exec playwright test e2e/v1.spec.ts`

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat(v1): show only actionable alerts; gate diagnostics on developer mode"
```

---

### Task 6: 仕様 12 節への回答と繰延事項

**Files:**
- Modify: `docs/design/read-layer-followups.md`
- Modify: `docs/adr/0003-open-column-abstraction.md`
- Modify: `docs/adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md`

**製品コードは変更しない。**

- [ ] **Step 1: 仕様 12 節の 6 問に答える**

[仕様](../specs/2026-08-07-deck-and-columns-design.md) 12 節の 6 問について、
**実装から分かった範囲だけ**を `docs/design/read-layer-followups.md` に新しい節
（`## A-1 デッキとカラム（2026-08-07）— 仕様 12 節の答え`）として書く。

- **問 3（`warmUpRouting` の 3 箇所目）・問 4（2 つ目の派生）・問 5（2 本目の
  セクション）・問 6（ハッシュタグの経路）は、実装した内容から答えられる。**
  実際に何が起きたかを書くこと
- **問 1（5〜10 カラムでの接続予算）と、問 2（画面外カラムの API）は、実鍵で
  複数カラムを開いた人間にしか答えられない。** 「未取得」と明記し、何を
  読めば答えが出るか（開発者モードの `peakConnections`）を書く

**推測を書かないこと。** 分からなかったものは「分からなかった」と書く。
縦断スライスの記録がこの規律で書かれているので、形を揃えること。

- [ ] **Step 2: ADR-0003 に実装の段階を追記する**

ADR-0003 の「実装の段階」節に A-1 の項を足す。書くこと:

- **レンダラ登録機構はまだ作っていない**（A-2）。kind:1 専用の `Note` を直に
  描画する形のまま
- **「1 カラム = 1 セクション」を決定として記録した**（仕様 5 節）。この ADR が
  「別途定義する必要がある」としていた 4 ケースのうち、「1 本のリストに
  混ぜる」は `NostrSource.filters` が、「構造を持つ」は `Order` の
  `thread-tree` が既に表現できる。**「領域を積む」（ユーザー詳細）だけが
  どの機構でも表現できず、ひっくり返す条件はそれを作るとき**
- 実際に作った 4 種別と、それぞれが通す読み取り層の経路

- [ ] **Step 3: ADR-0026 の Consequences を実態に合わせる**

「`/v1-preview` のヘッダに並んでいる読み出し」という記述はルート名が変わった
ので直す。「行動できるかどうかの判定は今後増える」という項に、**実際に
実装した判定が 1 件だけだった**ことを書く。

- [ ] **Step 4: 繰延事項を書く**

実装中に見つけて直さなかったものを `docs/design/read-layer-followups.md` の
「小さいもの」へ足す。**Task 1〜5 の報告ファイルを読んで拾い漏らさないこと。**

このタスク開始時点で分かっているものを 2 件、必ず書く:

- `package.json` の `valibot` が `1.0.0-rc.0` に固定されている。安定版への
  更新は A-1 の範囲外
- Task 5 が `column-alert` の e2e を書かなかった理由（到達不能な明示リレーを
  ローカル docker で安定して作れない）

- [ ] **Step 5: ゲート**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Expected: 全部 PASS（docs のみの変更なので当然だが、確認はすること）。

- [ ] **Step 6: コミット**

```bash
git add docs/
git commit -m "docs: record what A-1 answered, and what only a real-key run can"
```

---

## 検証

自動テストで閉じられる範囲は各タスクで閉じている。**ただしこのスライスの
主目的（5〜10 カラムを実地で回して接続予算を測る）は自動テストでは達成
できない。** 完了時に人間へ次を依頼すること。

1. `pnpm dev` → `/v1` でログイン
2. **カラムを 5〜10 本まで増やす。** 種別を混ぜること（ホーム 1 本、ユーザー
   数本、ハッシュタグ 数本、グローバル 1 本）
3. 開発者モードを有効にし、**`peakConnections` を読む。** 予算 30 に対して
   どこまで上がったか。3 カラムのときは 10 だった
4. **画面外のカラムがある状態で数分置き、体感の重さを見る。** 仕様 12 節
   問 2（画面外カラムの休止・優先度・破棄が要るか）の材料はこれしかない
5. リロードしてデッキが復元されること
6. `uncoveredAuthors`（開発者モード）が増えているか。増えていれば予算が
   効いている証拠であり、**増えるのが正しい**
