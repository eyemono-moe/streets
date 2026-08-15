# プロフィールカードとホバー — 設計

## 0. このスライスは何のためにあるか

`<Profile>`（`src/routes/v1/Profile.tsx`）は名前を 1 行出すだけで、kind:0 が持つ `about` / `banner` / `nip05` / `website` はどこにも出ていない。v1 には**人を面として見せる場所が 1 つも無い**。

前提知識は [CONTEXT.md](../../../CONTEXT.md)、決定は [docs/adr/](../../adr/)、スライスの記録は [read-layer-followups.md](../../design/read-layer-followups.md)。残タスクは [GitHub Issues](https://github.com/eyemono-moe/streets/issues)（[#275](https://github.com/eyemono-moe/streets/issues/275)）。

## 1. v0 は「デザインの一次情報」であり「プロトコルの一次情報ではない」

見た目・レイアウト・情報の並びは v0 の `src/features/User/components/Profile.tsx` と `ProfileHoverContent.tsx` が仕様。NIP の解釈は NIPs 本文と `src/core/nostr/` を正とする。

**このスライスで見つけた v0 の取りこぼし（写してはいけない）:**

| v0 | 何が誤りか |
|---|---|
| `parseTextContent(p.parsed.about, [])` とタグを捨てている | [NIP-30](https://github.com/nostr-protocol/nips/blob/master/30.md) はカスタム絵文字が kind:0 の `name` / `about` にも適用されると定めている。タグを捨てると `about` の `:shortcode:` が絵文字にならない |

## 2. 範囲

**含む。** プロフィールカード（kind:0 を面として見せる 1 コンポーネント）。ノートの著者名とアバターに掛けるホバー。`about` のトークン化。`@ark-ui/solid` の 4.10.1 → 5 系への更新と、v1 の UI プリミティブを ark-ui に決める ADR。

**含まない。**

| 落とすもの | 理由 |
|---|---|
| フォロー / フォロー解除 | kind:3 の読み取り→編集→署名→publish が要る。取りこぼすと**他クライアントで付けたフォローを消す**事故になるので単独で扱う |
| フォロー数 / フォロワー数 | フォロワー数は「その人を含む kind:3 を全部数える」で、専用の取得経路が要る |
| NIP-05 の検証 | `/.well-known/nostr.json` への HTTP という新しい外部経路。キャッシュ・失敗の扱い・プライバシー（ドメインへ閲覧を知らせる）を別に決める |
| `lud16` の表示 | v0 の面が出していない |
| ユーザー詳細カラム | [#205](https://github.com/eyemono-moe/streets/issues/205)。カードはそこでも使う想定だが、カラムの構成（1 カラム = 複数セクション）はこのスライスでは決めない |
| 本文中の `nostr:note` をリンク位置で描くこと | [#284](https://github.com/eyemono-moe/streets/issues/284)。**このスライスは `about` の中だけ**を変える |

## 3. カードの構成

v0 の縦の並びをそのまま写す。

```
┌────────────────────────────┐
│ [       banner        ]    │  ← 無ければ枠だけ
│ ┌────┐                     │
│ │icon│                     │  ← banner に食い込む (負の margin)
│ └────┘                     │
│ display_name               │  ← font-700 / text-h3 / line-clamp-3
│ @name                      │  ← c-secondary / text-caption
│ ? example.com  🔗 site     │  ← NIP-05 (未検証) と website
│ about ...                  │  ← トークン化して描く。overflow-y-auto
└────────────────────────────┘
```

**フォローボタンを落とすので、v0 がボタンのために空けていた右余白（`mr-26` / `mr-34`）も消す。** アバターの負の margin（`mb--16` / `mb--24`、`mt-24` / `mt-32`）は v0 の値をそのまま使う。

**寸法は 1 つだけ作る。** v0 は `small` の有無で 2 段階（banner `max-h-24`/`max-h-50`、アイコン `h-24`/`h-32`）を持つが、**このスライスが使うのはホバーの中だけ**なので、小さいほう（v0 の `small` 相当）だけを実装する。#205 が大きいほうを必要としたときに、そこで足す —— 使われないモードを先に書くと、実際に使うときまで誰も正しさを確かめられない。

**名前のフォールバックは `<Profile>` と同じ規則。** `display_name` → `name` → npub の先頭 12 文字。`encodeBech32` は 64 桁 hex 以外で投げるので、`Profile.tsx` の `fallbackLabel` と同じ try/catch を通す（**この関数を `Profile.tsx` から切り出して共有する**。同じ規則を 2 箇所に書かない）。

### 3.1 NIP-05 の行

v0 の `Nip05Badge.tsx` が仕様。**検証しないので常に「未検証」の状態を出す** —— `i-material-symbols:question-mark-rounded`（`c-secondary`）＋ `nip05` の**ドメイン部分**（`@` の後ろ）。`nip05` が無ければ行ごと出さない。

**検証済みの青バッジは出さない。** 検証していないのに出すと嘘になる。

### 3.2 website の行

`i-material-symbols:link-rounded` ＋ `<a target="_blank" rel="noopener noreferrer">`。**`http:` / `https:` 以外はリンクにせず、素のテキストで出す** —— `javascript:` を踏ませない。

## 4. `about` の描画

**`NoteContent` を作り直さず、受け取る形を変えて再利用する。**

```ts
export type NoteContentProps = {
  content: string;
  tags: readonly string[][];
  variant: EventVariant;
  eventRefs: "omit" | "text";
};
```

`Note.tsx` は `content={props.event.content} tags={props.event.tags}` を渡すだけになる。カードは `about` と kind:0 の `tags` を渡す。これで `about` の中の URL・ハッシュタグ・`nostr:npub` の言及・**カスタム絵文字**が本文と同じ規則で描かれる（v0 より正しくなる。1 節）。

`variant` はカードでは `"compact"`。ホバーカードの中で画像がインライン展開されると、360px の枠を画像が埋める。

### 4.1 `eventRefs` —— イベント参照をどう扱うか

**`MentionToken` が `note` / `nevent` / `naddr` に何を出すかを、呼び出し側が決める。**

| 値 | 誰が使うか | 挙動 |
|---|---|---|
| `"omit"` | ノート本文 | `note` / `nevent` は**何も描かない**（引用は `NoteFull` がまとめて描く）。`naddr` は今までどおり「未対応の参照です」 |
| `"text"` | プロフィールカード | 3 種類とも**短縮したテキストで残す** |

**省略可能にしない。** 新しい呼び出し側が「どちらか」を決めずに書けてしまうと、`about` のときのように黙って文が欠ける。必須にして型で止める。

`"text"` の見た目は `note1abcdefgh…`（bech32 の先頭 12 文字 + `…`、`c-secondary`）。`title` 属性に `nostr:` を含む元の文字列を丸ごと入れる。**押せそうには見せない**（5 節と同じ理由）。

**カードに引用カードは生やさない。** カードは面ではなく人の紹介であり、そこに他人のノートを展開すると 360px の枠が引用で埋まる。

## 5. ホバー

**著者名とアバターの両方に掛ける**（v0 は名前だけだが、アイコンにカーソルを合わせて何も出ないのは不自然）。本文中の言及・リポスト/リアクションの見出し・リアクション一覧の名前には**掛けない** —— `<Profile>` 自体に仕込むと、カードの中の名前にもカードが出る入れ子になる。

**トリガーは押せそうに見せない。** `cursor-pointer` も `hover:underline` も付けない。押しても何も起きないため —— ハッシュタグで既に採った判断と同じ（押せないものを押せそうに見せると「まだ無い」と「壊れている」の区別が付かない）。[#205](https://github.com/eyemono-moe/streets/issues/205) が入った時点で両方を足してクリックを繋ぐ。

### 5.1 アバターの `sticky` を壊さない

`Avatar.tsx` の枠は `sticky top-0` で、本文が伸びてもアイコンが見えたままになる。**トリガーがアバターを包む新しい要素を作ると、`sticky` はその小さな包みの中で動くことになり、効かなくなる。** トリガーはアバターの要素**そのもの**でなければならない（ark-ui の `asChild` で既存要素へ props を合流させる）。

これは jsdom では検出できない（CSS を評価しない）ので、**トリガーがアバターの要素そのものに合流していること**を DOM の形で主張する。

## 6. ホバーの土台と ark-ui

`@ark-ui/solid` の `HoverCard`（`Root` / `Trigger` / `Positioner` / `Content`）を使う。位置決めと画面端での反転は zag.js が持っている。スタイルは UnoCSS のまま、v0 の `ProfileHoverContent` のクラス（`b-1 rounded-2 bg-primary shadow-lg`、`max-h-[min(calc(100vh-32px),360px)]`、`max-w-[min(calc(100vw-32px),360px)]`）を写す。

**`@ark-ui/solid` を 4.10.1 から 5.38.1（2026-08-15 時点の最新）へ上げる。** メジャーを 1 つ跨ぐが、リポジトリ内の利用は v0 の `src/features/CreatePost/components/PostInput.tsx`（`FileUpload`）1 箇所だけで、影響範囲は閉じている。**このスライスの最初のタスクで上げる** —— 使い始めてから上げると、書いたばかりのコードを移行することになる。

**ADR-0028 を書く。** 「v1 の UI プリミティブは `@ark-ui/solid` を使う」。v0 は `@kobalte/core` を使っており、**両方が依存に入っている状態**なので、次にダイアログやメニューを作る人がどちらを選ぶか迷う。射程は v1 のみ（v0 は [#253](https://github.com/eyemono-moe/streets/issues/253) で消える）。

## 7. 取得

**新しい取得経路を作らない。** カードが出す情報はすべて kind:0 の中にあり、著者名（`<Profile>`）とアイコン（`<Avatar>`）が既に `useProfileData` 経由で同じ kind:0 を要求している。カードは同じフックを呼ぶだけで、**ホバーしたから増える通信は無い**。

`parseProfileContent`（`src/routes/v1/profile-data.ts`）に 4 つ足す。型が違えば `undefined` へ倒す今の作りをそのまま延長する。

| フィールド | NIP-24 の名前 |
|---|---|
| `about` | `about` |
| `banner` | `banner` |
| `nip05` | `nip05` |
| `website` | `website` |

## 8. エラー処理

| 起きること | 扱い |
|---|---|
| kind:0 がまだ届いていない | カードは出す。名前は npub の先頭 12 文字、banner とアイコンは枠だけ |
| `banner` / `picture` の画像が落ちた | 枠だけ残す（`<img>` を消す）。`Avatar` の既存の作りと同じ |
| `website` が `http(s)` でない | リンクにせず素のテキスト |
| `nip05` が `@` を含まない | 行を出さない（ドメインを取り出せない） |
| `about` が長い | カードの `max-h` で切り、中でスクロール |
| `about` が空 | 領域ごと出さない |

## 9. テスト

**ユニット（vitest）**

`parseProfileContent`:
- `about` / `banner` / `nip05` / `website` を取り出す
- **それぞれの型が文字列でなければ `undefined`**（数値・オブジェクト・null）
- 既存の `name` / `display_name` / `picture` が壊れていない

`NoteContent`（受け取る形の変更）:
- `content` と `tags` から今までと同じトークンが出る
- **`eventRefs: "omit"` で `note` / `nevent` が描かれない**（今の挙動）
- **`eventRefs: "text"` で `note` / `nevent` / `naddr` が短縮テキストになる**

`ProfileCard`:
- kind:0 が無くても npub の先頭 12 文字で描かれる
- `about` のカスタム絵文字が `<img>` になる（**v0 が取りこぼしている点**）
- `about` の `nostr:note` がテキストとして残る
- `website` が `javascript:` のときリンクにならない
- `nip05` が無ければ行を出さない
- **検証済みバッジを出さない**（未検証マークであること）

`ProfileHover`:
- **トリガーがアバターの要素そのもの**（`sticky` を壊す包みを作っていない）
- トリガーに `cursor-pointer` / `hover:underline` が無い

**E2E**
- 著者名にホバーするとカードが出て、`about` の本文が読める
- アイコンにホバーしても出る

## 10. 実際に動かして初めて答えられる問い

1. **ホバーの開閉の遅延が v0 と揃っているか。** ark-ui と kobalte は既定値が違う可能性があり、実際に触らないと「すぐ出すぎる／出ない」は分からない
2. **カラムの `overflow` の中でカードが切れないか。** カラムは横スクロールする器の中にあり、`Positioner` が portal へ出ていても親の `contain` / `transform` に捕まることがある
3. **`content-visibility: auto` の中のトリガーでホバーが効くか。** 段階的レンダリングで `<li>` に `content-visibility` を掛けており、画面外の要素の扱いが実機で変わりうる
