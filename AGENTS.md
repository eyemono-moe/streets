# AGENTS.md

コーディングエージェント向けの入口。会話・コミット・コメント・ドキュメントは日本語。

## 構成

pnpm workspace の 2 パッケージ。

| パッケージ | 中身 |
| --- | --- |
| `packages/core`（`@streets/core`） | Nostr の読み書き。読み取り層 `read/`、接続 `relay/`、イベントの組み立て `nostr/`、書き込み `write/`、署名者 `signer/`、デッキ `deck/` など。UI を持たない |
| `apps/web`（`@streets/web`） | 画面。`@streets/core` だけを参照する |

`apps/web/legacy/` は、前の v1 画面を部品の移植元として一時的に置いているだけ。ビルド・型検査・lint の対象外で、画面を作り終えたら削除する。丸ごと戻さず、必要な部品だけを `src/` へ持ってくる。

用語は [CONTEXT.md](./CONTEXT.md)、後から戻しにくい決定は [docs/adr/](./docs/adr/)。作業に関係する箇所だけを読む。

## 進め方

- **タスクの正は [GitHub Issues](https://github.com/eyemono-moe/streets/issues)。** Issue とチャットでの確認を仕様とし、spec や plan のファイルは作らない
- ADR を書くのは、秘密鍵の境界や永続形式など、後から戻しにくい決定だけ。数行で書く
- **画面の順序と進み具合は [#343](https://github.com/eyemono-moe/streets/issues/343) にある。** 着手前に読み、画面を 1 枚作り終えたらチェックを付けて PR 番号を書く
- 画面は #343 の順に 1 枚ずつ作る。デバッグ用の画面やルートは作らず、診断値は TanStack Devtools のパネル（`apps/web/src/devtools/`）へ出す
- `v1` が開発ブランチ。`main` へ直接マージしない

## デザイン

画面の見た目は、Penpot の Streets ファイルにある **[v1 / redesign](https://design.penpot.app/#/workspace?team-id=3be9e5e1-190f-8090-8008-7ccafe3c749b&file-id=3be9e5e1-190f-8090-8008-7ccb2d4a25bd&page-id=cefceceb-896a-8085-8008-83839412efd3) ページ**に合わせる。

- 同じファイルの「v1 / deprecated」ページは古いので見ない
- Penpot の MCP から読める。ボードの構造や CSS はそこから取り、値を推測で埋めない
- 画面ごとに見るボードは #343 の表にある
- `apps/web/legacy/` の部品もこのデザインを参考に作られている。移植するときは、デザインと食い違っていないか確かめる
- デザインに無いもの（ログイン画面など）は、既存のトークンと部品の見た目に揃える
- 操作が失敗したことは、ボタンの脇ではなく画面のトースト（`src/toast.tsx` の `notifyError`）で知らせる。押した場所ごとに出方を変えない。狭いカラムで行が押し出されて本文が動くのも避ける
- 開閉するもの（ダイアログ・メニュー・ホバーカード・折りたたみ・重ねたカラム・サイドパネル）には動きを付ける。`uno.config.ts` の `motion-fade` / `motion-pop` / `motion-collapse` と `animate-*` を使い、長さは 100〜180ms に収める。`prefers-reduced-motion` は preflight が 0ms に落とすので、部品ごとに分岐を書かない
- Ark UI の開閉する部品は `lazyMount` と `unmountOnExit` を付ける。閉じている間も中身を作ると、投稿の数だけ DOM が増える

## 画面の組み立て

状態と規則を持つ操作（重ねたカラム、デッキのパネル・並べ替え・一時カラム、投稿や返信の送信中・下書き、通知の既読など）は、次の形で書く。

- View は、押されたことをイベントとして上へ渡すだけにする（`src/ui-events.tsx` の `useDispatch`）。状態の置き場を直接触らない
- 状態の遷移は `(state, event) => state` の純粋関数として `@streets/core` に書き、テストする。初期値は共有の定数にせず、呼ぶたびに作る関数にする
- その段（デッキ・カラムなど）が `<Mediates handle>` でイベントを裁定し、遷移の結果を当てる。裁定しないイベントは親の段へ渡る。書き込みやトーストの呼び出しもここで行う
- イベントは判別可能な union（`UiEvent`）に足す。`handle` では `switch (event.type)` で絞り込み、キャストしない
- 段の状態は `createStore` に持ち、遷移の結果を `reconcile` で当てる（配列の要素は `key` で突き合わせる）。signal に丸ごと入れ替えると、`<For>` が要素を作り直して開閉の動きなどが消える
- 上へ渡すのに DOM のイベント（CustomEvent）は使わない。メニューやダイアログは Portal で body の末尾に出るので、元の親まで届かない

それ以外はこう扱う。

- 状態を持たない単発の操作（いいね・リポスト・ブックマーク・リンクのコピーなど）も、イベントとして上へ渡す。裁定する段は `actions` を呼ぶだけでよく、遷移関数は要らない
- 読み取り（store・購読）は、Storybook で全状態を並べたい部品から、読み取る部分と描く部分に分ける（例: `ThreadView` と `ThreadSpineView`）。一律には分けない
- Ark UI の開閉・フォーカス・ホバーの遅延は Ark UI に任せる。アプリの動作が開閉に依存するもの（重ねたカラムの段など）だけ `open` を制御する
- この形になっていない既存の部品（`actions` を直接呼ぶ `ActionBar` など）は #368 で直す

## テスト

- テストは core の純粋なロジック（パース、フィルタ、ストア、イベントの組み立て）に書く
- UI コンポーネントの単体テストは原則書かない。画面の確認は手で動かして行う
- 部品の見た目は Storybook（`apps/web/src/**/*.stories.tsx`）で確認する。ストーリーはテストではなく、リレーに繋がずに固定のイベントを並べるカタログ。署名済みイベントの作り方と読み取り層の差し替えは `apps/web/src/storybook/` にある
- **見た目を変えたら、同じ PR で Storybook も更新する**。ストーリーが無い部品なら追加する。レビューする側が、アプリを立ち上げずに変更を見られる状態にしておく
- ストーリーには普通の状態だけでなく、崩れやすい端（長い本文、空、取得中、読み込めなかった、プロフィールが無い、幅の狭いカラム）も並べる。手で試した端は、その場でストーリーとして残す
- 読み取り層に繋がる画面は、見た目だけの部品を切り出してストーリーにする（例: `ThreadView` に対する `ThreadSpineView`）
- 既存のテストがリファクタの邪魔になり、バグを捕まえていないなら、その場で消してよい

## 検証

```sh
pnpm verify   # biome + 型検査 + テスト + ビルド。CI も同じものを呼ぶ
pnpm fix      # 整形と import 順
```

## 手で触る

```sh
pnpm dev                                          # 5173
pnpm storybook                                    # 6006。部品の見た目を固定のイベントで確認する
docker compose up -d nostr-rs-relay nostr-rs-relay-2   # ローカルリレー 8080 / 8081
pnpm seed:dev                                     # スレッドの各形をローカルリレーへ
```

## 知らないと踏む罠

### `relays: []` は「未指定」ではない

読み取り層では**空配列は「リレー 0 本の明示指定」**で、そこへは何も送られません。`authors: []` も「該当者なし」であって「誰でもよい」ではありません。「まだ分からない」はキーごと省略します。

### Solid: 購読を作る memo に「settle したら変わる値」を読ませない

カラムの `source` を作る memo がウォームアップの結果を読むと、ウォームアップが片付くたびに全カラムの購読が破棄・再作成されます。`followees` / `readRelays` は遅延アクセサで渡し、必要な分岐の中でだけ呼びます。

### Nostr の実装にライブラリを使わない

暗号プリミティブ（noble）以外は自前です（[ADR-0020](./docs/adr/0020-no-nostr-library-noble-primitives-only.md)）。射程は Nostr だけで、それ以外（検証は valibot など）はライブラリを使って構いません。開発用スクリプトの `nostr-tools` は射程外です。

### 秘密鍵をアプリが持たない

署名は NIP-07 / NIP-46 の署名者へ委譲します（[ADR-0008](./docs/adr/0008-signer-only-key-handling.md)）。例外は NIP-46 の通信専用 client key だけです（[ADR-0031](./docs/adr/0031-nip46-session-key-boundary.md)）。

### 劣化を隠さない。ただし、取得中を失敗として見せない

ユーザーが行動できる異常だけを画面に出します。取得中と取得失敗を区別せずに「取得できませんでした」と出すのは違反です。

### 同時に開く WebSocket は 30 本まで

publish 用の別経路を作らず、`ConnectionPool` 一本に集約します。明示リレー（`NostrSource.relays`）は予算都合で落とされず必ず開かれるので、流し込む URL の件数に注意します。

### UI プリミティブは Ark UI

メニュー・ダイアログ・ポップオーバーは `@ark-ui/solid` を使います。

**閉じている部品には `hidden` 属性が付くだけ**なので、`flex` や `grid` を当てると `display` が勝って閉じなくなります（#348 で踏みました）。`uno.config.ts` の preflight で `[hidden] { display: none !important }` を入れて塞いでありますが、独自の CSS で `display` を上書きするときは同じ罠に注意します。

**重ね順は z-index の数字で決めない。** Ark UI の Positioner は `z-index: var(--z-index)` を inline で当てるので、クラスで `z-80` などを付けても効きません。`#root` を `isolation: isolate` にしてあり、アプリの中の重ね順はアプリの中に閉じます。ポップアップやダイアログは body の末尾へ出るので、DOM の順だけでアプリより上に乗ります。アプリの中で重ねるもの（カラムの重なりなど）も、後ろに置いたものが上に来る DOM の順で決め、中の重ね順が漏れないように `isolate` で区切ります。
