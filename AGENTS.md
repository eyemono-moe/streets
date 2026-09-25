# AGENTS.md

コーディングエージェント向けの入口。会話・コミット・コメント・ドキュメントは日本語。

## 構成

pnpm workspace の 2 パッケージ。

| パッケージ | 中身 |
| --- | --- |
| `packages/core`（`@streets/core`） | Nostr の読み書き。読み取り層 `read/`、接続 `relay/`、イベントの組み立て `nostr/`、書き込み `write/`、署名者 `signer/`、デッキ `deck/` など。UI を持たない |
| `apps/web`（`@streets/web`） | 画面。`@streets/core` だけを参照する |

用語は [CONTEXT.md](./CONTEXT.md)、後から戻しにくい決定は [docs/adr/](./docs/adr/)。作業に関係する箇所だけを読む。

## 進め方

- **タスクの正は [GitHub Issues](https://github.com/eyemono-moe/streets/issues)。** Issue とチャットでの確認を仕様とし、spec や plan のファイルは作らない
- 着手前に Issue だけでなく、その Issue を進めている open PR も見る。Issue が開いたまま、複数の PR に分けて作業していることがある
- ADR を書くのは、秘密鍵の境界や永続形式など、後から戻しにくい決定だけ。数行で書く
- Issue には優先度（`P1`〜`P3`）のラベルを付ける。何から手を付けるかは優先度で決める
- デバッグ用の画面やルートは作らず、診断値は TanStack Devtools のパネル（`apps/web/src/devtools/`）へ出す
- **作業は `main` から切り、`main` へ PR を出す。** `main` に入れただけでは本番は変わらず、本番はタグで決まる（[docs/release.md](./docs/release.md)）
- PR の `Closes #N` は `main` へのマージで Issue を閉じる

## デザイン

画面の見た目は、Penpot の Streets ファイルにある **[v1 / redesign](https://design.penpot.app/#/workspace?team-id=3be9e5e1-190f-8090-8008-7ccafe3c749b&file-id=3be9e5e1-190f-8090-8008-7ccb2d4a25bd&page-id=cefceceb-896a-8085-8008-83839412efd3) ページ**に合わせる。

- 同じファイルの「v1 / deprecated」ページは古いので見ない
- Penpot の MCP から読める。ボードの構造や CSS はそこから取り、値を推測で埋めない
- 画面ごとに見るボードは [#343](https://github.com/eyemono-moe/streets/issues/343) の表にある（v1 の画面を作ったときの対応表）
- デザインに無いもの（ログイン画面など）は、既存のトークンと部品の見た目に揃える
- ボタン・排他の選択（トグルグループ）・スイッチ・色を選ぶ欄・保存先のヒントは、`src/ui/` の primitive を使い、画面ごとに書かない。足りない形は primitive に足して、`UI/*` のストーリーで単体で見られるようにする
- 文字を打つ欄は `src/ui/TextField.tsx` の `textInputClass` を使う。角は `rounded-2`、焦点は `focus-visible:ring-2 focus-visible:ring-accent-5`、高さは `h-9`。角を丸めきる（`rounded-full`）のは**その場で絞り込む検索窓だけ**（デッキの検索欄、絵文字ピッカーの検索欄）。設定で値を足す・変える欄は、1 行で横に並べるものも含めてすべて四角にする
- フォームの項目名（スイッチの名前・入力欄の名前など）は `truncate` で切らず、折り返す。切れると何を変えるのか分からなくなる。切ってよいのは、切れても中身が分かるもの（投稿の本文・人の名前・URL の続きなど）だけ
- 意味を持つ色は、色の値や `red-500` のような色の名前で書かない。`uno.config.ts` の意味の名前（`danger`・`danger-subtle`・`status-ok`・`status-warn`・`status-off`）で書く（`c-danger`・`border-danger`・`bg-status-ok`・`stroke-status-ok` など）。値は Penpot の Color Mode に合わせてライト／ダークを preflight の変数に置いてある。新しい意味が要るときは、Penpot にトークンを足してから名前を足す
- ボタンは「押すと何かが起きる」ものだけに使う。入り切りは `Switch`、いくつかから 1 つを選ぶのは `SegmentedControl` にし、ボタンの色で状態を表さない。組み合わせに選べないもの（読み込みも書き込みもしない、など）があるなら、入り切りを並べず、選べる組だけを選択肢にする
- 消す操作はアイコンを使い分ける。そのもの自体が無くなる（投稿・カラムの削除）はゴミ箱、一覧から外すだけでそのものは残る（リレーを一覧から外す、ミュートを解く）は ⊖（`do-not-disturb-on-outline-rounded`）、表示や入力を空に戻す・閉じるは ×
- 設定の説明は、Nostr の仕組みを知らない人にも分かる言葉で書く（「kind:10002」「NIP-65」のような語を説明の主語にしない）。保存先（この端末／アカウント）は各項目の名前の横に `StorageHint` で示す
- 「保存」を押すフォーム（プロフィールなど）に書きかけがある間は、それを含むダイアログを閉じさせない。閉じようとしたら、そのページへ切り替え、保存の欄まで送って揺らし、「保存するか、元に戻してから閉じてください」と出す。黙って閉じて書きかけを捨てることも、黙って残すこともしない。タブを閉じる・再読み込みも `beforeunload` で確かめる。書きかけは段（Mediator）に持ち、閉じる要求（`deck/close-settings`）をその段で止める
- 操作が失敗したことは、ボタンの脇ではなく画面のトースト（`src/toast.tsx` の `notifyError`）で知らせる。押した場所ごとに出方を変えない。狭いカラムで行が押し出されて本文が動くのも避ける
- リレーへの書き込みは、`src/write-progress.ts` の `trackWrites`／`trackReplaces` に何を書いたか（「リアクション」など）を添えて通す。設定で進み具合を出しているときは、1 回の書き込みにつき 1 枚のトーストがリレーごとの結果を出し、失敗もそこで知らせる（同じ失敗の `notifyError` は出ない）。`Writer` を直に呼ぶと、その書き込みは進み具合に出ない
- 開閉するもの（ダイアログ・メニュー・ホバーカード・折りたたみ・重ねたカラム・サイドパネル）には動きを付ける。`uno.config.ts` の `motion-fade` / `motion-pop` / `motion-collapse` と `animate-*` を使い、長さは 100〜180ms に収める。`prefers-reduced-motion` は preflight が 0ms に落とすので、部品ごとに分岐を書かない
- Ark UI の開閉する部品は `lazyMount` と `unmountOnExit` を付ける。閉じている間も中身を作ると、投稿の数だけ DOM が増える

## 画面の組み立て

状態と規則を持つ操作（重ねたカラム、デッキのパネル・並べ替え・一時カラム、投稿や返信の送信中・下書き、通知の既読など）は、次の形で書く。

- View は、押されたことをイベントとして上へ渡すだけにする（`src/ui-events.tsx` の `useDispatch`）。状態の置き場を直接触らない
- 状態の遷移は `(state, event) => state` の純粋関数として `@streets/core` に書き、テストする。初期値は共有の定数にせず、呼ぶたびに作る関数にする
- その段（デッキ・カラムなど）が `<Mediates handle>` でイベントを裁定し、遷移の結果を当てる。裁定しないイベントは親の段へ渡る。書き込みやトーストの呼び出しもここで行う
- イベントは判別可能な union（`UiEvent`）に足す。`handle` では `switch (event.type)` で絞り込み、キャストしない
- 段の状態は `createStore` に持ち、遷移の結果を `reconcile` で当てる（配列の要素は `key` で突き合わせる）。signal に丸ごと入れ替えると、`<For>` が要素を作り直して開閉の動きなどが消える
- 遷移関数は、状態の中の配列やオブジェクトを別の場所へ移すとき作り直す（`saving: [...state.pending]`）。`reconcile` は元の配列をその場で書き換えるので、同じ配列を 2 か所に置くと、片方を空にしたときにもう片方も空になる。`unwrap(state)` で取ったオブジェクトも、`reconcile` の後には当てた後の値に変わっている。当てる前の値で判断したいときは、当てる前に読んで判断を済ませる
- 上へ渡すのに DOM のイベント（CustomEvent）は使わない。メニューやダイアログは Portal で body の末尾に出るので、元の親まで届かない

それ以外はこう扱う。

- 状態を持たない単発の書き込み（いいね・リポスト・ブックマーク・フォローなど）も、イベントとして上へ渡す（`ActionEvent`）。`src/actions-mediator.tsx` が `actions` を呼び、送っている間の二重送信を防ぎ、失敗をトーストに出す。View は `useSending` で押せない見た目にするだけで、遷移関数は要らない
- 読み取り（store・購読）は、Storybook で全状態を並べたい部品から、読み取る部分と描く部分に分ける（例: `ThreadView` と `ThreadSpineView`）。一律には分けない
- Ark UI の開閉・フォーカス・ホバーの遅延は Ark UI に任せる。アプリの動作が開閉に依存するもの（重ねたカラムの段など）だけ `open` を制御する
- 開くまで要らない重い部品（設定・案内・切り抜き・Zap などのダイアログ）は、`src/lazy-part.tsx` の `lazyPart` で別のファイルに分ける。開閉の動きがあるものは `onceTrue` で一度開いたら残し、開くまで待たせたくないものは `whenIdle` で先読みする。Solid の `lazy` は読めなかった結果を覚えるので使わない

### カラムを足す

- カラムの種類の知識は 2 つの表にだけ書く。core の `deck/column-kinds.ts`（保存の形・題名・流れる kind・ミュート・警告）と、web の `columns/column-views.tsx`（アイコン・副題・中身・その種類だけの設定）。表は種類をキーにした対応表なので、種類を足すと書き忘れが型検査で落ちる。`source.kind` で分岐する場所をほかに作らない
- 中身は `columns/blocks/` のブロックを組み合わせて書く。取るものは `deck/column-sources.ts` の関数で作り、`() => NostrSource | undefined` で渡す。`undefined`（まだ分からない）の間は購読を張らない
- ブロックはカラムの種類を見ない。見せ方の設定は `useColumnScope()` から読み、セクションは `createBlockSection` で作る（診断値と、警告のための状態がカラムへ届く）
- イベントを 1 件ずつ `Event` に渡せるものは `EventList` を使う。まとめる・集計する・取り出す・木にするときだけ専用のブロックを足す

## テスト

- テストは core の純粋なロジック（パース、フィルタ、ストア、イベントの組み立て）に書く
- UI コンポーネントの単体テストは原則書かない。画面の確認は手で動かして行う
- E2E（`e2e/`、Playwright）は、ふつうの人がする主な操作の流れ（ログイン・投稿・リアクション・カラムの編集など）が通ることだけを守る。見た目や端の状態は E2E で見ず、Storybook で見る。書き方は [e2e/README.md](./e2e/README.md)
- 部品の見た目は Storybook（`apps/web/src/**/*.stories.tsx`）で確認する。ストーリーはテストではなく、リレーに繋がずに固定のイベントを並べるカタログ。署名済みイベントの作り方と読み取り層の差し替えは `apps/web/src/storybook/` にある
- メディアの URL を本文に入れるストーリーでは、import した fixture のパスを `new URL(asset, location.href).href` で絶対 URL にする。本文の URL パーサーは `http(s)` で始まるものだけを拾う
- **見た目を変えたら、同じ PR で Storybook も更新する**。ストーリーが無い部品なら追加する。レビューする側が、アプリを立ち上げずに変更を見られる状態にしておく
- ストーリーには普通の状態だけでなく、崩れやすい端（長い本文、空、取得中、読み込めなかった、プロフィールが無い、幅の狭いカラム）も並べる。手で試した端は、その場でストーリーとして残す
- 読み取り層に繋がる画面は、見た目だけの部品を切り出してストーリーにする（例: `ThreadView` に対する `ThreadSpineView`）
- 既存のテストがリファクタの邪魔になり、バグを捕まえていないなら、その場で消してよい

## 検証

```sh
vp run verify                        # vp check（整形・lint・型検査）+ knip + テスト + ビルド。CI も同じものを呼ぶ
vp run knip                          # 使われていないファイル・export・依存を探す。見つかると落ちる
vp check --fix                       # 整形と import 順、lint の自動修正
vp run @streets/web#storybook:build  # ストーリーを変えたとき。verify には含まれない
vp run @streets/web#build:analyze    # チャンクの中身を apps/web/stats/chunks.html に描く
vp run e2e                           # E2E。nak が要る。verify には含まれず、CI では別のジョブで走る
```

- コマンドは `vp` から呼び、`pnpm` を直に呼ばない。スクリプトは `vp run <名前>`、パッケージのものは `vp run <パッケージ>#<名前>`、全パッケージは `vp run -r <名前>`、依存の追加は `vp add`。pnpm は `vp` が `packageManager` の版で裏で使う
- ツールチェーンは Vite+（`vp`）。整形は Oxfmt、lint は Oxlint、型検査は `vp check` が tsgo で行う。設定はルートの `vite.config.ts` の `fmt` / `lint` にまとめてあり、パッケージごとには置かない
- コミット時に、ステージした分へ `vp check --fix` が走る（`.vite-hooks/pre-commit`）。`vp install` の `prepare` で有効になる
- knip が報告したものは消す。テストや Storybook のストーリーから使われているものは使われているとみなす。わざと残すものは `knip.jsonc` に理由を添えて書く
- lint を 1 か所だけ止めるときは `// oxlint-disable-next-line <規則> -- <理由>` と書く。JSX の中では `{/* … */}` で包む。使われていない止め書きは lint が落とす
- pnpm は公開から 1 日経っていない版を入れない（`minimumReleaseAge`）。依存を上げて入らないときは、1 日前までの版を指定する

## 手で触る

```sh
vp run dev                                        # 5173
vp run storybook                                  # 6006。部品の見た目を固定のイベントで確認する
docker compose up -d nostr-rs-relay nostr-rs-relay-2   # ローカルリレー 8080 / 8081
vp run seed:dev                                   # スレッドの各形をローカルリレーへ
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

**ポップオーバーの Trigger は `src/ui/PopoverTrigger.tsx` を使い、`Popover.Trigger` を直に書かない。** Ark UI の Trigger は開いている間 `aria-controls="false"` を出すので、ダイアログの中で開いたポップオーバーの入力欄（絵文字ピッカーの検索欄など）へフォーカスを移すと、ダイアログのフォーカストラップが奪い返します（#559 と、設定ダイアログで 2 回踏みました）。

**重ね順は z-index の数字で決めない。** Ark UI の Positioner は `z-index: var(--z-index)` を inline で当てるので、クラスで `z-80` などを付けても効きません。`#root` を `isolation: isolate` にしてあり、アプリの中の重ね順はアプリの中に閉じます。ポップアップやダイアログは body の末尾へ出るので、DOM の順だけでアプリより上に乗ります。アプリの中で重ねるもの（カラムの重なりなど）も、後ろに置いたものが上に来る DOM の順で決め、中の重ね順が漏れないように `isolate` で区切ります。

### 画面の外を飛ばす箱と、線を引く箱を分ける

一覧に並ぶもの（投稿・通知・ユーザーの行）は、中身を包む箱に `offscreen-skip`（`content-visibility: auto`）を当てて、画面の外にある分の描画を飛ばします。カラムを並べた画面では要素が数万になり、テーマ色を変えたときのように木全体のスタイル計算が走ると、当てない場合の 3〜4 倍かかります。

**仮想スクロール（`VirtualList`）の行の中では効かせない。** 行は画面から離れると作り直されるので、`auto` が覚えた高さも一緒に消えます。作り直した行は先読みの位置で 160px と測られ、画面に入ると高さが戻って、上へ戻るスクロールで本文が揺れます（#596）。行に付く `data-virtual-row` の中では preflight で打ち消してあります。

**`content-visibility` を当てた箱に 1px の線を引かない。** その箱は端数の位置で丸められるので、下線や枠線が消えることがあります（DPR 1.25 で 5 本に 1 本）。`thin`・inset の影・疑似要素のいずれに変えても消えます。線は外側の箱に引き、`content-visibility` は中身を包む内側の箱に当てます。

トーストやポップアップのように、その箱からはみ出して描くものを中に置かないようにします（`content-visibility` は paint も閉じるため）。

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
