# プロフィールカードとホバー — 設計

## 0. このスライスは何のためにあるか

`<Profile>`（`src/routes/v1/Profile.tsx`）は名前を 1 行出すだけで、kind:0 が持つ `about` / `banner` / `nip05` / `website` はどこにも出ていない。v1 には**人を面として見せる場所が 1 つも無い**。

あわせて、本文中のイベント参照の置き場所を直す。今は本文の `nostr:note` を捨てて引用をすべて最下部へ寄せており、「この投稿 nostr:note1… が面白い」のような文が途中で切れる（4.2 節）。

前提知識は [CONTEXT.md](../../../CONTEXT.md)、決定は [docs/adr/](../../adr/)、スライスの記録は [read-layer-followups.md](../../design/read-layer-followups.md)。残タスクは [GitHub Issues](https://github.com/eyemono-moe/streets/issues)（[#275](https://github.com/eyemono-moe/streets/issues/275)）。

## 1. v0 は「デザインの一次情報」であり「プロトコルの一次情報ではない」

見た目・レイアウト・情報の並びは v0 の `src/features/User/components/Profile.tsx` と `ProfileHoverContent.tsx` が仕様。NIP の解釈は NIPs 本文と `src/core/nostr/` を正とする。

**このスライスで見つけた v0 の取りこぼし（写してはいけない）:**

| v0 | 何が誤りか |
|---|---|
| `parseTextContent(p.parsed.about, [])` とタグを捨てている | [NIP-30](https://github.com/nostr-protocol/nips/blob/master/30.md) はカスタム絵文字が kind:0 の `name` / `about` にも適用されると定めている。タグを捨てると `about` の `:shortcode:` が絵文字にならない |

## 2. 範囲

**含む。** プロフィールカード（kind:0 を面として見せる 1 コンポーネント）。ノートの著者名とアバターに掛けるホバー。`about` のトークン化。**本文中のイベント参照をその位置に埋め込むこと**（[#284](https://github.com/eyemono-moe/streets/issues/284)、4.2 節）。`@ark-ui/solid` の 4.10.1 → 5 系への更新と、v1 の UI プリミティブを ark-ui に決める ADR。

**含まない。**

| 落とすもの | 理由 |
|---|---|
| フォロー / フォロー解除 | kind:3 の読み取り→編集→署名→publish が要る。取りこぼすと**他クライアントで付けたフォローを消す**事故になるので単独で扱う |
| フォロー数 / フォロワー数 | フォロワー数は「その人を含む kind:3 を全部数える」で、専用の取得経路が要る |
| NIP-05 の検証 | `/.well-known/nostr.json` への HTTP という新しい外部経路。キャッシュ・失敗の扱い・プライバシー（ドメインへ閲覧を知らせる）を別に決める |
| `lud16` の表示 | v0 の面が出していない |
| ユーザー詳細カラム | [#205](https://github.com/eyemono-moe/streets/issues/205)。カードはそこでも使う想定だが、カラムの構成（1 カラム = 複数セクション）はこのスライスでは決めない |
| イベント参照を押してカラムを開くこと | 開く先のカラム（1 イベントとその周辺を見せる形）が無い。押せるようにするのはそれができてから |

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
  eventRefs: "text" | "embed";
};
```

`Note.tsx` は `content={props.event.content} tags={props.event.tags}` を渡すだけになる。カードは `about` と kind:0 の `tags` を渡す。これで `about` の中の URL・ハッシュタグ・`nostr:npub` の言及・**カスタム絵文字**が本文と同じ規則で描かれる（v0 より正しくなる。1 節）。

`variant` はカードでは `"compact"`。ホバーカードの中で画像がインライン展開されると、360px の枠を画像が埋める。

### 4.1 `eventRefs` —— イベント参照をどう描くか

**軸は「テキストで描くか、イベントを埋め込むか」の 2 つだけ。**

| 値 | 挙動 |
|---|---|
| `"text"` | `note` / `nevent` / `naddr` を**短縮したテキストで残す** |
| `"embed"` | `note` / `nevent` を**その位置に `EventView variant="compact"` で埋め込む**。`naddr` は座標の解決経路が無いので「未対応の参照です」 |

| 呼び出し側 | 値 | 理由 |
|---|---|---|
| `NoteFull` | `"embed"` | 4.2 節 |
| `NoteCompact` | `"text"` | compact は関連イベントを一切要求しない。埋め込むとその規則が壊れる |
| `ProfileCard` | `"text"` | カードは人の紹介であり、他人のノートを展開すると 360px の枠が引用で埋まる |

**ノート側の配線は `NoteBody` の 1 行にする。** `NoteFull` と `NoteCompact` は骨格 (`NoteBody`) を共有しており、`NoteContent` を描いているのはその 1 箇所だけである。そこで `variant` から `eventRefs` を決める (`full` なら `"embed"`、`compact` なら `"text"`)。2 箇所へ配ると、片方だけ直す変更が入りうる。

**「何も描かない」という値は置かない。** 以前の実装は本文中の `nostr:note` を捨てていたが、それは「引用は `NoteFull` がまとめて描くから」という**実装の都合**であって、読み手にとっての選択肢ではない。捨てると「この投稿 nostr:note1… が面白い」のような文が途中で切れる。

**省略可能にしない。** 新しい呼び出し側が決めずに書けると、黙って文が欠ける形が再発する。必須にして型で止める。

`"text"` の見た目は `note1abcdefgh…`（bech32 の先頭 12 文字 + `…`、`c-secondary`）。`title` 属性に `nostr:` を含む元の文字列を丸ごと入れる。**押せそうには見せない**（5 節と同じ理由）。

**入れ子は止まる。** `"embed"` が埋め込むのは `compact` であり、`NoteCompact` は `"text"` を渡す。したがって埋め込みの中に埋め込みは生まれない。

### 4.2 `NoteFull` の引用の置き場所

**本文に現れた引用はその位置に、`q` タグにしかない引用は最下部に。** [#284](https://github.com/eyemono-moe/streets/issues/284) の判断をこのスライスで実装する（`eventRefs` を 2 択にすると、本文側の置き場所を決めないままにはできないため）。

今の `NoteFull` は `q` タグと本文の `nostr:` の**和集合を全部まとめて最下部**に描いている。これを次の 2 つに分ける。

- 本文中に `nostr:note` / `nevent` として現れた id —— `NoteContent` が `"embed"` でその位置に描く
- **本文には現れず** `q` タグにだけある id —— `NoteFull` が今までどおり最下部に描く

**同じイベントが 2 回描かれないことがこの分割の要点。** 今の `contentQuoteTargets`（`src/core/nostr/event-refs.ts`）は「本文にあって `q` タグに**無い**もの」を返す —— `q` タグ側を優先して重複を避ける形である。新しい規則は**本文側が優先**なので、向きがちょうど逆になる。

- 本文の位置に描くものは `MentionToken` がトークンから直接得るので、専用のヘルパは要らない
- 最下部に描くものは `quoteTargets(event)` のうち**本文の言及に含まれない**もの。これは今の `contentQuoteTargets` の裏返しなので、**同じ関数を置き換える**（`tagOnlyQuoteTargets` として書き直し、`contentQuoteTargets` は消す）。2 つ残すと、次に読む人がどちらが今の規則か分からなくなる
- `q` タグの座標形式（`naddr` 相当、`quoteTargets` が `form: "address"` で返すもの）**も本文と突き合わせる**。本文の `nostr:naddr1…` は `eventKind` / `pubkey` / `identifier` を持つので、`q` タグの `<kind>:<pubkey>:<identifier>` を復元できる（当初この節は「突き合わせられない」と書いていたが誤りで、Task 4 のレビューで本文と最下部に「未対応の参照です」が 2 回出ることが見つかった）

**根拠（2026-08-15 に一次情報を確認）。** [NIP-18](https://github.com/nostr-protocol/nips/blob/master/18.md) は「`nevent` / `note` / `naddr` への言及は `q` タグへ変換されなければならない」と定める一方、[NIP-27](https://github.com/nostr-protocol/nips/blob/master/27.md) は「NIP-18 の `q` タグを付けるかどうかは任意」と書いており、**両者は食い違っている**。したがって本文と `q` タグは両方向にずれうる —— 本文にあってタグに無い形も、タグにあって本文に無い形も現実に起きる。上の 2 分割はそのどちらも落とさない。NIP-27 は「言及先イベントのプレビューを見せる」ことを明示的に許している。

件数の上限はどちらの NIP にも無い。

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
- **`eventRefs: "text"` で `note` / `nevent` / `naddr` が短縮テキストになる**
- **`eventRefs: "embed"` で `note` / `nevent` がその位置に `compact` の `EventView` になる**
- `eventRefs: "embed"` でも `naddr` は「未対応の参照です」

`NoteFull` の引用の置き場所（4.2 節）:
- **本文に現れた引用が本文の位置に出て、最下部には出ない**（同じイベントが 2 回描かれない）
- **`q` タグにしか無い引用が最下部に出る**
- 本文にあって `q` タグに無い引用も本文の位置に出る（NIP-27 に従ったクライアントの投稿）
- **`NoteCompact` の本文では埋め込まれない**（テキストになる）

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
