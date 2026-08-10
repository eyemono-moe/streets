# 本文のパース — 設計

## 0. このスライスは何のためにあるか

今どのカラムでも `content` はプレーンテキストとして出ている。**画像も URL もメンションもカスタム絵文字も、すべてただの文字列**である。Nostr クライアントとして使えない最大の理由がここにある。

**このスライスは描画しない。** 本文をトークン列に変える純関数と、それが必要とする NIP-19 の TLV デコードだけを作る。トークンをどう見せるかはデザインが要るので範囲外 —— **描画層は、デザインが決まった後に「トークンを受け取って描くだけ」になる。**

前提知識は [CONTEXT.md](../../../CONTEXT.md)、決定は [docs/adr/](../../adr/)、スライスの記録は [read-layer-followups.md](../../design/read-layer-followups.md)。残タスクは [GitHub Issues](https://github.com/eyemono-moe/streets/issues)。

## 1. 範囲

**含む。** `parseContent(event)` とトークン型。NIP-19 の TLV デコード（`nprofile` / `nevent` / `naddr`）。`isProbablyImageUrl`。

**含まない。** トークンの描画。`nostr:` の参照先を取りに行く配線（`EventRequests` / `ProfileRequests` の上に乗るが、それは描画側）。NIP-23 の Markdown。NIP-19 の URL ルーティング（同じデコーダを使うので後から足せる）。

## 2. 出力はトークン列

```ts
// src/core/nostr/content.ts
export type ContentToken =
  | { type: "text"; text: string }
  | { type: "url"; url: string }
  | { type: "mention"; ref: Nip19Ref; raw: string }
  | { type: "emoji"; shortcode: string; url: string }
  | { type: "hashtag"; tag: string; raw: string };

export const parseContent = (event: NostrEvent): ContentToken[];
```

**連結すると元の `content` に戻る。** `text` の `text`、`url` の `url`、`mention` / `hashtag` の `raw`、`emoji` の `:shortcode:` —— これを順に繋げば元通りになること。これは**テストで固定する不変条件**であり、トークン化で文字を落としていないことの唯一の機械的な保証になる。

**画像を独立したトークンにしない。** 「この URL を `<img>` で描くか」は表示の判断であり、拡張子で決め打つのも、`Content-Type` を見に行くのも、設定で切り替えるのも（[ADR-0012](../../adr/0012-external-images-loaded-directly-by-default.md)）表示側の選択である。パーサは `url` を出し、判定は別の純関数として提供してレンダラが呼ぶ。

```ts
/** 拡張子だけを見る。実際に画像かどうかは取得してみるまで分からない。 */
export const isProbablyImageUrl = (url: string): boolean;
```

## 3. NIP-19 の TLV デコード

**これがこのスライスで最も大きい未実装部分である。** `src/core/nostr/nip19.ts` にあるのは bech32 → hex の生変換（`encodeBech32` / `decodeBech32`）と `decodeNpub` だけで、TLV をほどく処理が無い。

NIP-27 は `nostr:` の後に `nprofile` / `npub` / `nevent` / `naddr` が来ると定める。`npub` / `note` は 32 バイトの生データだが、残りは TLV である。**`npub` / `note` だけ対応すると、実クライアントが実際に使っている形（リレーヒント付きの `nprofile` / `nevent`）の大半を取りこぼす。**

### 一次情報（2026-08-11 に確認）

TLV は `T`（1 バイト）`L`（1 バイト）`V`（可変長）の連なり。

| 型 | 意味 | 値 |
|---|---|---|
| 0 | special | エンティティ本体 |
| 1 | relay | リレー URL（ASCII）。**複数回現れてよい** |
| 2 | author | 32 バイトの pubkey |
| 3 | kind | 32 ビット符号なし整数、ビッグエンディアン |

`special` の中身は prefix ごとに違う。`nprofile` は 32 バイトの pubkey、`nevent` は 32 バイトのイベント id、**`naddr` は `d` タグの識別子文字列**（通常の置換可能イベントでは空文字）。

**認識できない TLV 型は、エラーにせず無視する**（NIP-19 が明示している）。

### 型

```ts
export type Nip19Ref =
  | { kind: "npub"; pubkey: string }
  | { kind: "note"; id: string }
  | { kind: "nprofile"; pubkey: string; relays: string[] }
  | { kind: "nevent"; id: string; relays: string[]; author?: string; eventKind?: number }
  | { kind: "naddr"; identifier: string; pubkey: string; eventKind: number; relays: string[] };

/** 不正な入力に対して例外を投げない。 */
export const decodeNip19 = (value: string): Nip19Ref | undefined;
```

**`nsec` は必ず `undefined` を返す。** [ADR-0008](../../adr/0008-signer-only-key-handling.md) は秘密鍵をアプリに渡さないと定めている。本文に貼られた `nsec` をデコードして構造化データとして持つのは、その方針を入力の側から破ることになる。`decodeNpub` が既に同じ理由で `nsec` を弾いており、ここでも同じにする。

**`nrelay` は deprecated なので扱わない**（`undefined`）。

**`naddr` は `special` が空文字でもよい。** 通常の置換可能イベント（`kind:0` / `3` / `10002` など）は `d` タグを持たないので、空文字が正しい値であり、欠損として扱ってはならない。

## 4. トークン化の順序

**1 パスで、この優先順位で取る。**

1. **URL**（`https://` / `http://`）
2. **`nostr:` URI**
3. **`:shortcode:`**（`emoji` タグに実在するものだけ）
4. **`#hashtag`**

**URL が最初でなければならない。** `#` はフラグメントに、`:` はスキームとポートに現れる。後回しにすると `https://example.com/#foo` の `#foo` がハッシュタグに、`http://host:8080/` の `:8080:` 相当が絵文字候補になる。

**`nostr:` を URL より後にしても取れるが、先に URL を取ることで `nostr:` が汎用 URL 正規表現に食われる形を避ける。** 実装では URL の正規表現を `https?://` に限定し、`nostr:` を別パターンとして扱う。

## 5. 絵文字

`emoji` タグの形は `["emoji", <shortcode>, <image-url>]`（4 番目に kind:30030 の座標が入ることがあるが、このスライスでは読まない）。

- **`emoji` タグに無いショートコードはテキストのまま。** そうしないと `12:30:45` のような時刻表記や `ratio:1:2` が絵文字候補になる
- **ショートコードは英数字・ハイフン・アンダースコアのみ**（NIP-30 が MUST として定めている）。この文字集合に合わないタグは無視する
- **同じショートコードが複数回現れてよい。** NIP-30 は禁じていない
- **同じショートコードのタグが複数あったら最初のものを使う。** NIP-30 は重複を定めていない。先勝ちにするのは、後から足したタグが既存の見え方を変えないほうが投稿者の意図に近いため

## 6. ハッシュタグ

**本文中の `#word` から出す。`t` タグからは出さない。**

`t` タグは投稿者が付ける任意のもので、本文中の表記と一致する保証がない（本文に無いタグを付けることも、タグを付けずに `#word` と書くこともできる）。ユーザーが画面で見て押せるのは本文中の文字列のほうである。

`tag` は [NIP-24](https://github.com/nostr-protocol/nips/blob/master/24.md) に合わせて**小文字化**したものを入れ、`raw` に元の表記を残す。カラムのハッシュタグ検索（`#t` フィルタ）が小文字で引くので、揃えないと押しても何も出ない。

**`#` に続く文字は英数字・アンダースコア・ハイフンとする。** 日本語のハッシュタグは実在するので、**Unicode の文字クラスを使う**（`\p{L}` / `\p{N}`）—— ASCII だけに絞ると日本語圏で使い物にならない。区切りは空白と、URL に現れない記号。

## 7. エラー処理

| 起きること | 扱い |
|---|---|
| `nostr:` の後が壊れている / デコードできない | **プレーンテキストとして残す。** 消すと本文が欠ける。壊れた表示より情報の欠落のほうが害が大きい |
| `nostr:nsec1...` | プレーンテキスト（3 節） |
| `emoji` タグの URL が空 / 形が不正 | そのショートコードは絵文字にしない（テキストのまま） |
| `content` が空 | 空配列を返す。例外を投げない |
| 極端に長い `content` | 上限を設けない。[ADR-0011](../../adr/0011-performance-budget.md) の予算に触れるようなら、それは描画側で切る話 |

**`parseContent` は例外を投げない。** レンダラの中から呼ばれ、このアプリに `ErrorBoundary` は無い（1 件の壊れたイベントでカラム全体が落ちることは A-2 のレビューで実証済み）。

## 8. テスト

**ユニット（vitest）**

- **連結すると元の `content` に戻る**（2 節の不変条件）。実在しそうな本文を数種類、および境界（先頭・末尾がトークン、トークンの連続、空文字）で
- URL —— `#` を含む URL がハッシュタグに割れないこと、`:` を含む URL が絵文字に割れないこと、末尾の句読点を URL に含めないこと
- `nostr:` —— `npub` / `note` / `nprofile` / `nevent` / `naddr` の 5 形が `mention` になること、`nsec` がテキストのまま残ること、壊れた入力がテキストのまま残ること
- TLV —— リレーが複数入ること、未知の型が無視されること、`naddr` の識別子が空文字でも成立すること、`kind` がビッグエンディアンで読まれること
- 絵文字 —— タグにあるものだけが絵文字になること、`12:30:45` が絵文字にならないこと、不正な文字集合のタグが無視されること、重複タグで先勝ちすること
- ハッシュタグ —— 日本語が取れること、小文字化されること、`raw` に元の表記が残ること
- `isProbablyImageUrl` —— 拡張子つき / なし / クエリ文字列つき

**E2E は書かない。** 描画がまだ無いので、画面から観測できるものが存在しない。描画層のスライスで書く。

## 9. 実際に動かして初めて答えられる問い

1. **実際の本文でトークン化が破綻しないか。** 連結して元に戻る不変条件はテストで固定するが、実データの多様性（改行、全角記号、絵文字の連続、極端に長い URL）は実鍵で流してみないと分からない
2. **`nostr:` のうち TLV 形（`nprofile` / `nevent`）が占める割合。** `npub` / `note` だけで足りるという判断もありえたが、割合を測っていない。デコード結果をカウントすれば分かる
3. **ハッシュタグを本文から出す判断が正しいか。** `t` タグと本文の `#word` がどれくらい食い違うか
