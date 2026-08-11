# kind:1 の描画 — 設計

## 0. このスライスは何のためにあるか

`parseContent` はトークン列を返せるようになったが、描画側は今も本文をプレーンテキストとして出している。**全カラムの中身のほぼ全部が kind:1 なので、ここが埋まるまで「使えるクライアント」にならない。**

**デザインは新しく決めない。v0 の表示を仕様として写す。** v0 は一度作って動かした形を持っており、それをコードから読み取れる。**同じコンポーネントを流用するのではなく、同じ見た目になるものを v1 の構造（レンダラ登録・`EventView`・トークン）の上に作る。**

前提知識は [CONTEXT.md](../../../CONTEXT.md)、決定は [docs/adr/](../../adr/)、スライスの記録は [read-layer-followups.md](../../design/read-layer-followups.md)。残タスクは [GitHub Issues](https://github.com/eyemono-moe/streets/issues)。

## 1. v0 は「デザインの一次情報」であり「プロトコルの一次情報ではない」

**この区別を守ること。**

- **見た目・レイアウト・寸法・情報の並び** —— v0 のコードが仕様である。読んでよい
- **NIP の解釈**（タグの意味、marker、TLV、kind の分類）—— **v0 は古い。** 現行 NIP-10 に存在しない `mention` marker を割り当てているのが実例。**NIPs リポジトリを一次情報とする**

v1 側には既に `event-refs.ts`（NIP-10/18）と `content.ts`（NIP-27/30）があり、プロトコル解釈はそちらに揃っている。**v0 のパーサ（`src/shared/libs/parser/`、`parseTextContent.tsx` の解析部分）は参照しない。参照するのは描画部分だけ。**

## 2. 範囲

**含む。** kind:1 の `full` / `compact` を v0 の見た目に合わせる。トークン 5 種の描画（text / url / emoji / hashtag / mention）。画像 URL のインライン表示。本文の高さ制限と展開。返信先の「@name への返信」行。

**含まない。** OGP のリンクカード（`RichLink`）—— 外部 HTTP 取得を伴う独立した機能。動画。Blurhash と `imeta`（NIP-92）による寸法指定。ミュート（#207）。名前のホバーカード（#275 に依存）。名前クリックでユーザーカラムを開く（#205 に依存）。リアクション・アクションの行（#199 / #200 / #201）。

**依存する要素が無いものは、その部分だけ出さない。** 例えば名前は今のところただのテキストで、押しても何も起きない。**押せそうに見せない**こと —— 押せない要素をリンクの見た目にするのは、機能が無いことと壊れていることを区別できなくする。

## 3. イベント 1 件の骨格

v0 の `src/shared/components/EventBase.tsx` が仕様。

```
┌──────────────────────────────────┐
│ [avatar] display_name @name  時刻 │
│ [      ] 本文...                  │
└──────────────────────────────────┘
```

2 カラムのグリッド（`grid-cols-[auto_minmax(0,1fr)]`、`gap-x-2 gap-y-1`）で、グリッド領域は `avatar` / `name` / `content`。

| 要素 | `full` | `compact` |
|---|---|---|
| 文字サイズ | `text-body` | `text-caption` |
| アバター | `w-10`（40px） | `w-6`（24px） |
| padding | `p-2` | `p-2` |

**アバターは `sticky top-0`。** 長い本文をスクロールしても誰の投稿かを見失わない。角は `rounded`、`object-cover`、読み込み前は `bg-secondary`。

**入れ子では padding を落とす。** v0 は `group-[_]/event:p-0`（イベントの中のイベント）と `group-[_]/quote:p-1`（引用）で切り替えている。v1 では `EventView` が入れ子を作るので、**`compact` は自分では padding を持たず、置く側（引用カード・リポスト・返信先）が決める**形にする。

**名前の行** —— `display_name`（`font-500`）+ `@name`（`c-secondary text-caption`）+ 時刻（`c-secondary text-caption text-nowrap`）。名前が無い間は npub の先頭 12 文字。

**時刻は相対ではなく短縮絶対値。** 同日は `HH:mm`、同年は `MM/dd HH:mm`、それ以外は `yyyy/MM/dd HH:mm`（v0 の `dateTimeHuman`）。`title` 属性に完全な日時を入れる（`dateHuman`）。**v0 のこの関数は移植する** —— 表示の仕様そのものであり、プロトコルではない。

**本文の高さ制限。** `MAX_CONTENT_HEIGHT = 400px` を超えたら折り畳み、展開ボタンを出す。`compact` でも同じ（v0 は `small` でも `EventBase` を通る）。

## 4. トークンの描画

v0 の `src/shared/components/RichContents.tsx` が仕様。

本文の器は `break-anywhere whitespace-pre-wrap [line-break:strict] [word-break:normal]`。

| トークン | `full` | `compact` |
|---|---|---|
| `text` | そのまま | 同じ |
| `url`（画像でない） | リンク（`target="_blank" rel="noopener noreferrer"`） | 同じ |
| `url`（画像） | **インライン表示**。`b-1 rounded`、`w-full h-auto`、`object-cover`、読み込み前は `bg-secondary`。押すと元 URL を別タブで開く | **URL のリンクのまま**（画像にしない） |
| `emoji` | インライン画像。行の高さに合わせる | 同じ |
| `hashtag` | リンクの見た目。**押しても何も起きない**（検索カラムが無い、#203/#204） | 同じ |
| `mention` | `@名前`。取得前は npub の先頭 12 文字 | 同じ |

**`compact` で画像を展開しない。** 引用先・返信先・リポスト対象が原寸の画像を並べると、カラムが画像で埋まって元の投稿が見えなくなる。v0 も `showEmbeddings={!props.small}` で同じ判断をしている。

**画像かどうかは `isProbablyImageUrl`（拡張子）で決める。** [ADR-0012](../../adr/0012-external-images-loaded-directly-by-default.md) は「外部画像は既定で直接読み込み、プロキシ経由と非表示は設定で選べる」と決めているが、**設定画面が無いので、このスライスは既定（直接読み込み）だけを実装する。** 設定は #208。

**`mention` の解決。** `npub` / `nprofile` は `ProfileRequests` で名前を引く（`<Profile>` が既にやっている）。`note` / `nevent` は **`compact` の `EventView` として本文の下に置く**（引用と同じ扱い）—— v0 も `quoteByID` を埋め込みにしている。`naddr` は座標の解決経路が無いので「未対応の参照です」のまま。

## 5. 返信先の表示

v0 の `Text.tsx` は `p` タグの全員を「宛先」として列挙するが、**現行 NIP-10 は「返信の `p` タグはスレッド全体の `p` タグを引き継ぐ」と定めている** —— つまり `p` タグの列挙は「この投稿が誰に宛てたか」ではなく「スレッドに参加している全員」になる。**v0 のこの部分は写さない。**

v1 は既に `replyTarget(event)`（`e` タグの `reply ?? root`）を持ち、`NoteFull` が「@name への返信」+ 親の `compact` を出している。**その形を保ち、見た目だけ v0 に合わせる。**

## 6. エラー処理

| 起きること | 扱い |
|---|---|
| 画像 URL が読み込めない | 代替表示を出す。**本文は消さない** |
| `emoji` の画像が読み込めない | `:shortcode:` のテキストに戻す |
| プロフィールが未取得 | npub の先頭 12 文字（v0 と同じ） |
| 本文が空 | 本文の器ごと出さない（骨格だけ残る） |

**レンダラは例外を投げない。** `<For>` の周りに `ErrorBoundary` が無く、1 件が投げるとカラム全体が落ちることは実証済み（[#254 相当](https://github.com/eyemono-moe/streets/issues)、`docs/design/read-layer-followups.md`）。

## 7. テスト

**ユニット（vitest、`createRoot`）**

- `full` / `compact` で文字サイズとアバター寸法が切り替わること
- **`compact` が画像を展開しないこと**（`url` トークンがリンクのまま）
- **`compact` が関連イベントを要求しないこと**（既存の規則。回帰確認）
- 時刻の書式 —— 同日 / 同年 / それ以外の 3 分岐
- プロフィール未取得のとき npub の先頭 12 文字が出ること
- 本文が空のとき器を出さないこと

**E2E**

- 既存の `note` / `note-author` / `note-content` の testid を保つ（既存の e2e が拾っている）
- 画像 URL を含むノートをシードし、`full` で `<img>` が出て `compact` では出ないこと

## 8. 実際に動かして初めて答えられる問い

1. **v0 と並べて見て、同じに見えるか。** 寸法と色はコードから写せるが、実データでの詰まり具合（長い名前、絵文字の連続、画像の縦横比）は見ないと分からない
2. **`compact` で画像を出さない判断が、実際の引用で不足に感じないか**
3. **400px の折り畳みが、カラム幅 400px（`w-100`）に対して妥当か。** v0 のカラム幅は可変（small/medium/large）で、v1 は固定である
