# kind:1 の描画 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kind:1 の `full` / `compact` を v0 と同じ見た目にする。デザインは新しく決めない。

**Architecture:** v0 のコードを**デザインの仕様**として読み、v1 の構造（レンダラ登録・`EventView`・`parseContent` のトークン）の上に作り直す。v0 のコンポーネントは流用しない。

**Tech Stack:** SolidJS / UnoCSS / Vitest / Playwright。

**仕様:** [docs/superpowers/archive/specs/2026-08-11-note-rendering-design.md](../specs/2026-08-11-note-rendering-design.md)。**タスクの記述と仕様が食い違ったら仕様が正。**

## Global Constraints

- **完了の判定は `pnpm vitest run && pnpm typecheck && pnpm check` の 3 つすべて**（Task 4 は加えて `pnpm exec playwright test e2e/v1.spec.ts`）。
  `pnpm check` は型検査を含まない。**各コマンドの終了ステータスをそれ自体で見ること** ——
  パイプへ通した先のステータスを読むと、落ちているのに通ったように見える。
- **v0 は「デザインの一次情報」であって「プロトコルの一次情報ではない」**（仕様 1 節）。
  - **読んでよい**: `src/shared/components/EventBase.tsx` / `RichContents.tsx` /
    `src/features/User/components/Avatar.tsx` / `src/shared/libs/format.ts` の日時整形
  - **読んではいけない**: `src/shared/libs/parser/` と `parseTextContent.tsx` の**解析部分**。
    現行 NIP とずれている。タグの意味が要るなら `src/core/nostr/event-refs.ts` と
    `content.ts` を見るか、NIPs を引くこと
- すべてのテストは捕まえる変異を名指しし、**実際にその変異を入れて落ちることを確認**する。
  **その変異が名指ししたテストを落とすこと**まで確かめる。**変異の前に製品コードを
  コピーして保存し、`git checkout` で戻さない。**
- **コメントには非自明な WHY だけ**（`CONTEXT.md` の「書き方」節）。WHAT・変更履歴・
  タスク ID は書かない。
- **既存の `data-testid` を変えない**（`note` / `note-author` / `note-content` /
  `note-created-at` を既存の e2e が拾っている）。
- コンポーネントのテストは `createRoot`（この repo に `@solidjs/testing-library` は無い）。
  `src/routes/v1/EventView.test.tsx` が最も近い前例。

---

### Task 1: 時刻の書式

**Files:**
- Create: `src/core/view/format-time.ts`
- Create: `src/core/view/format-time.test.ts`

**Interfaces:**
- Produces:
  - `formatEventTime(date: Date, now: Date): string` —— 同日 `HH:mm` / 同年 `MM/dd HH:mm` / それ以外 `yyyy/MM/dd HH:mm`
  - `formatEventTimeFull(date: Date): string` —— `title` 属性に入れる完全な日時

**純関数だけ。`now` を引数で受ける** —— `Date.now()` を直に読むとテストが時刻に依存する。

- [x] **Step 1: 失敗するテストを書く**

| 主張 | 捕まえる変異 |
|---|---|
| 同日は `HH:mm` | 常に日付を出す |
| 同年・別日は `MM/dd HH:mm` | 同日判定だけで分ける（昨日の投稿が今日の時刻に見える） |
| 別年は `yyyy/MM/dd HH:mm` | 年を落とす（去年の投稿が今年に見える） |
| **同月・別日が「同日」にならない** | 月だけ比較する |
| **同日・別月（1/15 と 2/15）が「同日」にならない** | 日だけ比較する |
| 24 時間表記（`hour12: false`） | 12 時間表記になる |

**`ja-JP` ロケールに固定する。** 実行環境のロケールで書式が変わると、テストが CI と手元で違う結果になる。

- [x] **Step 2〜4: 走らせて落ちる → 実装 → ゲートと変異検証、コミット**

```bash
git commit -m "feat(view): format event timestamps the way v0 does"
```

---

### Task 2: トークンの描画

**Files:**
- Create: `src/routes/v1/NoteContent.tsx`
- Create: `src/routes/v1/NoteContent.test.tsx`

**Interfaces:**
- Consumes: `parseContent` / `ContentToken` / `isProbablyImageUrl`（`src/core/nostr/content.ts`）、
  `useRender()`、`EventView`、`Profile`
- Produces: `NoteContent: Component<{ event: NostrEvent; variant: EventVariant }>`

**仕様 4 節の表がすべて。** 以下は表に書ききれない要点。

- [x] **Step 1: テストを書く**

| 主張 | 捕まえる変異 |
|---|---|
| `full` で画像 URL が `<img>` になる | 画像を出さない |
| **`compact` で画像 URL がリンクのまま** | `variant` を見ずに常に展開する（引用先の原寸画像でカラムが埋まり、元の投稿が見えなくなる） |
| 画像でない URL は `full` でもリンク | 拡張子を見ずに全部 `<img>` にする |
| リンクに `rel="noopener noreferrer"` が付く | 落とす（`target="_blank"` と組で意味を持つ） |
| `emoji` が `<img>` になる | テキストのまま出す |
| `hashtag` が**押せる見た目にならない** | リンクにする（押しても何も起きないのに押せそうに見える） |
| `mention`（`npub`/`nprofile`）が `<Profile>` を通る | pubkey をそのまま出す |
| `mention`（`note`/`nevent`）が `compact` の `EventView` になる | テキストのまま出す |
| `mention`（`naddr`）が「未対応の参照です」 | 落として本文が欠ける |
| 本文の器に `whitespace-pre-wrap` が付く | 改行が消える |

- [x] **Step 2〜4: 走らせて落ちる → 実装 → ゲートと変異検証、コミット**

**`parseContent` を `createMemo` で包む。** イベントは不変なので、再描画のたびにトークン化し直す理由が無い。

```bash
git commit -m "feat(v1): render note content tokens"
```

---

### Task 3: イベント 1 件の骨格

**Files:**
- Create: `src/routes/v1/Avatar.tsx`
- Modify: `src/routes/v1/Profile.tsx`（名前部分だけを担うようにする）
- Modify: `src/routes/v1/renderers/Note.tsx`
- Modify/Create: 対応するテスト

**Interfaces:**
- Produces: `Avatar: Component<{ pubkey: string; size: "full" | "compact" }>`

**仕様 3 節がすべて。** 以下は要点。

- [x] **Step 1: `Avatar` を切り出す**

今の `Profile.tsx` は名前とアイコンを 1 つの `<span>` に並べている。v0 の骨格は
**アバターと名前が別のグリッド領域**なので分ける。

- `full` は `w-10`、`compact` は `w-6`。`aspect-square`、`rounded`、`object-cover`、
  読み込み前は `bg-secondary`
- **`sticky top-0`** —— 長い本文をスクロールしても誰の投稿かを見失わない
- プロフィール未取得でも枠は出す（レイアウトが後から動かない）

`Profile.tsx` は名前だけを担う。**`data-testid="profile"` / `profile-name` は変えない。**

- [x] **Step 2: `NoteFull` / `NoteCompact` を組み直す**

```
grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1
grid-template-areas: "avatar name" / "avatar content"
```

| | `full` | `compact` |
|---|---|---|
| 文字 | `text-body` | `text-caption` |
| アバター | `w-10` | `w-6` |
| padding | `p-2` | **持たない**（置く側が決める） |

名前の行: `display_name`（`font-500`）+ `@name`（`c-secondary text-caption`）+
時刻（`c-secondary text-caption text-nowrap`、`title` に完全な日時）。

**`compact` が padding を持たない理由をコメントに書くこと** —— 引用カード・リポスト・
返信先が入れ子で置くので、余白は外側が決めないと二重になる。

- [x] **Step 3: 本文の高さ制限**

400px を超えたら折り畳み、展開ボタンを出す。高さの観測は
`@solid-primitives/resize-observer` が既に依存にある（v0 が使っている）——
**依存を増やさずに済むか確認し、増やすなら理由を報告に書くこと。**

| 主張 | 捕まえる変異 |
|---|---|
| 400px 未満では展開ボタンが出ない | 常に出す |
| 展開すると全文が出る | 折り畳んだまま |

- [x] **Step 4: ゲートと変異検証、コミット**

```bash
git commit -m "feat(v1): lay out notes the way v0 does"
```

---

### Task 4: e2e と記録

**Files:**
- Modify: `e2e/v1.spec.ts`、`e2e/fixtures/` のシード
- Modify: `docs/design/read-layer-followups.md`

- [x] **Step 1: e2e**

- 既存の `note` / `note-author` / `note-content` / `note-created-at` が引き続き出ること
- **画像 URL を含むノートをシードし、`full` で `<img>` が出て、`compact`
  （引用先として置かれたもの）では出ないこと**

`compact` の側を主張するには、引用を持つノートが要る。既存のシードに引用があるか
確認し、無ければ足すこと。

- [x] **Step 2: 仕様 8 節の 3 問に答える**

`docs/design/read-layer-followups.md` に新しい節を作る。**3 問とも実鍵で並べて見ないと
答えられない。** 「未取得」と書き、何を見れば分かるかを書く。**推測を書かない。**

- [x] **Step 3: 繰延事項を Issue にする**

Task 1〜3 の報告を読み、直さなかったものを GitHub Issue にする（ボードにも足す）。

**このスライスが範囲外にしたもののうち、Issue が無いものを確認して作ること:**
OGP のリンクカード / 動画 / Blurhash と `imeta`（NIP-92）。

- [x] **Step 4: ゲート、コミット**

---

## 検証

完了時に人間へ依頼すること。

1. `pnpm dev` → `/v1` でログインし、**v0（`/`）と並べて見比べる**
2. 実データで詰まっていないか —— 長い名前、絵文字の連続、画像の縦横比、極端に長い本文
3. **`compact` で画像を出さない判断が、実際の引用で不足に感じないか**
4. **400px の折り畳みが、カラム幅 400px（`w-100`）に対して妥当か** —— v0 のカラム幅は
   可変で、v1 は固定である
