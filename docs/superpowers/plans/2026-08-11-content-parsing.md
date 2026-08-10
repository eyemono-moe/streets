# 本文のパース 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `content` をトークン列に変える純関数と、それが必要とする NIP-19 の TLV デコードを作る。描画はしない。

**Architecture:** 純関数だけ。`decodeNip19`（TLV）と `parseContent`（トークナイザ）と `isProbablyImageUrl`。どれも例外を投げず、UI にも読み取り層にも依存しない。

**Tech Stack:** TypeScript / Vitest。`@scure/base` の bech32 は既に依存にある。

**仕様:** [docs/superpowers/specs/2026-08-11-content-parsing-design.md](../specs/2026-08-11-content-parsing-design.md)。**タスクの記述と仕様が食い違ったら仕様が正。**

## Global Constraints

- **完了の判定は `pnpm vitest run && pnpm typecheck && pnpm check` の 3 つすべて。**
  `pnpm check` は Biome と読み取り層の依存チェックだけで、**型検査を含まない**。
  **各コマンドの終了ステータスをそれ自体で見ること** —— パイプへ通した先の
  ステータスを読むと、落ちているのに通ったように見える。
- **すべてのテストは、捕まえる変異をコメントで名指しし、実際にその変異を入れて
  落ちることを確認してから報告すること。** 加えて**その変異が名指ししたテストを
  落とすこと**まで確かめる。**変異の前に製品コードをコピーして保存し、
  `git checkout` で戻さない**（未コミットの実装ごと消える）。
- **コメントには非自明な WHY だけ**（`CONTEXT.md` の「書き方」節）。WHAT・
  変更履歴・タスク ID の参照は書かない。
- **NIP の解釈は一次情報（`nostr-protocol/nips`）に従う。`src/features/` /
  `src/shared/libs/parser/` の v0 実装を参照しないこと** —— 現行仕様とずれて
  いる（NIP-10 の `mention` marker が実例）。
- これらは**純関数**であり、`Date.now()` も `performance.now()` も DOM も
  使わない。

---

### Task 1: NIP-19 の TLV デコード

**Files:**
- Modify: `src/core/nostr/nip19.ts`
- Modify: `src/core/nostr/nip19.test.ts`

**Interfaces:**
- Produces: 仕様 3 節の `Nip19Ref` と `decodeNip19(value: string): Nip19Ref | undefined`

**一次情報（2026-08-11 に確認）**

- bare（TLV 無し）: `npub` / `nsec` / `note`。TLV あり: `nprofile` / `nevent` / `naddr` / `nrelay`（deprecated）
- TLV は `T`（1 バイト）`L`（1 バイト）`V`（可変長）の連なり
- 型 0 = special、1 = relay（ASCII の URL、**複数回現れてよい**）、2 = author（32 バイト）、3 = kind（**32 ビット符号なし、ビッグエンディアン**）
- `special` の中身: `nprofile` は 32 バイトの pubkey、`nevent` は 32 バイトのイベント id、**`naddr` は `d` タグの識別子文字列**（通常の置換可能イベントでは空文字）
- **認識できない TLV 型はエラーにせず無視する**

- [ ] **Step 1: 失敗するテストを書く**

既存の `nip19.test.ts` の `sign` 相当のヘルパーは無いので、**エンコード側を自分で書いてテストデータを作る**こと（`encodeBech32` は生バイト列を受けないので、TLV のバイト列を組み立ててから bech32 へ通す小さなヘルパーをテスト内に置く）。

主張と、それぞれが捕まえる変異:

| 主張 | 捕まえる変異 |
|---|---|
| `npub` が `{ kind: "npub", pubkey }` になる | bare 形を TLV として読む |
| `note` が `{ kind: "note", id }` になる | 同上 |
| `nprofile` の pubkey と relays が取れる | special を読まない / relay を 1 件しか拾わない |
| **relay が複数入る** | `relays` を最後の 1 件で上書きする |
| `nevent` の `author` / `eventKind` が省略可能 | 省略時に `undefined` ではなく 0 を入れる |
| **`kind` がビッグエンディアンで読まれる** | リトルエンディアンで読む（kind 1 が 16777216 になる） |
| **未知の TLV 型を無視して残りを読み続ける** | 未知の型で `undefined` を返す（将来 NIP が型を足すたびに全部読めなくなる） |
| **`naddr` の識別子が空文字でも成立する** | 空文字を欠損として `undefined` を返す（通常の置換可能イベントが全部読めなくなる） |
| **`nsec` は `undefined`** | デコードして秘密鍵を構造化データとして持つ（ADR-0008 違反） |
| `nrelay` は `undefined` | deprecated な形を通す |
| 壊れた bech32 が例外ではなく `undefined` | try/catch を省く |
| **`L` が残りバイト数を超えているとき `undefined`** | 範囲外を読む（truncate された入力で他人のデータを読む） |

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/nostr/nip19.test.ts`

- [ ] **Step 3: 実装する**

`decodeBech32` は `{ prefix, dataHex }` を返すので、TLV には**バイト列**が要る。
`bech32.decode` → `bech32.fromWords` で `Uint8Array` を得る内部関数を足し、
`decodeBech32` はそれを hex 化するだけにする（既存の呼び出し元の挙動は変えない）。

TLV の読み取りは 1 つのループで:

```ts
type Tlv = { type: number; value: Uint8Array };

/** `L` が残りを超えていたら中断して `undefined`。truncate された入力で範囲外を読まない。 */
const readTlv = (bytes: Uint8Array): Tlv[] | undefined => {
  const out: Tlv[] = [];
  let i = 0;
  while (i + 2 <= bytes.length) {
    const type = bytes[i];
    const length = bytes[i + 1];
    const start = i + 2;
    const end = start + length;
    if (end > bytes.length) return undefined;
    out.push({ type, value: bytes.subarray(start, end) });
    i = end;
  }
  return i === bytes.length ? out : undefined;
};
```

**`nsec` の扱いをコメントに書くこと** —— なぜ弾くのかは ADR-0008 であり、
コードからは復元できない。

- [ ] **Step 4: 3 つのゲートと変異検証、コミット**

```bash
git add src/core/nostr/nip19.ts src/core/nostr/nip19.test.ts
git commit -m "feat(nostr): decode NIP-19 TLV entities"
```

---

### Task 2: 本文のトークナイザ

**Files:**
- Create: `src/core/nostr/content.ts`
- Create: `src/core/nostr/content.test.ts`

**Interfaces:**
- Consumes: Task 1 の `decodeNip19` / `Nip19Ref`、`NostrEvent`
- Produces: 仕様 2 節の `ContentToken` / `parseContent(event)` / `isProbablyImageUrl(url)`

- [ ] **Step 1: 不変条件のテストを最初に書く**

**これが最も重要なテストである。**

```ts
  it("トークンを連結すると元の content に戻る", () => {
    // 捕まえる変異: どのトークンでも、元の文字列の一部を落とす / 重複させる。
    // トークン化は本文を「分ける」だけで「変える」処理ではない —— 落ちても
    // 画面には出ないので、この不変条件でしか機械的に検出できない。
    const samples = [ /* 実在しそうな本文を数種類 + 境界 */ ];
    for (const content of samples) {
      const event = noteWith(content);
      expect(concatTokens(parseContent(event))).toBe(content);
    }
  });
```

`concatTokens` はテスト内のヘルパー: `text` は `text`、`url` は `url`、
`mention` / `hashtag` は `raw`、`emoji` は `` `:${shortcode}:` ``。

**サンプルには必ず含めること:** 先頭がトークン / 末尾がトークン / トークンが
連続する / 空文字 / 改行を含む / 全角記号を含む / URL の直後に句読点。

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/nostr/content.test.ts`
Expected: FAIL —— モジュールが存在しない。

- [ ] **Step 3: 残りのテストを書く**

| 領域 | 主張 | 捕まえる変異 |
|---|---|---|
| URL | `#` を含む URL がハッシュタグに割れない | ハッシュタグを URL より先に取る |
| URL | `:` を含む URL（ポート番号）が絵文字に割れない | 絵文字を URL より先に取る |
| URL | 末尾の句読点（`。` `、` `)`）を URL に含めない | 貪欲に取る |
| `nostr:` | `npub`/`note`/`nprofile`/`nevent`/`naddr` の 5 形が `mention` になる | 一部の prefix しか見ない |
| `nostr:` | `nsec` がテキストのまま残る | `decodeNip19` の `undefined` を無視する |
| `nostr:` | 壊れた入力がテキストのまま残る | 消す（本文が欠ける） |
| 絵文字 | `emoji` タグにあるものだけが絵文字になる | 本文中の `:word:` を全部絵文字にする |
| 絵文字 | `12:30:45` が絵文字にならない | 同上 |
| 絵文字 | 文字集合（英数字・ハイフン・アンダースコア）に合わないタグを無視 | 検証しない |
| 絵文字 | 同じショートコードのタグが 2 つあれば**先勝ち** | 後勝ちにする |
| ハッシュタグ | **日本語が取れる** | ASCII だけに絞る（日本語圏で使い物にならない） |
| ハッシュタグ | `tag` が小文字化され、`raw` に元の表記が残る | 小文字化しない（カラムの `#t` フィルタが引けない） |
| 画像判定 | 拡張子つき / なし / クエリ文字列つき | 拡張子の大小を区別する |

- [ ] **Step 4: 実装する**

**1 パスで、URL → `nostr:` → `:shortcode:` → `#hashtag` の順に取る**（仕様 4 節）。
実装の形は問わないが、**優先順位が読んで分かること**。正規表現を 1 本に詰め込むより、
位置を進めながら順に試すほうがこの順序を保ちやすい。

**`emoji` タグの索引は `parseContent` の冒頭で 1 回だけ作る。** ショートコードが
出るたびにタグ配列を走査すると、絵文字の多い本文で二乗になる。

**例外を投げない。** レンダラの中から呼ばれ、このアプリに `ErrorBoundary` は
無い（1 件の壊れたイベントでカラム全体が落ちることは実証済み）。

- [ ] **Step 5: 3 つのゲートと変異検証、コミット**

```bash
git add src/core/nostr/content.ts src/core/nostr/content.test.ts
git commit -m "feat(nostr): split note content into tokens"
```

---

### Task 3: 記録

**Files:**
- Modify: `docs/design/read-layer-followups.md`
- Modify: `CONTEXT.md`（用語に「トークン」を足すか判断する）

**製品コードは変更しない。**

- [ ] **Step 1: 仕様 9 節の 3 問に答える**

`docs/design/read-layer-followups.md` に新しい節を作る。**3 問とも実データが要る**
ので、答えられるものが無ければ「未取得」と書き、**何をどう数えれば分かるか**を
書く。**推測を書かない。**

- [ ] **Step 2: 用語を足すか判断する**

`CONTEXT.md` の「Language」節は画面の構成と読み取りの仕組みを定義している。
**「トークン」がここに載るべき語かを判断すること** —— 載せるなら 1 行で定義し、
_Avoid_ も書く。載せない判断でもよいが、**理由を報告に書くこと**（用語集に
無い語がコードベースに増えるのは、この文書の目的に反する）。

- [ ] **Step 3: 繰延事項を Issue にする**

Task 1〜2 の報告ファイルを読み、直さなかったものを **GitHub Issue** として作る
（`docs/design/read-layer-followups.md` はもうバックログではない）。ラベルは
領域 + 優先度、着手前にデザインが要るものは `design-needed`。ボードにも足す
（`gh project item-add 2 --owner eyemono-moe --url <url>`、Status は `Backlog`、
`Priority` はラベルに合わせる）。

**このスライスの成果は次に描画層が乗って初めてユーザーに届く。** 描画層の
Issue が既にあるか確認し、無ければ作ること（`ui` / `design-needed`）。

- [ ] **Step 4: 3 つのゲート、コミット**

---

## 検証

**このスライスに実鍵での確認は要らない。** 描画がまだ無いので画面から観測できる
ものが存在しない。純関数のテストが唯一のゲートである。

描画層が乗った時点で、仕様 9 節の 3 問（実データでトークン化が破綻しないか、
TLV 形の割合、ハッシュタグの `t` タグとの食い違い）を実鍵で確認する。
