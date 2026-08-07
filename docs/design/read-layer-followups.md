# 読み取り層 — 繰延事項

第1スライス（単一リレーのセクション読み取り）と第2スライス（Outbox ルーティングと購読マネージャ）のレビューで実在すると判定されたが、そのスライスでは直さなかったもの。次の計画に着手する前にここを読むこと。

用語は [CONTEXT.md](../../CONTEXT.md)、決定は [docs/adr/](../adr/)、全体像は [architecture.md](./architecture.md)。

**採番についての注記。** この文書には「後続 #」で始まる参照が 2 系列混在している。**番号だけを見て同じものだと判断しないこと。**

| 系列 | どこに出るか | #4 が指すもの |
|---|---|---|
| この文書が独自に振った古い採番 | `EventStore` が公開オプションになっている節、および [ADR-0016](../adr/0016-routing-bootstrap.md) の Consequences | **永続化**（IndexedDB 水和・`EventStore` の内部化） |
| [ADR-0023](../adr/0023-centralized-subscription-manager.md)「実装の段階」が定める採番 | REQ マージの節と「解消済み」の各項 | **ローカルフィルタ照合**（#1 Outbox ルーティング、#3 接続プール、#5 REQ マージ） |

どちらも実在する採番であり、片方だけを訂正すると別の文書と食い違う。そのため両方をそのまま残し、この表で区別する。

この注記の初版は該当箇所を行番号で指していたが、**注記自身を挿入したことで全部 2 行ずれた**（2026-08-02 訂正）。散文中の行番号は編集のたびに腐るので、以後この文書では行番号ではなく節の内容で参照すること。

## 外部レビュー（2026-08-04）— 着手順を横から縦へ変える

外部エージェントによる設計レビューを受け、**次は読み取り層の続きではなく縦断スライスを作る**と決めた。原本（`docs/temp-review.md`）は本節へ要点を移して削除した。

### 受け入れた中心的な批判

> 個々の判断は論理的だが、プロダクトを完成させる設計というより「理想的な Nostr 読み取り基盤を作る研究開発」に寄りすぎている。実装が設計を検証しているのではなく、設計を維持するために実装している状態へ近づいている。

**数字が裏づけている**（2026-08-04 時点）。v1 は main から 201 コミット先行、読み取り層の実装 3,056 行、そのテスト 6,142 行、`docs/` 12,240 行。**それを使っている画面は `/debug/v1-section` 1 本だけ**である。要件が使用によって検証されていない部品に厳密さを注いでいる状態であり、厳密さの向き先が問題だった（厳密さそのものではない）。

### ADR-0002 との関係（重要な区別）

レビューは [ADR-0002](../adr/0002-v0-parity-before-cutover.md)「v0 パリティ後の一括切替」の再検討を挙げているが、**ADR-0002 を覆す必要はない。** 混ざりやすい 2 つを分けること:

- **本番切替の戦略** —— ADR-0002 が決めているのはこれ。`streets.eyemono.moe` に未完成の v1 を出さない、という**ユーザー向け**の約束。
- **開発の順序** —— 読み取り層を作り切ってから UI を載せるかどうか。**ADR-0002 はこれを一言も要求していない。**

`/v1-preview` のような内部ルートで縦断スライスを動かすことは ADR-0002 と両立する。ADR-0002 自身が帰結として「切替までフィールドからのフィードバックが得られない。設計の誤りが長期間露見しないリスクを負う」と記録しており、そのリスクが顕在化したというのが今回の判定である。

### レビューの P0 のうち、既に閉じているもの

レビュー時点の参照コードが古かった。**再提起しないこと。**

- **受信イベントのローカルフィルタ再照合** —— 後続 #4 で解消（`src/core/read/filter-match.ts`、下記「解消済み」参照）。
- **500 件バースト時の全ソート・全通知** —— 後続 #6 で解消（`src/core/read/sorted-events.ts` と通知バッチ、下記「解消済み」参照）。

### 縦断スライスの前に決めるべきもの

- **`EventStore` のアカウント境界と機密情報の方針。** アクティブアカウントが常に 1 つであることは、**アカウント固有状態をグローバルに置いてよい理由にはならない**。最低限の 3 分類を先に決める: 公開イベント本体は共有 / ミュート・既読・自分との関係はアカウント単位 / 復号結果（将来の NIP-44）はセッションまたは署名器単位。**後から分けるのは、混ざった後では非常に高くつく。** 縦断スライスはログインと投稿に触るので、ここで初めて現実の問題になる。

### 縦断スライスを動かしてから決めるもの

作ってから決める。今 API を増やさない。

- **`createSection` のライフサイクル API。** `{ items, status, loadMore }` だけでは、画面外カラムの休止・優先度・破棄・リレー個別の再試行を表現できない可能性がある。ただし「深いモジュール」とは API が小さいことではなく **API に対して内部能力が大きいこと**であり、必要な制御まで隠すと例外的な抜け道が増える。10 カラムのうち実際に見えているのは数列だけ、という事実が 30 接続予算と噛み合うかを実測してから決める。
- **foreground / background / suspended の優先度。**
- **renderer `needs` が純粋関数だという前提。** 必要な関連データはイベントだけで決まらない（折り畳み状態、ミュート、展開操作、復号可否）。純粋な宣言ではなく「表示状態を持つ問い合わせ」になる可能性がある。波状解決の循環（event → profile → relay metadata → routing → 取得先が変わる）を深さ上限で止めるだけでは、「なぜ欠けたか」を説明できない。
- **`status.incomplete` からユーザー向け表示への変換。** 「uncoveredAuthors 127 件」と出してもユーザーは何をすべきか分からず、複数カラムで同時に起きると警告だらけになる。診断値としては正しいので、翻訳層を別に置く。
- **`EventStore` のメモリ破棄戦略。** 10 カラム × 500 件で最大 5,000 件に加え、`needs` で引くプロフィール・リアクション・リポスト・relay list が乗る。セクションの 500 件上限とは無関係に `EventStore` だけが増え続けうる。単純な参照カウントは Solid の mount/unmount で揺れるため、参照理由の分類（section-membership / renderer-critical / routing / recent など）と最終アクセス時刻の組み合わせが要る。ADR-0011 のメモリ 500MB はこれを決めないと満たせない。

### そのほか、実在するが小さいもの

- **フィルタ照合器に property-based test を入れる。** 現在は表駆動のユニットテスト（各行に捕まえる変異を明記）で、`docs/superpowers/specs/2026-08-02-local-filter-matching-design.md` 6.1 節の観点は網羅している。ただし自前実装の NIP-01 フィルタとしては、生成的テストのほうが強い。
- **文書の役割を厳密に分ける。** 同じ判断が ADR・architecture・spec・plan・followups に重複し、実装変更のたびに整合性確認が要る。実際 `pinned` と `reserved` で ADR・仕様・実装の食い違いが起き、直近のスライスでも「7 指標中 2 つ」と「残る 6 指標」が同時に存在する矛盾をレビューが拾った。**数値と現在の実装状態は一箇所を source of truth にする。** 役割の目安: ADR = 決定理由のみ（現在仕様の説明書にしない）/ architecture = 現在実装されている構造のみ / spec = 次の 1 スライス、完了後は archive / followups = 短い一覧。

### 反映しないと決めたもの（理由つき）

- **`Source` 抽象を 2 層に割る** —— レビューは Nostr イベント列と NIP-11 のような非イベントを同じ `createSection` へ流すと union 分岐が増えると指摘する。妥当な懸念だが、**実際に分岐が増えてから割る。** 今割ると、使われていない抽象をもう 1 層足すことになる。
- **接続予算をコストモデル化する**（`hardLimit` / `interactiveReserve` / `backgroundLimit`、リレーごとの重み付け）—— 30 という数字は実測に基づく（[research](../research/2026-08-01-outbox-connection-budget.md): 需要 378〜1251 本に対し貪欲選択で 96〜98% 被覆）。環境適応は、縦断スライスで実際に苦しんでから。
- **高水準 Nostr ライブラリの排除を再検討する** —— [ADR-0020](../adr/0020-no-nostr-library-noble-primitives-only.md) の決定であり、覆すなら独立した議論が要る。現在の停滞の原因ではない。
- **全性能予算を Playwright で測る方針の見直し** —— レビューは決定的な構造予算 / ベンチマーク予算 / ブラウザ E2E 予算の 3 階層化を提案する。方向は正しく、実際 `scripts/research/measure-section-reader-burst.mjs` が中間層に相当する。ただし ADR-0011 の書き換えを伴うので、測れない指標に実際にぶつかってから。

## v1 縦断スライス（2026-08-05）— 仕様 10 節の答え

[縦断スライスの仕様](../superpowers/specs/2026-08-04-v1-vertical-slice-design.md) 0 節が言うとおり、**このスライスの成果物は「動くもの」ではなく「押し返し」である。** 動くもの自体（NIP-07 ログイン・3 カラム・kind:0 コアレッサ・投稿・リロード復元、`/v1-preview`）は各タスクのレビューで検証済み。ここに書くのは、それを実際に動かして初めて答えられた仕様 10 節の 5 問への回答で、実測に基づかない推測は書かない。分からなかったものは「分からなかった」と書く。

### 問い1 —— `{ items, status, loadMore }` で足りたか

**足りた。** `/v1-preview` の実装者（Task 2 の報告）は `items` / `status().phase` / `status().incomplete` のいずれも過不足なく使えたとしており、`loadMore` は仕様どおりページネーション対象外のため呼ばれていない（型に存在すること自体は邪魔にならなかった）。

摩擦は `Section` の形そのものではなく**一段上**で起きた —— 「pubkey から `warmUpRouting` を呼び、結果を `NostrSource` に組み立てる」という約 15 行のパターンを、`debug/v1-section.tsx` と `v1-preview.tsx` の両方で手で複製している。Task 2 は「2 箇所目では時期尚早、3 箇所目が出たら共通化する」と判断し（レビューも妥当と判定）、本スライス完了時点でも呼び出し箇所は依然この 2 つのままなので、**まだ 3 箇所目は現れていない** —— 共通化の着手条件はまだ満たされていない。

Task 5 は N+1 の実物計測もしている: **50 件のノート・10 人の著者に対し、kind:0 の REQ は 200ms のまとめ窓のもとでちょうど 1 本**しか出なかった。プロフィールのコアレッサが `{ items, status, loadMore }` の外側の薄いレイヤー（`profile-requests.ts`）として無理なく載ったこと自体も、この 3 点セットが土台として足りていたことの傍証になる。

### 問い2 —— 30 接続予算は 3 カラム + プロフィール + 投稿で成立したか

ローカル計測（Task 3、ローカル docker relay 2 本）は `connections: 4` / `peakConnections: 4` — 予算 30 に対して桁が違いすぎ、上限には一切近づいていない。**この計測だけでは何も答えられない。**

答えたのは人間による実鍵・実リレーでの検証（2026-08-05）である: 3 カラム + プロフィールのコアレッサ + 実際のフォローリストを持つ本物のアカウントで、**接続数は 3〜9 の間で揺れ、ピークは 10** に達した。予算 30 に対し十分な余裕があり、**成立した。** ローカル計測が全く予算を試せていなかった一方で、実物はローカル計測の約 2.5 倍の接続を使いながらもまだ予算の 1/3 に届いていない — 予算 30 という数字自体の妥当性を裏づける最初の実地データである。

### 問い3 —— 楽観的挿入は 100ms 予算に収まったか

**アプリの制御が及ぶ範囲では、収まった。** ただし最初の計測は答えになっていなかった: Task 6 の初回計測（クリック→テキスト可視化を Playwright の `toBeVisible()` で測る手法）は 72ms / 842ms / 920ms とばらつき、レビューで「計測窓に `signer.signEvent()`（この検証では `page.exposeFunction` 越しの Node 呼び出しという実運用に無い IPC ホップ）と Playwright のポーリング間隔が混ざっており、100ms 予算にこの経路単体で収まっているかを何も語れない」と指摘された。**この 72〜920ms という数字はノイズであり、問い3の答えではない。**

修正後の計測（`store.put()` から `setOptimisticEvents()` の signal 書き込み完了までを `performance.now()` で挟み、`signEvent` を計測窓の外に出す）では **0.9〜12.9ms、定常状態では 1ms 未満**。100ms 予算に対して 2 桁小さく、この経路がボトルネックになることはない。常設の読み取り値として `data-testid="optimistic-insert-ms"` に残してあるので、実鍵での検証でも同じ数値を確認できる。

**まだ測れていないもの**: 本物の NIP-07 拡張機能の署名確認 UI が出てからユーザーが反応するまでの時間、および `publisher.publish()` がリレーの応答を得て解決するまでの往復時間。前者は拡張機能とユーザー次第で計測手段が無く、後者は`publish-result` の表示タイミングを同様に計測すれば分かるが、このスライスでは行っていない。

### 問い4 —— `status.incomplete` の生の数値は、作った本人が見て意味が分かったか

**正直に書く: 分かった部分と分からなかった部分がある。**

Task 2 の実装者は「`unreachableRelays` は読めば分かるが、`unroutableAuthors` と `uncoveredAuthors` はフィールド名だけでは区別できず、`subscription-manager.ts` の `SectionPlan` のドキュメントコメントを読んで初めて正しく区別できた」と報告している。つまり**画面だけを初めて見た状態では意味が分からず、ソースコードのコメントを開いて初めて分かった。**

**（2026-08-05 訂正）この問いは、そもそも答えられる状態になかった。** 初版はここに「人間による実鍵検証では混乱は報告されていない。しかし『混乱しなかった』ことは『意味が分かった』ことの証拠ではない」と書いていた。慎重な書き方をしたおかげで結論としては誤っていないが、**理由が違う。** 混乱しようがなかったのは、**`incomplete` の 3 つの数値が `/v1-preview` に描画されていなかった**からである。

Task 2 の単一カラムでは出していたが、Task 3 で `DeckColumn` へ書き直した際に落ちた。仕様 7 節が「既存の `status.incomplete` の生の数値をそのまま見せる」と明記していたにもかかわらず、**Task 3 のレビュー・最終ブランチレビュー・スクリーンショットの目視、いずれも見落とした。** 発見は人間の実機確認中の問い返し（「この質問の意図が分からない、UI 上に表示されている何かを伝えればよいのか」）による。

見落としの構造は記録しておく価値がある: **この要求は spec の別の節（エラー処理の表）にあり、Task 3 の受け入れ確認はカラム数・リロード・localStorage に向いていた。** タスクの受け入れ確認が spec の一部しか写していないとき、写されなかった部分は誰の担当でもなくなる。

描画は復旧させた（`data-testid="deck-column-incomplete"`）。**問い4 の答えは依然として未取得である** —— 唯一の一次情報は実装者自身の体験で、「`unreachableRelays` は読めば分かるが、`unroutableAuthors` と `uncoveredAuthors` はフィールド名だけでは区別できず、`subscription-manager.ts` の `SectionPlan` のドキュメントコメントを読んで初めて区別できた」というもの。翻訳層の必要性を裏づける方向の弱い証拠ではあるが、実際に画面で見た人間の判断はまだ無い。

### 問い5 —— fetch-once をどこまで一般化する必要が見えたか

Task 4 は「新しい意味論を発明せず、`bootstrap.ts` の `collect()` が既に持っていたものを公開面へ出す」という仕様 5 節の方針をそのまま実行し、`collect()` を `src/core/read/collect.ts` に切り出して `bootstrap.ts` と `SubscriptionManager.fetchOnce()` の両方から共有した。プロフィールのコアレッサ（Task 5）はこの `fetchOnce` の上にそのまま乗り、追加の一般化を要求しなかった。**「一度引いて閉じる」という単一の意味論だけで、このスライスが必要としたものは全部足りた。**

**一般化がどこまで要るかという問い自体は、依然として手つかずのまま。** 仕様 5 節が最初から明記しているとおり、購読には少なくとも「時間を遡って取り切る」ものと「これから来るものを受け続ける」ものがあり、rx-nostr の backward / forward strategy の整理と合わせて設計すべき領域だが、本スライスはページネーションに一切触れておらず、この分類そのものを検討する材料は今回何も増えていない。次にページネーションが要るタスクが、この整理に人が実際に取り組む最初の機会になる。

## A-1 デッキとカラム（2026-08-07）— 仕様 12 節の答え

[仕様](../superpowers/specs/2026-08-07-deck-and-columns-design.md) 12 節が定める 6 問への回答。**問 3・4・5・6 は実装した内容から答えられる。問 1・2 は実鍵で複数カラムを開いた人間にしか答えられず、このスライスの実装作業はローカル docker relay とデフォルトデッキ 3 カラムの範囲でしか動いていないので「未取得」と明記する。** 上の「v1 縦断スライス」節と同じ規律で書く —— 実測に基づかない推測は書かない。

### 問い1 —— 30 接続予算は 5〜10 カラムで成立するか

**未取得。** A-1 は追加・削除・並べ替え・改名の e2e とローカル docker 環境での確認に閉じており、5〜10 カラムを実際に開いて `peakConnections` を読む作業は行っていない。読むべき場所: `/v1` のヘッダで開発者モードのトグル（`data-testid="developer-mode-toggle"`）を有効にし、`data-testid="peak-connections"` を種別を混ぜた 5〜10 カラムで読むこと。3 カラムでの実測（上の「v1 縦断スライス」節、問い2）はピーク 10 だったが、カラム数と接続数の関係は非線形（Outbox は著者の重なりで畳まれる）なので、そこから 5〜10 カラムの値を外挿することはできない。

### 問い2 —— `createSection` に画面外カラムの休止・優先度・破棄が要るか

**未取得。** 問い1 と同じ理由で、画面外カラムを数分置いて体感の重さを見る作業をこのスライスでは行っていない。A-1 は `createSection` の公開 API を一切変更しておらず、followups の「縦断スライスを動かしてから決めるもの」節（上記）が指定していた実測はまだ行われていない。

### 問い3 —— `warmUpRouting` → `NostrSource` パターンの 3 箇所目は出たか

**出なかった。** `grep -rn "warmUpRouting(" src` で確認すると、呼び出し箇所は `src/routes/v1.tsx` と `src/routes/debug/v1-section.tsx` の 2 箇所のみで、A-1 でも増えていない。`/v1-preview` が `/v1` へ移設された（Task 3）際もこのパターンをそのまま引き継いだだけで、新しい呼び出し箇所は生まれていない。**「3 箇所目が出たら共通化する」の着手条件は、このスライスの後もまだ満たされていない** — 前スライスの答え「まだ 3 箇所目は現れていない」がそのまま継続している。

### 問い4 —— 派生ソースは `followees` だけで足りたか

**足りた。** `ColumnSource`（`src/core/deck/deck.ts`）の判別共用体は `{ kind: "literal", ... }` と `{ kind: "followees", kinds }` の 2 種のままで、4 種別の追加 UI（ホーム / ユーザー / ハッシュタグ / グローバル、`src/routes/v1/column-presets.ts`）を実装しても 2 つ目の派生 `kind` を作る場面は出なかった。ユーザー（単一著者）・ハッシュタグ・グローバルはいずれも `literal` でそのまま表現でき、`followees` が要ったのはホームだけだった。

### 問い5 —— 4 種別のどれかが 2 本目のセクションを欲しがったか

**欲しがらなかった。** `DeckColumn.tsx` は `createSection` を 1 回だけ呼ぶ（`src/routes/v1/DeckColumn.tsx`）。4 種別いずれも 1 本の時系列リストとしてそのまま収まり、複数セクションを束ねる必要は生じなかった。ただしこれは「A-1 の 4 種別の範囲では反証が出なかった」以上のことを主張できない — 仕様 5 節が明記するひっくり返す条件（ユーザー詳細カラム）はまだ作っていない。詳細は [ADR-0003](../adr/0003-open-column-abstraction.md)「実装の段階」の A-1 の項を参照。

### 問い6 —— ハッシュタグ（`authors` の無いフィルタ）は実際にどこへ繋いだか

コードを追った範囲でだけ答えられる。**実際にハッシュタグ列を開いてイベントが届くのを見た記録は、A-1 のどのタスク報告にもない**（Task 4 が追加した e2e は `buildColumn` が常に成功し入力欄が要らない「global」種別だけを対象にしており、ハッシュタグ種別を実際に操作していない）。

追跡した経路: ハッシュタグ列の `ColumnSource` は `{ kind: "literal", filters: [{ kinds: [1], "#t": [tag] }] }` で `relays` を持たない（仕様 4 節）。`resolveSource` はこれを `relays` キーの無い `NostrSource` に変換し（Task 1、「指定があるときだけ載せる」）、`SubscriptionManager.subscribe()` は `options?.relays` が無いので `this.#options.fallbackRelays ?? FALLBACK_RELAYS` を使う（`subscription-manager.ts` の `subscribe()`）。`planQuery`（`query-plan.ts`）は `authors` の無いフィルタを「誰でもいい」として `fallbackRelays` の全リレーへそのまま同報し、`unroutableAuthors` にはカウントしない。さらに `#replanOnce` は `fallbackRelays` を無条件に `pinned` へ足す（`subscription-manager.ts`）ので、ハッシュタグ列が使う 3 本（`FALLBACK_RELAYS` = `yabu.me` / `nos.lol` / `relay.damus.io`）は接続予算の貪欲選択で落とされない。**「実地で確かめる価値がある」（仕様 4 節）はまだ満たされていない** — 上の経路はソースコードの追跡であり、実行して確認したものではない。

## 次の計画で直すべきもの

### `EventStore` が呼び出し側から渡される公開オプションになっている

[ADR-0018](../adr/0018-indexeddb-event-cache.md) は `EventStore` の seam 資格を明示的に取り消し（`EventStore は seam ではなく読み取り層の内部に降ろす`）、代わりに `EventPersistence` を seam とした。しかし現状は `SectionReader` と `createSection` の両方でオプションとして露出しており、**共有するかどうかを呼び出し側が決められる**。

第1スライスの Critical はまさにここから生まれた（共有 store で `put` が `"duplicate"` を返す経路）。IndexedDB 水和が入れば store は読み取り層のシングルトンになるほかない。

**着手時期は永続化の計画（後続 #4）の冒頭。** 当初は「呼び出し箇所が増える前に早く直すべき」としていたが、これは誤りだった。訂正の根拠は2つ。

1. **呼び出し箇所は #4 までは増えない。** `createSection` の呼び出しが増えるのはデッキとカラムを作る後続 #7 であり、これは永続化 #4 より後。#4 の時点でも呼び出し箇所は現在と同じ 1 つ（デバッグルートのみ）のままで、移行コストは今も #4 でも変わらない。
2. **今やると合成ルートを盲目的に設計することになる。** 読み取り層の合成ルートは最終的に `EventStore` に加えてルーティング表（#1）・接続プール（#3）・`EventPersistence`（#4）を一緒に抱える。中身が 1 つしか分かっていない段階で容器の形を決めると、残り 3 つを積んだ後に作り直すことになる。

なお `SectionReader` 側のオプションは残してよい。テストが `PassThroughStore` を注入する内部の seam として機能しており、外に出すべきでないのは `createSection` の公開インターフェースのほう。

**同じ計画で決める必要があること: 水和経路の検証をどうするか。** `put()` は挿入のたびに schnorr 検証する。IndexedDB のキャッシュを起動時に `put()` で流し込むと、キャッシュ全件を再検証することになり、[ADR-0011](../adr/0011-performance-budget.md) の「初回イベント表示 2 秒」がそれだけで埋まる。信用済み挿入の経路を足すかどうかは `put()` のシグネチャの話であり、永続化 #4 で決着させる。

### ~~`seenRelays` の帰属が検証されていない~~ — 2026-08-01 修正済み

`event-store.ts` の `"duplicate"` 経路が、ペイロードを照合する前に `seenRelays` へリレーを記録していた。悪意あるリレーは既知の ID を送るだけで、自分が配信していないイベントの提供者として記録された。

Outbox（後続 #1）が `seenRelays` をリレーヒントとして読み始める直前に修正した。`"duplicate"` 経路の push を `isNostrEvent(event) && computeEventId(unsigned) === event.id` で門番する。イベント ID は署名対象フィールドの sha256 であるため、**ID の再計算がそのままペイロードの照合になる**。schnorr を伴わないので、重複ごとの検証コスト（下記「直さないと決めたもの」で却下した方式）は発生しない。

`put` の戻り値は照合が失敗しても `"duplicate"` のまま。`SectionReader` は「`"rejected"` 以外＝ store がその ID を持っている」に依拠しており、ここで `"rejected"` を返すと既に保持している正規のイベントをセクションが取りこぼす。

### `reserved`（ブートストラップの予算迂回）が ADR-0025 の記述と食い違っている（接続プールの最終ブランチレビュー finding 9a）

[ADR-0025](../adr/0025-greedy-relay-selection-under-a-global-budget.md) と[設計仕様](../superpowers/specs/2026-08-01-connection-pool-design.md:104)は、ブートストラップのインデクサ（`BOOTSTRAP_INDEXERS`、4 本）を `pinned`（予算を消費するが決して落とされない）として扱うと書いていた。実装（`bootstrap.ts` / `ConnectionPool.subscribe()` の `{ reserved: true }`）はそうなっていない — インデクサは `selectRelays` の `pinned` に一切渡らず、`ConnectionPool.subscribe()` の予算チェック（`size >= maxConnections`）そのものを丸ごと迂回する**バイパス**である。ADR-0025 の該当段落は誤りとして訂正した（下記）。

**帰結は 2 つ。**

1. **ピーク同時接続数は `30 + |indexers|` = 34 になりうる。** Outbox の 30 本がすでに埋まった状態でウォームアップが始まると、インデクサ用の 4 本が予算チェックを迂回してそのまま上に乗る。**今日は到達しない** — デバッグルートがウォームアップ完了までセクションの開始そのものを遅らせているため、ウォームアップ開始時点で Outbox 側が 30 本を使い切っていることがない。ただし[設計仕様](../superpowers/specs/2026-08-01-connection-pool-design.md:111)が名指ししているとおり、未知の著者に遭遇して再ウォームアップする経路が入れば重なりうる。次の計画がこの経路を作るなら、34 という数を先に踏まえること。
2. **`pinned`（選択器の予算優先権）と `reserved`（プールの予算迂回）という、意味の違う 2 つの仕組みが同じ「30 接続」という数字について別々に主張している。** 1 つの数値に統一されていない。

**裁定（このスライスでは実装しない — 統合スライスがこのコードにどのみち触れるため）**: ドキュメントを実装に合わせて訂正し、数値を露出するところまでで止める。具体的には (a) 上記のとおり ADR-0025 の `pinned` 段落を訂正、(b) `ConnectionPool` に `reservedSize` アクセサを追加して「今バイパス経由で何本使われているか」を読めるようにする、(c) この 34 ピークの逸脱を到達条件つきでここに記録する（上記）。予算の再構成（`reserved` を `pinned` に統合する、あるいはその逆）は次の計画が 1 つの数値に対して行うこと。

### ~~死んだままのリレーが枠を永久に食いつぶす~~（接続プールの最終ブランチレビュー finding 9b）— 2026-08-06 修正済み

**予測ではなく、実地で観測済み（v1 縦断スライス、人間による実鍵検証、2026-08-05）。** `/v1-preview` を本物のアカウントで公開リレー網に対して動かしたところ、`wss://relay.yozora.world`・`ws://5izlqtjuyxwgfqzo3mdmsfzwlhxzqsxvv3dchr5iuctthqdvtamwvrad.onion/`・`wss://nfrelay.app/` の 3 本が繰り返し WebSocket 接続に失敗した。とりわけ `.onion` アドレスは Tor を経由しないブラウザからは構造的に到達不能であり、この節が予測していた「死んだままのリレーが枠を占有し続ける」を最も分かりやすい形で実演している —— 到達不能である以上、恒久的に暗転する著者の枠を永遠に手放さない。以下の記述（実装から導いた予測）はそのまま正しかったことが確認された。

`#onConnectionDied` はソケットの枠を解放するだけで、マネージャ側の状態には一切触らない: URL は `entry.opened` に残り続け、`currentSet`（粘着性）にも残り続け、`filtersEqual` は毎回このリレーをスキップする。`selectRelays` はそもそも「到達可能かどうか」という概念を持たないので、`replan()` のたびに同じ死んだ URL を何度でも選び直す。**リレーが本当に恒久停止した場合、そのリレーが担当していた著者は永久に暗転し、空いたはずの枠は誰にも使われない。**

これは「隠れた劣化」ではない — `unreachableRelays` として正直に報告され続けるので ADR-0011 の禁止事項には触れない（劣化そのものは起きているが、隠れてはいない）。[ADR-0021](../adr/0021-reconnection-policy.md) が「死亡・復帰は再選択の契機にしない」と意図的に決めたのは、瞬断のたびに churn を起こさないためであり、それ自体は瞬断に対して正しい判断である。ただしこの判断は恒久喪失には対処していない。

**次の計画への提案**: `selectRelays` に `degraded`（連続再接続失敗が N 回を超えた URL の集合）という入力を足し、貪欲選択のステップがその URL の枠を他へ回せるようにする。プール自身はそれでも `degraded` な URL への再接続を諦めずに回し続けてよい（ADR-0021 の「永久に諦めない」とは矛盾しない — 「選び直しの対象にするかどうか」と「再接続をやめるかどうか」は別の問い）。**このスライスでは実装しない。**

**`selectRelays` に `degraded?: readonly RelayUrl[]` を追加して解決した**（接続層スライス Task 4）。`ConnectionPool.degradedRelays`（リレー自身に起因する連続失敗が `DEGRADED_AFTER_FAILURES` に達した URL）を `SubscriptionManager.replan()` から渡し、候補集合の構築段階でこれに含まれる URL を完全に除外する — 「最後の手段として残す」設計は採らなかった。到達不能なリレーに割り当てても被覆は増えず、枠だけが無駄になるためである。degraded な URL しか宣言していない著者は `uncovered` に落ちる（[ADR-0011](../adr/0011-performance-budget.md) の「劣化を隠さない」に適う、意図した挙動）。`pinned`（ユーザー明示指定・fallback・ブートストラップのインデクサ）はこの除外の対象外 —— 黙って落とすと経路そのものが壊れる。復帰経路は `DEGRADED_COOLDOWN_MS`（300 秒）のクールダウンで確保した。詳細は [ADR-0021](../adr/0021-reconnection-policy.md) と [ADR-0025](../adr/0025-greedy-relay-selection-under-a-global-budget.md) を参照。

**訂正（最終ブランチレビュー、2026-08-06、Important 1）: 上の「解決した」は不完全だった。** `selectRelays` の純関数側 (`degraded` を除外する部分) は正しく実装されていたが、それを呼び直す `SubscriptionManager.#runReplan()` の内部呼び出し元は `subscribe()` と `#close()` の 2 つだけで、接続が死んで `degradedRelays` に積み上がっても、アプリのどの経路もそれを受けて `replan()` を呼び返していなかった。結果として `.onion` が 4 回失敗して `degradedRelays` に入っても、次にセクションが追加・削除されるまで選択結果には一切反映されず、この節が最初に報告した症状（枠を握ったまま著者が暗転し続ける）を、原因だけ変えて（除外ロジックの欠落ではなく再選択の契機の欠落として）再現していた。

**`ConnectionPool.onDegraded(listener)`（degraded への遷移を通知する新しいフック、2026-08-06 degraded-recovery-and-isolation Task 1 で `onDegradedChanged` に改名）と `SubscriptionManager` 側のバッチ配線（`#scheduleDegradedReplan()`、窓 200ms）を足して、これを自動化して初めて実際に閉じた。** 遷移の瞬間だけ通知し、以後の失敗では再発火しないので、単発のブリップを再選択の契機にしないという ADR-0021 の方針は保たれている。バッチ窓は、同時に複数のリレーが degraded へ遷移した場合（ネットワーク断で 30 本が同時に死ぬなど）に replan が 1 本にまとまるようにするためのもの。詳細は [ADR-0021](../adr/0021-reconnection-policy.md) の「諦めない」と「再選択の候補から外す」は別の問い節を参照。

**追記（2026-08-06 degraded-recovery-and-isolation Task 1）: 復帰側も同じ配線で閉じた。** 下の「小さいもの」表がかつて書いていた「除外の側で閉じたのと全く同じ形の隙間が、復帰の側に残っている」はもう成り立たない — その行自体も解消済みとして更新済み。機構（`onDegradedChanged` が出る瞬間にも通知すること、`#clearFailures` を通る 3 経路、既存のバッチ窓への相乗り）は [ADR-0021](../adr/0021-reconnection-policy.md) の「諦めない」と「再選択の候補から外す」は別の問い節（「この『戻り』の専用の起動経路が無いという隙間は」の段落）を参照。

### ~~指数バックオフが実際には指数になっていない~~（e2e の docker 依存を外す作業中に発見、2026-08-02）— 2026-08-05 修正済み（Task 4 ではなく Task 2）

**予測ではなく、実地で観測済み（v1 縦断スライス、人間による実鍵検証、2026-08-05）。** 上記「死んだままのリレー」で挙げた 3 本（`wss://relay.yozora.world`・`.onion` アドレス・`wss://nfrelay.app/`）はいずれも、単発の切断ではなく**およそ 3 秒間隔で失敗を繰り返し続けた**。私（レビュー担当）がコードを見て原因を確認した —— これはまさに下記のバックオフ欠陥が予測していた症状そのものである: `#reconnect` が `connect()` の戻り値だけを見て `attempts` を 0 に戻すため、恒久的に到達不能なリレーへの再接続は毎回「成功」扱いになり、指数は 2⁰ から一度も伸びず、間隔は `RECONNECT_BASE_MS × (0.5 + random)` = 500〜1500ms のまま張り付く。観測された「約3秒」は、この一定間隔に加えて DNS/TCP/TLS の失敗にかかる時間が乗ったもので、下記の分析と矛盾しない。「実装から導いた予測」と「実地で見た症状」が一致した、この記録で唯一の項目である。

[ADR-0021](../adr/0021-reconnection-policy.md) は「初回 1 秒からの指数バックオフ、上限 60 秒」と決めており、`connection-pool.ts` の `#scheduleReconnect` はその通りに `RECONNECT_BASE_MS * 2 ** attempts` を計算する。ところが `#reconnect` は `this.#options.connect(url)` が返った直後に `pooled.attempts = 0` としている。**`connectRelay` は `new WebSocket(url)` を構築して即座に返る** — ソケットが開いたかどうかは一切見ていない（`websocket-relay-connection.ts:201`）。したがって恒久的に到達不能なリレーに対しても `connect()` は毎回「成功」し、`attempts` は毎回 0 に戻る。

**帰結: 指数は 2⁰ から伸びず、再接続は永久に 0.5〜1.5 秒間隔で回り続ける。** 30 本のリレーが同時に落ちた場合、ADR-0021 が防ごうとしていた「復帰時のバースト」ではなく「切断中ずっと毎秒 30 本のソケット構築が走り続ける」という、より高頻度な負荷になる。ジッタは効いているので同期はしないが、頻度そのものが下がらない。

隠れた劣化ではない（`unreachableRelays` は正直に立ち続ける）ので ADR-0011 の禁止事項には触れないが、ADR-0021 の記述と実装が食い違っている。

**次の計画への提案**: `attempts` のリセットを `connect()` の戻りではなく**実際に接続が開いた時点**（`RelayConnection` 側の open 通知、あるいは最初の EOSE / メッセージ受信）に移す。今は `RelayConnection` に open の seam が無いので、`onClose` と対になる通知を足すか、`#reconnect` でのリセットをやめて `onEose` 到達時にプール側で 0 に戻す形にする。**このスライスでは実装しない**（e2e の flake 修正の副産物として見つけたもので、修正は再接続方針そのものの変更にあたる）。

**接続層スライス Task 1/2 で解決した（Task 4 の作業中にここを更新していて気づいた —— 提案時点ではまだ次の計画として書かれていたが、実際には 2 つ前のタスクで既に直っていた）。** Task 1 が `RelayConnection` に `onOpen` の seam を足し、Task 2 が `#attachConnection` の即時リセットをやめて `pooled.offOpen = connection.onOpen(() => this.#clearFailures(url))` に置き換えた —— まさにこの節が提案していた「実際に開いた時点」への移動そのもの。失敗回数の記録もプール寿命 (`#failures`、`Pooled` ではなく `ConnectionPool` 自身が持つ) に移り、`DEGRADED_AFTER_FAILURES` / `DEGRADED_COOLDOWN_MS` として結実した（詳細は [ADR-0021](../adr/0021-reconnection-policy.md) 追記を参照）。ここに記録が残っていたのは、Task 2 が実装レポートは書いたがこの followups ファイルを更新し忘れていたため —— 「見つけた時点で書く」を後追いで満たす。

### CI が Playwright (e2e) を一度も実行していない（section-reader-performance の最終ブランチレビューで発覚）

`.github/workflows/ci.yaml` には `check` / `test`（vitest）/ `build` の 3 ジョブしかなく、`pnpm exec playwright test` を呼ぶジョブが無い。`e2e/section-cap.spec.ts` をはじめとする e2e 群はローカルで走らせれば本物のガードとして機能する（下記「満たしていない要件」参照）が、push のたびに自動でそれを検査する仕組みが無いので、e2e が守っているはずの退行は CI では止まらない。

**次の計画への提案**: 単純に `playwright` ジョブを足すだけでは済まない。少なくとも 2 つの前提を先に満たす必要がある。

1. **依存サービスが要る。** e2e は `compose.yaml` の `nostr-rs-relay` / `nostr-rs-relay-2`（`postgres` に依存する）を必要とする。CI ワーカーでこれらを起動し、`pnpm dev:relay:reset` 相当のシード手順を踏んでから `pnpm exec playwright test` を叩く必要がある。
2. **クリーンな木で赤くなる spec が既にある。** `e2e/console-warning.spec.ts` は旧実装の `/` を対象にしており、このリポジトリの現在の状態でそのまま走らせると失敗する（このスライスの検証コマンドも `--grep-invert "repost parser warning flood"` で除外している）。素朴に `playwright test` を丸ごと CI に配線すると、この 1 件のせいで初日から赤くなる。CI 化するなら、この spec 自体を直すか、対象を切り替えるか、除外するかを先に決める必要がある。

**このスライスでは実装しない** — CI 配線は独立した作業であり、このスライスの範囲外。

## 直さないと決めたもの（理由つき）

### `publish()` だけが触った新規 URL の接続失敗を degraded に数えること

`publish()` が誰も購読していない新しい URL へ接続しようとして `connect()` が**同期的に例外を投げた**場合、その失敗は `#failures` に記録されない（エントリが即座に片付けられ、`#scheduleReconnect` に到達しない）。接続層スライスのレビュー（2026-08-05）で実装担当が繰延事項として挙げ、レビュー担当が経路を追って裁定した。

**数えない。** 理由は 3 つ。`degradedRelays` は `selectRelays` の入力であり読み取り側の関心事である（[ADR-0025](../adr/0025-greedy-relay-selection-under-a-global-budget.md)）。publish は購読を残さないので、Task 2 が防いでいる振動（除外 → 購読ゼロ → 履歴消滅 → 再選択）はそもそも起こりえない。失敗自体は `publisher.ts` が `PublishResult.rejected` として表に出すので [ADR-0011](../adr/0011-performance-budget.md) の「劣化を隠さない」は満たされている。

なお**この経路は同期的な throw に限られる**。`connect()` がソケットを返した後に `PUBLISH_TIMEOUT_MS` 以内で死んだ場合は、一時的な publish エントリがまだ `entries` に居るので `#onConnectionDied` → `#scheduleReconnect` を通って数えられる。つまり publish 由来の計上はタイミング依存であって、皆無ではない。

### `EventStore.put` で検証を重複判定より前に移すこと

Critical を塞ぐ別解だが、重複のたびに schnorr 検証が走る。Outbox では同一イベントが複数リレーから届くため、500 件 × 3 リレーで約 1,500 回の追加検証となり、[ADR-0011](../adr/0011-performance-budget.md) の「初回イベント表示 2 秒」を削る。**採用しない。**

### `websocket-relay-connection.ts` の `subId` / `eventId` の `typeof` ガード 4 箇所

タスクレビューは「`Map<string, _>` のキー意味論により到達不能なデッドコード」と判定したが、**ブランチ全体レビューがこれを覆した**。`Array.isArray(message)` が `message` を `any[]` に絞るため、これらのガードは信用できないリレーと `NostrEvent` の間に存在する唯一の検証である。**削除しないこと。**

### ~~アンカー購読が「接続を握る」手段として REQ を悪用している~~ — 2026-08-06 修正済み

`warmUpRouting` は、フェーズ①とフェーズ②の間で接続が落ちないよう、インデクサごとに `{ ids: [NEVER_MATCHING_ID] }` という**絶対にマッチしない filter** の購読を張っていた（`bootstrap.ts`）。実機で、一部のリレーがこれを `blocked: filters must specify at least one kind` で拒否して CLOSED を返していることが分かった（2026-08-05）。

機能自体は壊れていなかった —— 接続を生かしていたのは REQ ではなく `ConnectionPool` の**エントリ**であり（`#drop()` は `pooled.entries.size === 0` で発火する）、アンカーの `onClosed` は no-op なのでエントリは残った。だが**それは偶然に寄りかかっていた**。我々が欲しかったのは「接続の参照を 1 つ握る」ことだけで、REQ は**それを表現する API が他に無いから送っていた**にすぎない。リレーが購読ではなく接続そのものを閉じる方針だったら、ウォームアップは壊れていた。

**`ConnectionPool.hold(url, options?): PooledHold | undefined` で解決した**（接続層スライス Task 3）。`hold()` は `#ensureConnection` を通して接続を確保し、保持カウントを立てるだけで `connection.subscribe()` を一切呼ばない。予算（ADR-0011）は `subscribe()` と同じに数える —— hold は生きたソケットを 1 本占有するため。`#scheduleReconnect` / `#reconnect` / `#drop` の「誰も待っていない」判定は hold を考慮する。`NEVER_MATCHING_ID` 定数とアンカー宛イベントの会計（`anchorUnrequested`）は定数ごと消えた。

## デッキと画面（読み取り層の外）

**この文書は元々「読み取り層の繰延事項」だったが、デッキとカラム（A-1、2026-08-07）から画面側の繰延も出るようになった。分けずにここへ足す** —— バックログが 2 ファイルに割れると、どちらも半分しか読まれない。読み取り層の項と区別するためだけに節を分けてある。

| 箇所 | 内容 |
|---|---|
| `deck.ts` | valibot の `objectWithRest` へ移した副作用で、**`#` で始まらない未知のキーを持つフィルタも `string[]` を要求するようになった**（手書きの型ガードは無視していた）。streets 自身はそういうフィルタを作らないので実害は無く、拒否されたデッキは既定デッキへ落ちる既存の縮退経路に乗るだけだが、**その境界を固定するテストが無い**（`{ kinds:[1], extra: 42 }` は拒否・`{ kinds:[1], extra: ["a"] }` は受理）。将来 `looseObject` 相当へ戻しても誰も気づかない |
| `package.json` | `valibot` が `1.0.0-rc.0` に固定されている。安定版への更新は A-1 の範囲外 |
| `v1.tsx` / `deck-mutations.ts` | **カラム名を変えるとそのカラムの購読が張り直される。** `renameColumnIn` は該当カラムだけ新しいオブジェクト参照を作り、Solid の `<For>` は参照で照合するので、その `DeckColumn` の owner が破棄・再生成され `createSection` の `onCleanup` が購読を畳む。追加・削除・並べ替えは生き残るカラムの参照を保つので**リネームだけ**の問題（A-1 Task 4 のレビューで追跡確認済み）。実害は「blur/Enter のたびに 1 カラムが EOSE まで空になり、REQ が 1 本 30 接続予算へ再発行される」。カラムの識別を参照ではなく `id` に寄せる（`createStore` で細粒度に持つ等）のが素直な直し方だが、A-2 のレンダラ層がこの構造に乗るので、そこで一緒に決めるほうがよい |
| `AddColumnForm.tsx` | 種別を切り替えても入力欄が残る。「ユーザー」で npub を打ってから「ハッシュタグ」へ切り替えて送信すると、その npub がタグ値になった（スキーマ上は正しいが絶対に何も来ない）カラムが黙って出来る。エラーも出ない |
| `column-presets.ts` | ハッシュタグの先頭 `#` を 1 つしか落とさない（`/^#/`）。`##nostr` はタグ値 `#nostr` になり、NIP-12 のタグ値に `#` は含まれないので永久に一致しない。これもスキーマ上は正しいので黙って壊れる |
| `e2e/fixtures/seed-preview.ts` | **`/v1` の e2e で `status.incomplete` を立てられるフィクスチャが無い。** シードは 3 人全員の `kind:10002` を到達可能な 1 本のリレーに置くので、`unreachableRelays` / `unroutableAuthors` / `uncoveredAuthors` が構造的に全部 0 になる。そのため「開発者モードを入れると `deck-column-incomplete` が出る」ことを e2e で主張できない（A-1 Task 5 は実際に一時的な assertion を入れて確認したうえで、その 1 本だけ落とした）。`/debug/v1-section?budget=` に相当する予算上書きを `/v1` にも作れば書けるようになる |
| `ColumnAlertBadge.tsx` | 開閉状態がカラムの owner 再生成で失われる（上のリネームの項と同じ原因）。異常を開いたままリネームすると畳まれる。実害は小さいが、上のリネーム remount を直せば一緒に消える |
| `AddColumnForm.tsx` | `add-column-error` のメッセージが種別を問わず同じ文言（「入力を確認してください。user は npub または hex、hashtag は空でない文字列が必要です。」）。種別ごとに出し分けたほうが親切だが、brief は「入力欄にエラーを出す」としか要求しておらず、A-1 Task 4 は必要十分と判断してそのままにした |
| `e2e/v1.spec.ts` | **`ColumnAlertBadge`（`data-testid="column-alert"`）の e2e が無い。** 判定ロジック自体は `src/core/deck/column-alerts.test.ts`（Task 2、5 ケース）が固定しているが、「明示リレーを指定したカラムで実際にバッジが出る」ことは e2e で確認していない。理由（A-1 Task 5 の報告そのまま）: ローカル docker 環境で「到達不能な明示リレーを持つカラム」を安定して作る手段が無く（`seed-preview.ts` の単一リレー構成はすべて到達可能）、無理に作ると不安定な e2e になる。判定ロジックの正しさ（ユニットテスト）とレンダリング条件の確認は済んでおり、「実際にバッジが出るのを見る」ことだけが実鍵検証に委ねられている |

| 箇所 | 内容 |
|---|---|
| `subscription-manager.ts` | ~~**degraded からの復帰に起動経路が無い。** 接続層スライスで足した自動配線（プールが degraded への遷移を通知し、マネージャが 200ms 窓でまとめて `replan()` する）が発火するのは*遷移のとき*だけで、`DEGRADED_COOLDOWN_MS` の満了では発火しない。最終レビューの再確認で実測: クールダウン後は `degradedRelays` が空になっているのに、何も再選択を起こさないのでそのリレーは候補外のままになる。**除外の側で閉じたのと全く同じ形の隙間が、復帰の側に残っている**（除外の側は最終レビューの Important 1 として発見された）。クールダウンのタイマーが履歴を消すときにも同じ通知を出すのが素直な直し方~~ **2026-08-06 degraded-recovery-and-isolation Task 1 で解消。** `ConnectionPool.onDegraded` を `onDegradedChanged` に改名し、`degradedRelays` から出る 3 経路（クールダウン満了・実際に開いた・`retryNow()`）すべてで通知するようにした（`#clearFailures` に一本化）。マネージャ側の配線は変更不要 —— 既存の 200ms バッチ窓がそのまま復帰側の通知も吸収する |
| `subscription-manager.ts` | ~~`retryNow()` は失敗履歴を消すが、再プランを起こさない。選択から外されて `#drop` まで済んだ degraded なリレーには `Pooled` レコードがもう無いので、プール側の再接続ループは何もできず、履歴を消した効果は**次の無関係な `replan()` が走るまで現れない**。[ADR-0021](../adr/0021-reconnection-policy.md) に足した段落は `retryNow()` が即座の復帰手段であるかのように読める。**今日は潜在的** —— `retryNow` を呼ぶ UI がまだ無い。UI から繋ぐときに、`retryNow()` が `replan()` も起こすようにすること。**2026-08-06 degraded-recovery-and-isolation Task 1 で部分的に改善、まだ未解決。** `ConnectionPool.retryNow()` が呼ぶ `#clearFailures` は、degraded だった URL の履歴を消すとき通知するようになったので、`SubscriptionManager` の `#offDegraded` 配線を通って `DEGRADED_REPLAN_BATCH_MS`（200ms）のバッチ窓越しに `replan()` が追従するようにはなった。ただしこの行が本来指していた欠陥 —— 人間が起こす `retryNow()` それ自体が即座の再選択を起こさないこと —— はまだそのまま残っている: `SubscriptionManager.retryNow()` は今も pool への素通しの委譲のみで、同期的な再選択は無く、この経路を検証するテストも無い。しかも degraded な URL が 1 つも無い状態で呼んだ場合は `#clearFailures` の通知条件（消す前の `hard >= DEGRADED_AFTER_FAILURES`）を満たさないので通知自体が飛ばず、何もバッチされない。この計画の次のタスクは、まさにこの同期的な再選択を閉じるために存在する~~ **2026-08-06 degraded-recovery-and-isolation Task 2 で解消。** `SubscriptionManager.retryNow()` は `pool.retryNow()` への委譲のあと、同じ呼び出しの中で同期的に `#runReplan()` を呼ぶようになった —— degraded だった URL に `Pooled` レコードが残っていなくても、再選択そのものはマネージャ側が起こすので `#drop` 済みでも復帰できる。続けて保留中の `#degradedReplanTimer` があれば `clearTimeout` で畳む —— Task 1 の `onDegradedChanged` 通知が `pool.retryNow()` の途中でバッチタイマーを起動していることがあり、放置すると同じ復帰について 200ms 後にもう一度無駄な `replan()` が走るため。テストは `subscription-manager.test.ts` の `"retryNow() re-selects a degraded relay synchronously, and leaves no second replan queued"` |
| `connection-pool.test.ts` | ~~「ゾンビ再接続タイマーを残さない」テストが、名指ししている変異を捕まえない。縦断スライスの最終レビューで、`#attachConnection` のタイマークリア処理を削除して（まさにそのバグを再導入して）走らせたところ**通ってしまった**。`connectCalls` が増えないことしか見ておらず、`#reconnect()` の `pooled.connection` ガードによってタイマーの有無に関わらず真になるため。**製品コードは正しい**（直読と、もう 1 つの C2 テストの変異検出で確認済み）ので park した。**直すための道具は既に同じファイルにある** —— `clock.clearTimeoutCallCount` は以前の修正ラウンドで「`connectCalls` が増えないことはタイマーが消えた証明にならない、スケジューラ自身の呼び出し回数を直接数えるしかない」という理由で追加されたものであり、このテストはそれを使っていない~~ **2026-08-06 degraded-recovery-and-isolation Task 4 で解消。** `clock.clearTimeoutCallCount` の変化量を直接主張するアサーションを足した（`clearsBeforeRevival + 3` — 内訳: `#attachConnection` によるバックオフタイマーの解除、`connection.onOpen` が同期発火して呼ぶ `#clearFailures` によるクールダウンタイマーの解除、`publish()` 自身の `PUBLISH_TIMEOUT_MS` タイマーの解除）。`#attachConnection` 先頭のタイマークリアを削除する変異を実際に入れて、書き換えたテストだけが落ちることを確認してから元に戻した（他の 67 件は変異下でも通ったまま） |
| `connection-pool.ts` | ~~`#ensureConnection()` の connect 失敗経路が、`publish()` しか触っていない URL について**エントリ 0 件の `Pooled` レコードを `#pool` に残す**。`size` は生きている接続だけを数えるので予算には影響せず、`retryNow()`/`#reconnect()` も空エントリでは no-op なので実害は無いが、到達不能なリレーへ publish を繰り返すたびに死んだ Map エントリが積もる。テストも無い~~ **2026-08-06 degraded-recovery-and-isolation Task 4 で判定: 元の欠陥はこの計画の着手より前に解決済みだった、ただし解決したコミットは 1 つではない** — followups の更新漏れであり、Task 1〜3 のいずれもこの行に触れていない。空レコードを消すこと自体を最初に閉じたのは 2026-08-05 13:32 の `d2a428e`（縦断スライス最終レビュー、Critical 2 の一部）で、この時点では `if (pooled.entries.size === 0) this.#pool.delete(url);` だけだった（`holds` 判定は無い — `hold()` も `holds` フィールドもまだ存在しなかった）。`&& pooled.holds === 0` の判定は翌日 2026-08-06 08:49 の `d0c1355`（`hold()` と `holds` フィールドを新設したコミット）が足した。`this.#pool.delete(url)` を `#drop(url)` に置き換えて保留タイマーも一緒に消すようにしたのは、さらにその後 2026-08-06 10:15 の `5504026`。現在の `connection-pool.ts` の `publish()`（`!pooled.connection` 分岐）が `pooled.entries.size === 0 && pooled.holds === 0` を確かめて真なら `#drop(url)` で空レコードを消すのは、この 3 コミットが積み重なった結果であり、単独のコミットの引用ではない。エントリ 0 件・hold 0 件の `Pooled` を作れる経路はこの 1 つだけ（`subscribe()`/`hold()` はいずれも自分のエントリ/hold を先に足してから `#ensureConnection` を呼ぶので空にならず、`#reconnect()` の connect 失敗は既存レコードを触るだけで新規に空レコードを作らない）ため、実装読解だけで解決を確認できた。**テストは今も無い** — `#pool` の生死問わない Map サイズを外から観測するアクセサが無いため、`pool.size`（生きている接続だけ）だけでは「レコード自体が残っているか」を区別できない |
| `connection-pool.ts` | `publish()` が一時的に積む `PUBLISH_ONLY_HANDLERS` のエントリが安全なのは、`WebSocketRelayConnection.fail()` が**保留中の publish を reject してから** `onClose` を発火する、というマイクロタスク／マクロタスクの暗黙の順序に依存している。今日は正しい（reject はマイクロタスク、再接続は 500ms 以上先のマクロタスク）が、`fail()` の順序をリファクタすると `["REQ", subId]`（フィルタ 0 個）がワイヤに出る。順序を固定するテストが無い |
| `parse-relays.ts` | URL の検証を一切しない。壊れた URL が安全なのは `ConnectionPool.subscribe()` が 3 ファイル離れた場所で `connect()` を try/catch しているからで、その依存は文書化されていない。e2e 専用の抜け道なので実害は小さい |
| `fake-signer.ts` | 鍵から pubkey を導く（呼び出し側の `template.pubkey` を信用しない）挙動に直接のテストが無い。さらに最終レビューで判明したとおり**呼び出し元がリポジトリ内に 1 つも無い** —— 未テストのコードではなく未使用のコードである。署名器のテストへ配線するか、削除するか |
| `nip19.ts` | `LIMIT = 5000` は範囲外の TLV（`nevent`/`naddr`）を先取りした定数。無害、NIP-19 の計画でそのまま使う |
| `section-reader.ts` | `stop()` が `#items` / `#ids` を保持する。`createSection` からは到達しないが、公開メソッドとして意味が未文書。終局的と明記するか状態をクリアする |
| `section-reader.ts` | `start()` 内で `openRelay` が例外を投げた場合の経路がない。既に購読したリレーが漏れる。URL ごとに包んで `unreachable` にするほうが ADR-0011 に忠実 |
| `section-reader.ts` | `source.relays` の重複 URL が二重購読になり `unreachableRelays` を二重計上する |
| `section-reader.ts` | `#items` に store の内部オブジェクトを入れている。消費者が `items[0].content` を書き換えると全セクションの store が壊れる。水和が入る時点で `Object.freeze` かコピーを検討 |
| `websocket-relay-connection.ts` | ソケットが開く前に購読を閉じると無駄な `REQ` + `CLOSE` が飛ぶ。`RelaySubscription.close()` は `#isClosed()` で守られておらず、CLOSING 窓で flush されない `CLOSE` を積む。いずれも自己解消し有界 |
| `connection-pool.ts` | `#attachConnection` は `pooled.connection = connection`（`size` に数えられる。呼び出し順: ①`pooled.connection = connection` → ②`pooled.offClose = connection.onClose(...)` → ③`pooled.offOpen = connection.onOpen(() => this.#clearFailures(url))`）を、`#failures` を実際にクリアする ③ の登録より先に行う。実ソケットではこの ①→③ の窓が TCP/TLS ハンドシェイクの全体に及ぶ。窓の間に replan が来ると、その URL は `size` 上は「生きている」のに `degradedRelays` はまだクリアされていない（`onOpen` が発火していない）ため、`selectRelays` の `degraded` 入力から見て「回復しかけている最中」の URL が除外され、`#drop` で（開いたばかりの）ソケットごと閉じられてしまう。発生確率は低く（ハンドシェイクの間だけ、かつその間に replan が走る必要がある）、テストも無い。**Important 1（final review, 2026-08-06: degraded 遷移からの自動 replan）は replan の頻度そのものを引き上げるので、この窓に replan が当たる確率もわずかに上がる** —— 直接の原因ではないが無関係でもない。出口側の通知（degraded-recovery-and-isolation Task 1、クールダウン満了・onOpen・retryNow() での離脱）も同じ理由で replan 頻度を上げるが、対象 URL 自身の onOpen より後にしか発火しない（= その窓が閉じた後）ためその URL 自身の窓は広げず、上げるのは別の URL の窓に当たる確率だけである |
| `websocket-relay-connection.ts` | `Array.isArray(message)` が `any[]` に絞り、フィールドの静的型付けが失われる。`readonly unknown[]` 注釈で回復する |
| `relay-info.ts` | 失敗を一切キャッシュしないため、NIP-11 を持たないリレーへ毎回 fetch する。恒久的な焼き付きを避けた結果であり、対処するなら失敗側に短い TTL |
| `relay-info.ts` | `supported_nips` は 1 要素でも非数値なら全体を捨てる。実在するリレーには `"1"` のような文字列要素を出すものがあり、その場合 `supportsNip` が一律 false になる。要素単位のフィルタのほうが良い |
| `relay-info.ts` | `get()` の両分岐で clone-`.then()` が重複。`structuredClone` のほうが素直 |
| `relay-info.ts` | `fetchImpl.bind(globalThis)` は既定の native `fetch` には必要だが、注入された実装まで束縛し直すのは過剰。`constructor(fetchImpl = fetch.bind(globalThis))` にして保存時は束縛しないほうが正しい |
| `v1-section.tsx` | `DEFAULT_RELAY` がハードコードで `STREETS_E2E_RELAY_URL` を見ない。`e2e/fixtures/seed.ts` は見るため、上書きした環境で e2e が落ちる |
| `section-reader.ts` | `countUnroutableAuthors` を `status` の読み取りごとに再計算する。リレーが 0 件のときだけ通る経路なので現状は無料 |
| `routing-table.ts` | 参照のたびに store 検索と `parseRelayList`（Map 構築＋全タグ走査）を丸ごとやり直し、3 件を残して捨てる。`planQuery` は著者ごとに呼ぶため、500 人 × セクション数 × 再計画のたびに走る。導出元イベントの `id` をキーにメモ化すれば ADR-0016 の「導出・TTL なし」を壊さずに済む |
| `relay-url.ts` | パーセントエンコードされたパスセグメントを正規化しない（`%2f` と `%2F` が別 URL になる）。userinfo もそのまま保持する。既定ポート・大文字スキーム・IPv6 は正しいがテストがない |
| `query-plan.ts` | 1 つのフィルタ内の重複著者を除去しない。`Map` の反復順序も表明していない |
| `subscription-manager.ts` | `onEose` / `onClosed` の close 後抑制にテストがない（`onEvent` のみ）。1 プラン内の重複 URL と空プランも未テスト。明示リレー経路で `fallbackRelays` を使わないのに計算している |
| `bootstrap.ts` | `clearTimeout` / `getTimerCount` の表明がない。インデクサ 2 つが矛盾する `kind:3` を返すケース、不正な `p` タグの端から端までのケースも未テスト |
| `src/core/solid/provider.test.tsx`, `use-event-feed.test.tsx`, `use-event-relations.test.tsx`, `use-event.test.tsx`, `use-profile.test.tsx`, `use-social-read.test.tsx`, `src/routes/debug/v1-core.test.tsx` | 最終ブランチレビュー finding 6 で `tsconfig.test.json` を配線した際に発覚した、これらのスライスとは無関係な既存の型エラー 22 件。古いモックが `NostrCoreQueryClient` / `QueryRegistry` / `RxNostr` の現行の型（`getSnapshot` など新しい必須メンバーが増えている）に追随できていないのと、`rx-nostr` の `createRxNostr()` が引数必須になったのに呼び出し側が追随していないもの。vitest は型検査をしない（esbuild で transform するだけ）ので、これまで `pnpm typecheck` が `*.test.ts(x)` を丸ごと除外していたことで誰も気づいていなかった。レビューの指示（「まとめて直さず報告せよ」）に従い、`tsconfig.test.json` の `exclude` でこの 7 ファイルだけを外して `pnpm typecheck` を緑に保っている — 直したらそのファイルを `exclude` から外すこと |
| `connection-pool.ts` | ~~`#reconnect()` の `for (const entry of pooled.entries)` が `entry.handlers.onClosed(...)` を素で呼んでおり、1 つのセクションのコールバックが投げると残りのセクションが張り直しを受け取れない。最終レビューの Finding 4 が `#replanOnce` / `SectionReader.#notify()` で塞いだのと同じ形だが、この経路は差分に含まれていなかった~~ **2026-08-06 degraded-recovery-and-isolation Task 3 で解消。** `#attachConnection`（実際にこのループを持つのは `#reconnect()` ではなくここ — `#reconnect()` は `#attachConnection` を呼ぶだけ）の catch 節を `SubscriptionManager.#deliver` / `SectionReader.#notify` と同じ try/catch + `console.error` の作法で包んだ。テストは `connection-pool.test.ts` の `"isolates a throwing onClosed so the remaining entries are still re-attached"` — `subscribeFailing` と `die()` → `retryNow()` で `#attachConnection` を 2 エントリで通す |
| `connection-pool.ts` | `subscribe()` 自身の失敗報告 (`if (!entry.subscription) { handlers.onClosed("relay unavailable"); }`, 新規購読の初回失敗の経路) も同じく素で呼んでいる。今日は 1 呼び出しにつきエントリ 1 個しか無いので Task 3 が塞いだ「複数エントリが 1 ループで巻き添えを食う」形の実害は無いが、`onClosed` が投げれば公開メソッド `subscribe()` 自体が例外を投げて呼び出し元 (`SectionReader`) まで抜けてしまう。**2026-08-06 の最終レビュー Important 1 が `#notifyDegradedChanged`（`subscribe()`/`hold()`/`retryNow()` から到達しうる、同じく素の for ループだった）を listener ごとに隔離したので、`subscribe()` の「例外を投げない」契約を今なお破りうる経路はこの 1 箇所だけになった** —— このタスクノートを書いた時点では実は 2 箇所あり、「ここだけ例外」という当時の書き方はその事実に気づいていなかった。Task 3 で気づいたが、スコープ外（ブリーフが `#attachConnection` のみに限定）なので直していない |
| CI | 再入ガードと反復上限が同時に壊れると、`subscription-manager.test.ts` の収束テストが真の同期無限ループを再現する。JS の単一スレッド上では vitest のテスト単位タイムアウトが割り込めない。`.github/workflows/ci.yaml` の `test` ジョブに `timeout-minutes` が無いため、その場合 CI はプラットフォーム既定（数時間）までハングする。1 行の保険を入れる価値がある |

## 後続 #3（接続プール）で扱うと決まったもの

### 同一リレー向けの REQ マージ

NIP-01 は 1 つの `REQ` に複数フィルタを載せることを認めており（`01.md:118,147`、複数フィルタは OR）、同一リレーへ向かう複数カラムのフィルタを 1 購読にまとめられる。**購読数はカラム数に比例しない。**

代償は 2 つ。**EOSE は購読単位なので**（`01.md:157`）まとめると [ADR-0015](../adr/0015-section-status-excludes-renderer-fetches.md) の `phase` をセクションごとに解決できなくなる。また**同じ `subscription_id` への REQ は置換なので**（`01.md:137`）、1 カラムを閉じるとグループ全体が張り直しになり、他のカラムが初回クエリを再配信される。

両立させる形: **初回取得中はカラムごとに購読を分け**（EOSE の粒度が要る、上限超過分はキューイング）、**settled 後は 1 本にまとめて張り替える**（EOSE はもう要らない）。定常状態の購読数はリレーあたり約 1 本に落ちる。

これにより `max_subscriptions` はリレーの除外基準ではなく、**初回取得の並列度を決めるスケジューリングの入力**になる。実測では 8 〜 300 と大きく開きがある。詳細は [research/2026-08-01-nip65-relay-selection.md](../research/2026-08-01-nip65-relay-selection.md) 5.4 節。

**後続 #5 へ回った（2026-08-02）。** この節の見出しどおり当初は接続プール（後続 #3）で扱う想定だったが、[ローカルフィルタ照合のスライス](../superpowers/specs/2026-08-02-local-filter-matching-design.md) 0 節が「再照合はマージの付随作業ではなく前提条件である」と判定して切り出した結果、マージ自体は後続 #5 に回った。**本スライス（後続 #4）が用意したのはその前提条件のほうである。** マージすると 1 つの `subscription_id` に複数セクションのフィルタが相乗りするが、`EVENT` メッセージは `subscription_id` しか持たないため、届いたイベントをどのセクションへ配るか決める手段はフィルタ照合しかない —— マージは照合の上にしか乗らない。その照合器を `src/core/read/filter-match.ts` として用意し、`SubscriptionManager` / `bootstrap.ts` に配線した（下記「解消済み」）。

## 解消済み

- **性能 — 1 イベントごとの全ソートと全再描画** — [section-reader-performance のスライス](../superpowers/specs/2026-08-02-section-reader-performance-design.md)（後続 #6、[ADR-0023](../adr/0023-centralized-subscription-manager.md)「実装の段階」参照）で解消。`section-reader.ts` の `#onEvent` が1件ごとに配列を2回ソートし3回コピーしていたのをやめ、保持順を `SortedEvents`（`src/core/read/sorted-events.ts`）に一本化した。保持順は `compareEvents`（`created_at` 降順、同値は `id` 昇順）で決まる全順序で固定し、挿入は二分探索、上限超過時は末尾を1件 `pop` するだけで済む。`id` 集合も配列と同じ場所に持つため、追い出しのたびに全件を舐め直す必要も無くなった。通知は `Scheduler` 経由でバッチする（`NOTIFY_BATCH_MS = 16`、60fpsの1フレーム）— 最初の変化でタイマーを1本張り、以後の変化は既存のタイマーに相乗りする（デバウンスではない。デバウンスだとイベントが途切れない限り永久に発火しない）。`items` と `status` は同期的に正しいまま保たれ、遅れるのは通知だけである（[ADR-0015](../adr/0015-section-status-excludes-renderer-fetches.md) に追記済み）。バッチの結果、`start()` 中の中間状態を観測者に見せないためだけに存在していた `#starting` フラグは到達不能になり削除した。計測は `scripts/research/measure-section-reader-burst.mjs` / [docs/research/2026-08-02-section-reader-burst.md](../research/2026-08-02-section-reader-burst.md) に記録した — 比較回数（2,000件で旧実装の約157倍高速）は決定的だが壁時計は環境依存で揺れ、**これは回帰を防ぐガードではない**。E2E は `e2e/section-cap.spec.ts` が測る（下記「満たしていない要件」）。

  **この節が書いていた対処案「`#notify` をマイクロタスクで合流させ」は誤りだった。** NIP-01 のリレーは `["EVENT", subid, event]` を**1イベント1メッセージ**で送り、ブラウザは WebSocket メッセージごとに別のタスクを回す。メッセージ N で積んだマイクロタスクは N+1 が届く前に flush されるため、500イベント = 500タスク = **合流は起きず通知は500回のまま**になる。マイクロタスクが合流できるのは「1メッセージ内で同期的に発生した複数の通知」だけで、実際の配信パターンはそうなっていない。メッセージをまたいで合流するにはマクロタスク境界が要り、それが `Scheduler.setTimeout` によるバッチである。
- **ルーティング表の永続化**（ADR-0016 が「新しい永続化要件」としていたもの）— 2026-08-01 に撤回。`EventStore` 内の `kind:10002` から導出する形にしたため、専用の保存先も TTL も不要になった。永続化は ADR-0019 の「参照データ」バケットが `kind:10002` を保持すれば自動的に得られる。
- **生きているセクションを張り直す手段が存在しない** — 接続プールのスライスで解消、ただし引き金は後続 #4（ローカルフィルタ照合）で変わった。再計画そのものの機構（`SubscriptionManager.replan()` が `#runReplan()` を回し、変化したエントリにだけ `onPlanChanged` を配る per-section diff、フィルタが変わったリレーへの `SectionDelivery.onRelayRestarted(relay)` 通知）は今も生きていて、正しく動く。`SectionReader` は `onRelayRestarted` を受けて complete/unreachable を両方リセットするので、黙って `settled` を主張し続けることはない。接続自体は張り直さない（同一プール接続で close + subscribe）ので ADR-0016 の「解決後に張り直す」が指す再購読と、接続の張り直し（コスト）を混同していない。30 接続上限のもとで「今は開けないリレーを後で開く」経路も、`onRelayUnreachable` / `onRelayRestarted` の組み合わせでセクションへ伝わるようになった。**ただし `kind:10002` の到着を検知して自動でこれを起動する経路は無い。** 当初はここに `SubscriptionManager` が `kind:10002` の到着をデバウンスして再計画する経路があったが、後続 #4（[ローカルフィルタ照合のスライス](../superpowers/specs/2026-08-02-local-filter-matching-design.md) 6 節）がその引き金（`#scheduleReplan` / `#replanTimer` / `#isDemandedAuthor` / `replanDebounceMs`）を削除した——`matchesAnyFilter` により `kind:10002` はセクションが要求していない限りそもそも store へ届かず、再計画の材料にならないため。生きているのは公開 `replan()` と `scheduler` オプションのみで、**今この機構を動かすのは明示的な `replan()` 呼び出しだけ**である。水和や再ウォームアップなど「ルーティングを変えうる入口」を実装する側が、その入口から `replan()` を呼ぶ責任を持つ——呼ばなければ、この節が「解消済み」と書いている張り直し能力は配線されないまま眠り続ける。同じ訂正は [architecture.md](./architecture.md) 8節にも入れてある。
- **`RelayConnection` に接続単位のライフサイクル通知がない** — 接続プールのスライスで解消。`RelayConnection` seam（ADR-0014）に `onClose(listener: () => void): () => void` を追加した。購読単位の `onClosed` とは別に、ソケットそのものの死を通知する。`ConnectionPool` はこれで「ソケットの死」と「レート制限による個別 CLOSED」を区別できるようになり、死んだ接続を即座に予算とレジストリから外して次の `subscribe()` で新しいソケットを開く。再接続（ADR-0021）もこの通知を起点に組まれている。
- **接続数はフォロー人数に比例して無制限に増える** — 接続プールのスライスで解消。`ConnectionPool` が唯一の接続開設点になり（ADR-0023）、`MAX_CONNECTIONS = 30`（ADR-0011）をルーティング済み・明示指定・fallback・ブートストラップの全経路で強制する。著者ごとの先頭 N 本方式は `selectRelays` による貪欲被覆選択（ADR-0025）へ置き換わった。予算超過で被覆できない著者は `incomplete.uncoveredAuthors` として黙らず報告する。`e2e/connection-budget.spec.ts` が「予算を超えて開かない」「被覆が最大化される」「落とした著者を報告する」を測る。
- **リレーが配信したイベントをフィルタに再照合していない** — [ローカルフィルタ照合のスライス](../superpowers/specs/2026-08-02-local-filter-matching-design.md)（後続 #4）で解消。`SubscriptionManager.#handlersFor` が組み立てる `onEvent` は `store.put` より前に `matchesAnyFilter`（`src/core/read/filter-match.ts`）で判定し、`bootstrap.ts` の `collect()` にも同じ判定を入れて専用経路のブートストラップ取得も同じ信頼境界に揃えた。捨てた件数は `SubscriptionManager.unrequestedEventsByRelay`（リレーごと、単調増加）と `WarmUpResult.unrequested` に現れ、`/debug/v1-section` の `data-testid="unrequested"` / `"unrequested-relays"` から読める。`e2e/relay-lies.spec.ts` が `page.routeWebSocket`（`relay-recovery.spec.ts` で確立した手法）で悪意あるリレーを再現し、閲覧者がフォローしていない著者の正当な署名付きイベントを注入したうえで、そのイベントが `items` に出ないこと・カウンタが動くこと・正当なイベントは従来どおり届くことを主張する。副作用として、[ADR-0016](../adr/0016-routing-bootstrap.md) の「解決後に張り直す」を閉じていた `kind:10002` 到着による再プランの引き金が削除された（記録は ADR-0016 側）。
- **`tsconfig.e2e.json` がルートのビルドグラフに載っておらず、`pnpm typecheck` が `e2e/` を検査しない** — 最終ブランチレビュー finding 6 で解消。`tsconfig.json` の `references` に `tsconfig.e2e.json` と（新設の）`tsconfig.test.json` を追加した。予告どおり `e2e/v1-section.spec.ts` / `connection-budget.spec.ts` / `relay-recovery.spec.ts` の相対 import に `.js` 拡張子を足す機械的な修正が必要だった（TS2835、`NodeNext` の規約）。`tsconfig.test.json` は `*.test.ts(x)` も同じコンパイラオプションで検査する新しいプロジェクトで、`connection-pool.test.ts` のタイマーハンドル `number` バグ（standalone `tsc` でしか捕まらなかった、というコメントが同ファイルに残っている）と同じ種類のバグを今後 CI で検出できるようにする。この配線自体が「これまで気づかれていなかった既存の型エラー」を 7 ファイル分表面化させた — 詳細は上の「小さいもの」表、対応方針はレビューの指示どおり報告のみ（`tsconfig.test.json` の `exclude` で除外）。

## 満たしていない要件

[ADR-0011](../adr/0011-performance-budget.md) は性能予算が **E2E で測定可能でなければならない**と定めている（`測定できない予算は要件ではなく願望である`）。7 指標のうち **30 接続上限に続いて 500 件上限**が E2E で測れるようになり、測定済みは 2 つになった（[architecture.md](./architecture.md) 10節）。残る 5 指標は未測定。

**ただし「E2E が存在し実際にゲートする」と「CI がその E2E を実行している」は別の主張である。** `.github/workflows/ci.yaml` は `check` / `test`（vitest）/ `build` の 3 ジョブしか持たず、Playwright は一度も走らない。`e2e/section-cap.spec.ts` はローカルで走らせれば本物のガードである（`MAX_ITEMS_PER_SECTION` を 1000 に上げると実際に落ちる）が、push のたびに自動でそれを検査する仕組みはまだ無い。CI 配線は下記「次の計画で直すべきもの」に follow-up として記録した。

- **30 接続上限** — 解消済み。`e2e/connection-budget.spec.ts` が予算超過なし・貪欲被覆・落とした著者の報告を測る。実ソケットが死んで実リレーが復帰することは `e2e/relay-recovery.spec.ts` で測る（再接続そのものは 30 接続上限とは別の ADR-0021 だが、同じ接続プールのスライスで測定可能になった）。
- **500 件上限** — 解消済み。`e2e/section-cap.spec.ts` が 600 件（`MAX_ITEMS_PER_SECTION + 100`）を seed し（`e2e/fixtures/seed-cap.ts`）、`phase: settled` に達した時点で `/debug/v1-section` の `items` がちょうど 500 で止まることを主張する。
- 残る 5 指標（カラム数、初回表示 2 秒、操作反映 100ms、メモリ）はいずれも未測定。
