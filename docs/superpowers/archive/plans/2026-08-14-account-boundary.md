# アカウント境界と機密情報の分類 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** キャッシュ方針に「誰が見てよいか」の軸を足し、名乗らない kind は永続化されないようにする（fail-closed）。

**Architecture:** `CachePolicy` に `scope: "public" | "account" | "session"` を必須フィールドとして足し、既定を `"session"` にする。`shouldPersist` は「`scope` が `"public"` **かつ** `retention` が `none` でない」ときだけ真を返す —— 保持方針（どれだけ持つか）と可視範囲（誰に見せてよいか）を独立した 2 軸として扱う。決定は ADR に固定する。

**Tech Stack:** TypeScript / Vitest。

**仕様:** [docs/superpowers/archive/specs/2026-08-14-account-boundary-design.md](../specs/2026-08-14-account-boundary-design.md)。**タスクの記述と仕様が食い違ったら仕様が正。**

## Global Constraints

- **完了の判定は `pnpm vitest run` / `pnpm typecheck` / `pnpm check` の 3 つすべて**。
  `pnpm check` は型検査を含まない。**各コマンドの終了ステータスをそれ自体で見ること** ——
  パイプへ通した先のステータスを読むと、落ちているのに通ったように見える。
- **`createReadLayer` の引数を変えない。** アカウント切替の経路が 1 つも無いので、
  アカウントを渡しても誰も使わない引数が増えるだけになる（仕様 3 節・5 節）。
- **`"account"` の置き場は作らない。** 該当する kind が 1 つも無い（仕様 2.2 節）。
- すべてのテストは捕まえる変異を名指しし、**実際にその変異を入れて落ちることを確認**する。
  **その変異が名指ししたテストを落とすこと**まで確かめる。**変異の前に製品コードを
  コピーして保存し、`git checkout` で戻さない。**
- **コメントには非自明な WHY だけ**（`CONTEXT.md` の「書き方」節）。WHAT・変更履歴・
  タスク ID は書かない。**ADR は決定の記録なので経緯を書いてよい例外。**

---

### Task 1: `scope` を必須の軸として足す

**Files:**
- Modify: `src/core/read/cache-policy.ts`
- Modify: `src/core/read/cache-policy.test.ts`

**Interfaces:**
- Produces:
  - `type CacheScope = "public" | "account" | "session"`
  - `CachePolicy` に `scope: CacheScope`（**必須**）
  - `shouldPersist(kind: number): boolean` —— シグネチャは変えない

**既存の呼び出し側は変わらない。** `shouldPersist` の意味だけが厳しくなる。

- [x] **Step 1: 失敗するテストを書く**

`src/core/read/cache-policy.test.ts` の末尾へ足す。`policyFor` / `shouldPersist` は
既に import されているはずだが、無ければ足すこと。

```ts
describe("scope (誰が見てよいか)", () => {
  it("分類の無い kind は永続化されない", () => {
    // 捕まえる変異: DEFAULT_POLICY の scope を "public" にする。
    // 既定が fail-closed でないと、ミュートや復号結果を足す人が分類を
    // 名乗り忘れた瞬間に共有 DB へ書かれ、別アカウントへ漏れる。
    // **これは後から引き剥がせない** (仕様 2.1 節)。
    expect(policyFor(9999).scope).toBe("session");
    expect(shouldPersist(9999)).toBe(false);
  });

  it("kind:0 と kind:10002 は public で永続化される", () => {
    // 捕まえる変異: scope を見ずに retention だけで決める (この 2 つは
    // 通ってしまうので、これだけでは変異を捕まえられない —— 下の
    // kind:3 と「account は書かない」の 2 件が対になって初めて効く)
    expect(policyFor(0).scope).toBe("public");
    expect(shouldPersist(0)).toBe(true);
    expect(policyFor(10002).scope).toBe("public");
    expect(shouldPersist(10002)).toBe(true);
  });

  it("kind:3 は public だが retention: none なので永続化されない", () => {
    // 捕まえる変異: 2 軸を 1 つのフラグに潰す。イベント自体は公開なので
    // scope は "public" が正しく、永続化しない理由は別軸 (古いフォロー
    // リストで購読すると外した著者を画面から消せない)。潰すと「共有して
    // よいが保持はしたくない」が表現できなくなる (仕様 6 節)。
    expect(policyFor(3).scope).toBe("public");
    expect(shouldPersist(3)).toBe(false);
  });

  it("public でない kind は retention があっても永続化されない", () => {
    // 捕まえる変異: shouldPersist が scope を見ない。これがこのスライスの
    // 中心 —— account/session の kind が共有 DB へ書かれるのを防ぐ。
    for (const scope of ["account", "session"] as const) {
      const policy: CachePolicy = {
        staleMs: 0,
        serveWhileRevalidating: true,
        retention: { type: "latest-per-author" },
        scope,
      };
      expect(persistableScope(policy)).toBe(false);
    }
  });

  it("登録済みの kind はすべて scope を名乗っている", () => {
    // 捕まえる変異: 表のどれか 1 つから scope を落とす。型で必須にして
    // いるので普通は通らないが、`as` で抜ける余地を塞ぐ。
    for (const kind of registeredKinds()) {
      expect(policyFor(kind).scope).toBeDefined();
    }
  });
});
```

- [x] **Step 2: 走らせて落ちることを確認**

Run: `pnpm vitest run src/core/read/cache-policy.test.ts`
Expected: FAIL（`scope` / `persistableScope` / `registeredKinds` が存在しない）

- [x] **Step 3: 実装**

`src/core/read/cache-policy.ts` を次のように変える。

型と既定値:

```ts
/**
 * このイベントを**誰が見てよいか**。`Retention`（どれだけ持つか）とは
 * 独立した軸であり、混ぜて 1 つのフラグにすると「共有してよいが保持は
 * したくない」（`kind:3` がそれ）を表現できなくなる。
 *
 * - `public` —— 誰が見ても同じ署名済みイベント。共有 DB へ書いてよい
 * - `account` —— その閲覧者にしか意味がない。専用の置き場が要る
 * - `session` —— ディスクへ書かない（NIP-44 の復号結果など）
 */
export type CacheScope = "public" | "account" | "session";

export type CachePolicy = {
  /** 不変な kind では意味を持たない（`Number.POSITIVE_INFINITY` を置く）。 */
  staleMs: number;
  serveWhileRevalidating: boolean;
  retention: Retention;
  scope: CacheScope;
};
```

既定値（**`scope` を `"session"` にするのがこのスライスの核心**）:

```ts
/**
 * 不変な kind（`kind:1`/`6`/`7` および未知の kind）に当てる既定値。
 *
 * **`scope` は `"session"`。** 分類を名乗らない kind は共有もされず永続化も
 * されない。永続化したい人は「これは誰が見ても同じイベントだ」と
 * `"public"` を明示的に名乗ることになり、名乗り忘れは「書かれない」に
 * 倒れる。逆にしてはいけない —— 共有 DB へ一度書かれたものを後から
 * アカウント別に引き剥がすことはできない。
 */
const DEFAULT_POLICY: CachePolicy = {
  staleMs: Number.POSITIVE_INFINITY,
  serveWhileRevalidating: true,
  retention: { type: "none" },
  scope: "session",
};
```

`POLICIES` の 3 エントリへ `scope` を足す。kind:3 は `scope: "public"`、
kind:10002 と kind:0 も `scope: "public"`。**kind:3 の `retention: { type: "none" }`
は変えない。**

kind:3 のエントリには理由を添える:

```ts
      // イベント自体は公開なので scope は "public"。永続化しないのは
      // retention という別軸の判断であって、アカウント境界の問題ではない。
      scope: "public",
```

判定と、テストが使う 2 つの補助を公開する:

```ts
/** 方針そのものから永続化可否を決める。kind を経由しない形も要る
 *  ——「この scope なら書かない」を kind 表に登録せずに確かめられる。 */
export const persistableScope = (policy: CachePolicy): boolean =>
  policy.scope === "public" && policy.retention.type !== "none";

/** 方針表に載っている kind。網羅を確かめるテストのために公開する。 */
export const registeredKinds = (): number[] => [...POLICIES.keys()];

/**
 * この kind を永続層へ書いてよいか。**2 つの軸をどちらも満たすときだけ真。**
 * `retention: none` は「保持しない」ではなく「そもそも書かない」を意味し、
 * `scope` が `public` でないものは置き場がそもそも違う。
 */
export const shouldPersist = (kind: number): boolean =>
  persistableScope(policyFor(kind));
```

**既存のテストも直す必要がある。** `cache-policy.test.ts` は今
`import { type CachePolicy, isStale, policyFor } from "./cache-policy";` で、
`persistableScope` / `registeredKinds` / `shouldPersist` が足りない。加えて
**`CachePolicy` のリテラルを 5 箇所書いており、必須フィールドを足すと
すべて型エラーになる**:

| 箇所 | 直し方 |
|---|---|
| `describe("policyFor")` の `it.each` の 3 件（kind:3 / 10002 / 0） | 期待値に `scope: "public"` を足す |
| 同 `describe` の「未知/不変な kind は既定値」の `toEqual({...})` | 期待値に `scope: "session"` を足す |
| `describe("isStale")` の `finitePolicy` など、`isStale` を試すために組む方針 | `scope` を足す。`isStale` は `scope` を見ないので値は何でも成立するが、**`"session"` を置くこと** —— そこに `"public"` を置くと、読んだ人が「isStale は public のときだけ効く」と誤読しうる |

`isStale` のテストで組む方針が他にもあれば同様に足す。**`isStale` の期待値そのものは
変えない** —— `scope` は `isStale` の判定に一切関与しない。

- [x] **Step 4: 走らせて通ることを確認 → 変異検証 → コミット**

変異は 4 件（各テストのコメントが名指ししたもの。「kind:0 と kind:10002 は
public」だけは単独では変異を捕まえられないと自分で書いてあるので、
**その 1 件については「捕まえられないこと」を確認して報告に書く**）。
**変異の前に `cache-policy.ts` をコピーして保存し、検証後はコピーから戻すこと。**

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git add src/core/read/cache-policy.ts src/core/read/cache-policy.test.ts
git commit -m "feat(read): classify cached kinds by who may see them"
```

---

### Task 2: 決定を ADR にする

**Files:**
- Create: `docs/adr/0027-account-boundary-and-cache-scope.md`
- Modify: `CONTEXT.md`（ADR の表に 1 行足す）

**Interfaces:**
- Consumes: Task 1 の `CacheScope`（`public` / `account` / `session`）

**ADR は決定の記録なので、経緯・理由・受け入れた劣化を書いてよい。**
既存の書き方は `docs/adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md`
を見ること（frontmatter は `---\nstatus: accepted\n---`、見出しは決定そのものを
一文で言い切る形）。

- [x] **Step 1: ADR を書く**

`docs/adr/0027-account-boundary-and-cache-scope.md`:

```markdown
---
status: accepted
---

# キャッシュする kind を「誰が見てよいか」で分類し、名乗らないものは永続化しない

`EventStore` に入るものはすべてリレーから来た署名済みの公開イベントである。それでも置き場を 1 つにしてよいわけではない —— 閲覧者の鍵で導いた派生物（NIP-44 の復号結果、`kind:10000` の暗号化 content の中身）と、閲覧者に紐づくローカル状態（既読）は、アカウントをまたいで見せてはならない。

キャッシュ方針に**保持方針とは独立した軸**として `scope` を置く。

| `scope` | 意味 | 置き場 |
|---|---|---|
| `public` | 誰が見ても同じ署名済みイベント | 共有 DB（`streets.v1`） |
| `account` | その閲覧者にしか意味がない | そのアカウント専用の置き場 |
| `session` | ディスクへ書かない | メモリのみ |

**既定は `session`。** 分類を名乗らない kind は共有もされず永続化もされない。

**アカウントが変わったら read layer を捨てて作り直す。** in-memory の `EventStore` ごと破棄する。

## なぜ

**防ぎたいのは「別アカウントの DB を覗かれること」ではない。** 同一オリジンなので、どちらにせよページの JS からは両方読める。**防ぎたいのは誤って画面に出ることである** —— A のミュートが B に効く、A しか取っていないイベントが B のタイムラインに出る。

**既定を `session` にするのは、間違いの向きを選ぶためである。** 名乗り忘れが「書かれない」に倒れれば、失われるのは速度だけで、リロードすれば取り直せる。逆に倒れると、共有 DB へ書かれたものを後からアカウント別に引き剥がすことはできない。**取り返しがつかない側を既定にしない。**

**保持方針と混ぜないのは、`kind:3` が両者の独立を示しているからである。** フォローリストはイベント自体が公開（`scope: public`）だが永続化しない —— 古いメンバーシップで購読すると外した著者を画面から消せないという、可視範囲とは無関係の理由による（[ADR-0019](./0019-two-bucket-cache-policy.md) の保持方針の話）。1 つのフラグに潰すと「共有してよいが保持はしたくない」が表現できなくなる。

**メモリを全部捨てるのは、選んで捨てるより取りこぼしが起きないからである。** `public` なイベントまで一緒に消えるが、それらは共有 DB から水和し直せる。

## 明示的に受け入れた劣化

- **`account` の置き場は今作らない。** 該当する kind が 1 つも無い。`account` を名乗った kind は置き場ができるまで永続化されない（メモリのみ）—— 安全側であり、機能としては「リロードで消える」だけ。
- **アカウント切替の機構も今作らない。** 切替の経路が 1 つも無いので、`createReadLayer` にアカウントを渡しても使われない引数が増えるだけになる。**規則だけを先に固定する。** 混ざって困るのはディスクに書かれたものであり、メモリは切替を作る瞬間に一度考えれば済む。
- **DB をアカウントごとに完全に分ける案は採らなかった。** 分類の取り違えは起こらなくなるが、共有 DB がアカウントに依らないからこそ成立している「ログイン前に水和を始める」ができなくなる。実測でこの並行は `firstRenderMs` 356→112.9 ms の効果があった（`docs/design/read-layer-followups.md`）。

## Consequences

`scope` は `CachePolicy` の必須フィールドであり、方針表へ kind を足す人は必ず分類を選ぶ。`account` を選んだ場合、置き場を作るまでその kind は永続化されない。
```

- [x] **Step 2: `CONTEXT.md` の ADR 表に 1 行足す**

`| [0026](...) | 常に見せるのは行動できる異常だけとし、診断値は開発者モードの背後に置く |`
の次の行へ:

```markdown
| [0027](./docs/adr/0027-account-boundary-and-cache-scope.md) | キャッシュする kind を「誰が見てよいか」で分類し、名乗らないものは永続化しない |
```

- [x] **Step 3: リンク切れが無いことを確認 → ゲート、コミット**

ADR 内の相対リンク（`./0019-...`）が実在することを `ls docs/adr/` で確かめること。

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git add docs/adr/0027-account-boundary-and-cache-scope.md CONTEXT.md
git commit -m "docs(adr): record the cache scope decision"
```

---

## 検証

完了時に人間へ依頼すること。

1. `pnpm dev` → `/v1` を開き、**リロードでプロフィールが即座に出る**（＝共有 DB からの水和が今までどおり効いている）
2. 開発者モードの `phase2` が 0 のまま（＝ `kind:10002` の水和が効いている）
