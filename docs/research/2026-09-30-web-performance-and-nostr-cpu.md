# Web の性能改善と Nostr 検証負荷の調査

2026-10-01 時点の調査記録。参加記は参加者本人の観測として扱い、Streets で同じ効果が出るという根拠にはしない。候補は計測で確かめる順に記す。

## 出発点

Streets の予算は、キャッシュありの初回イベント表示 2 秒、操作反映 100 ms、10 列でメモリ 500 MB、WebSocket 30 本である（[ADR-0011](../adr/0011-performance-budget.md)）。描画には `VirtualList` と `offscreen-skip`、画像には遅延読み込みと縮小 Worker、読み取り層には購読の共有・集約、署名には `SignatureGate` の検証済みキャッシュが既にある。したがって「仮想化する」「Worker を使う」「キャッシュする」を一般論として再実装しても改善にはならない。

`SignatureGate` は同じ `id` と署名を再受信した際にもイベント ID を再計算し、未確認の組だけ `verifyEvent` を呼ぶ。20,000 組を覚え、累積時間・回数・最大時間・省略回数を Devtools に出す（`packages/core/src/read/signature-gate.ts`、`apps/web/src/devtools/ReadLayerPanel.tsx`）。NIP-01 ではイベント ID は正規形の SHA-256、署名はその ID に対する secp256k1 Schnorr である。リレーが「検証済み」と言っても、クライアントで内容・ID・署名の結び付きを確認する必要がある（[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)）。

## Web Speed Hackathon の一次記録から得られること

| 年 | 本人・作問者の記録 | 行ったことと Streets への示唆 |
| --- | --- | --- |
| 2025 | [優勝者の参加記](https://zenn.dev/shun_shobon/articles/173450f5bec890) | Network と bundle analyzer で 57 MB の HTML、161 MB の JS、大きい API 応答を発見。初期ロードに乗るライブラリ・データ・動画処理を切り分けた。Streets では `build:analyze` と実際の転送量・評価時間を対で見る。大会の極端な初期値を改善率の予測に使わない。 |
| 2025 | [別の参加者の記録](https://blog.u-naoki.com/posts/cyberagent-web-speed-hackathon-2025-report/) | 重複画像 URL、API の循環的なネスト、不要な 1 秒待ちを解消。CSS でできる配置を JS から移し、画像の寸法を指定した。一方で主要な `fetch` の遅延を見落とし、他の改善が得点につながらなかったと述べる。Streets では画像ホストのばらつき、購読開始までの待ち、ネットワークの滝図を先に測る。 |
| 2024 | [優勝者の参加記](https://trap.jp/post/2170/)・[参加者の実装記録](https://trap.jp/post/2172/) | 不要な依存・ポリフィル・データ、過大な画像、常時ループを削減。画像形式の変更は画質、SVG の削除は表示、CSS の変更は見た目が壊れうる。Streets では固定アセットと画像の表示寸法を調べる一方、機能・見た目を Storybook で確認する。 |
| 2024 | [作問者の記録](https://blog.did0.es/entries/3669acb7-2d4d-418b-9f89-e60081eca144) | SSR の負荷、肥大化したクライアント JS、Canvas の描画負荷を出題側が意図して組み込んだ。Streets は静的配信と Nostr リレーが主で、SSR 化を先に試す理由にはならない。 |
| 2023 | [参加者の詳細な記録](https://zenn.dev/monica/articles/7e060938f72073) | 初回 JS を解析し、ページ単位の分割、使わない依存・ポリフィルの削除、画像のサイズ別生成を実施。最終的な見た目の差で失格となった。Streets の遅延読み込みは実際の初回依存グラフとロード後の操作遅延で判断する。 |

上の競技では意図的な待ちや極端に大きい素材を取り除くと大きく伸びる。Streets に同種の人工的な遅延があるという証拠はない。候補を採る条件は、実際の利用経路の前後比較である。

## 計測して試す順

現時点の実利用基準値として、Sentry の直近 30 日の `deck.first-content` は 389 件、平均 889 ms、75 パーセンタイル 623 ms だった（[Sentry 集計](https://streets.sentry.io/explore/traces/?query=span.op%3Aui.load&project=4508099784540160&aggregateField=%7B%22groupBy%22%3A%22span.description%22%7D&aggregateField=%7B%22yAxes%22%3A%5B%22count%28%29%22%2C%22avg%28span.duration%29%22%2C%22p75%28span.duration%29%22%5D%7D&mode=aggregate&sort=-count%28%29&statsPeriod=30d&table=span)。`ui.long_animation_frame` は 979 件、平均 110 ms（[Sentry 集計](https://streets.sentry.io/explore/traces/?query=span.op%3Aui.long_animation_frame&project=4508099784540160&aggregateField=%7B%22groupBy%22%3A%22span.op%22%7D&aggregateField=%7B%22yAxes%22%3A%5B%22count%28%29%22%2C%22avg%28span.duration%29%22%5D%7D&mode=aggregate&sort=-count%28%29&statsPeriod=30d&table=span)。いずれも標本化された値で、長いフレームの原因が署名検証だとはまだ言えない。

ローカルの Node/tsx で、有効な kind:1 イベント 500 件を生成し、同一プロセスで 5 回ずつ測って中央値を取った。新規検証は 0.78 ms/件、うち Schnorr 単体は 0.77 ms/件、イベント ID の SHA-256 は 0.0022 ms/件だった。検証済みの再配送は 0.0033 ms/件だった。署名だけを別の妥当な形式の署名に差し替えた無効イベントは、初回 0.78 ms/件、同じ無効イベントの再配送をキャッシュで弾く案では 0.0035 ms/件になった。これはこの計算機での局所値であり、実際の無効署名の再配送率や電力量の改善を示さない。

| 順 | 仮説と調べる箇所 | 測る値・試す変更 | 判定と注意 |
| --- | --- | --- | --- |
| 1 | 初回表示が通信・署名・描画のどこで止まるか。`telemetry.ts` の `ui.load`、カラムの表示印、Chrome Performance。 | キャッシュ有無、1/10/20 列、低速 CPU とネットワークを分け、初回イベント表示、LCP の TTFB・取得開始待ち・転送・描画待ち、INP の入力待ち・処理・表示待ちを記録する。Chrome は Performance の Bottom-up と Insights、Sentry はリリース別の実利用分布を見る。 | ボトルネック別に次を選ぶ。INP の良好値は 200 ms 以下だが、Streets の操作反映予算 100 ms を置き換えない（[web.dev INP](https://web.dev/articles/optimize-inp)、[Chrome Performance](https://developer.chrome.com/docs/devtools/performance/reference)）。 |
| 2 | 署名検証がイベントの大量到着でメインスレッドを占めるか。`SignatureGate`、`EventStore.put`。 | Devtools の `verify.count/ms/maxMs/skipped` に加え、到着件数/秒、50 ms 超のタスク、Long Animation Frames、入力遅延、画面が隠れた間の CPU を同時に記録する。`id` 再計算と Schnorr の時間を分ける。 | 平均だけでなくバースト中の最大、検証総時間、反応性を見る。LoAF は 50 ms 以上のフレームを拾うが Worker 内のスクリプト帰属は得られない（[Chrome LoAF](https://developer.chrome.com/docs/web-platform/long-animation-frames)）。 |
| 3 | 同一イベントの再配送が無駄なハッシュや索引を増やすか。`SignatureGate`、`SubscriptionManager`、`EventStore`。 | `id` 再計算の回数、同じ `id` のリレー間重複、store の `duplicate` 率、購読の張り直しと REQ 数を数える。既存の検証済みキャッシュのヒット率を見て、入力形の確認やデータの複製を減らす局所案を比較する。 | `id` だけを鍵にして検証を飛ばす変更は不可。同じ `id` の偽署名や変更された本文を受け入れないことをテストする（[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)）。 |
| 4 | 純粋な暗号計算を Worker に移すと入力遅延が減るか。 | 同じ実イベント群で「同期」「小さなバッチでメインスレッドを譲る」「専用 Worker」を比較。イベント 1 件と 100/1000 件の転送費用、並列度、初回 Worker 起動、順序、破棄時の遅延を計測する。 | Worker はメインスレッドを空けられても CPU 総仕事量や電力量を必ず減らすわけではない。採用条件は INP/初回表示と CPU 総時間の両方、かつ検証前イベントが UI・store に入らないこと（[MDN Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)）。 |
| 5 | 見えない列・タブで購読や描画が不要な仕事を続けるか。`column-scope.tsx`、`SubscriptionManager`、画像。 | 10 列で操作中/放置/背面タブの 5 分間について、WebSocket メッセージ、署名回数、CPU 時間、フレーム、メモリを記録。安全な購読縮小、画面外のメディア読込、不要な定期処理を一つずつ比較する。 | 利用者の希望は「時間が経ったら停止」。現在の最新 50 件の REQ を再発行するだけでは、非表示中に 50 件を超えた区間を取りこぼす。差分の完全な取り直しと未読・リレー再接続を設計してから停止する。Chrome の省電力モードは背面タブの CPU 利用に応じて凍結する場合もある（[Chrome 133 の説明](https://developer.chrome.com/release-notes/133)）。 |
| 6 | 画像の転送・復号・表示寸法が LCP とメモリを押し上げるか。`NoteMedia`、`Avatar`、`display-image.ts`。 | 実際に LCP となる画像の URL、表示寸法、転送バイト、decode、描画待ちを調べ、画面内候補の `loading`、優先度、外部ホストの応答、縮小 Worker の効果を分離する。 | 画面内の LCP 画像に `loading="lazy"` を付けると要求開始が遅れる。画面外画像にはブラウザの遅延読み込みが有効。Nostr の任意ホスト画像は安定したサイズ違いを常に持つわけではない（[web.dev LCP](https://web.dev/articles/optimize-lcp)、[web.dev 遅延画像](https://web.dev/learn/performance/lazy-load-images-and-iframe-elements)）。 |
| 7 | 初回 JS の parse/evaluate と遅延 import が起動を塞ぐか。`build:analyze`、`lazyPart`、`sentry-sdk.ts`。 | 圧縮後転送量だけでなく Performance の script 評価時間、初回依存チャンク、操作時に追加されるチャンクを比較。重いダイアログや Sentry の遅延読込を保ち、初回経路に混入したものだけ修正する。 | 変更前後で初回転送量と操作までの時間を両方測る。コード分割は依存チャンクの先読みや追加往復で逆効果になりうる（[web.dev INP](https://web.dev/articles/optimize-inp)、[2023 参加記](https://zenn.dev/monica/articles/7e060938f72073)）。 |
| 8 | 長時間利用で store・画像・DOM が増え続けるか。`EventStore`、`VirtualList`。 | 10 列で 30/90 分とスクロール往復の renderer メモリ、JS heap、DOM ノード、画像メモリを追う。保持イベント数と描画行数を別に記録する。 | DOM の仮想化だけでは store の保持量を抑えられない。イベント削除は無限スクロール、返信参照、削除依頼の整合性を確認する（[ADR-0011](../adr/0011-performance-budget.md)）。 |

## 電力についての測り方

署名検証の CPU 時間とソケットからの頻繁な起床は、充電消費の候補だが、Sentry の Web Vitals や `performance.now()` から Wh を算出できない。まず同じイベント流量で「前景で操作」「前景で放置」「背面」で CPU 時間、検証数、転送バイト、再接続数を比較する。次に同じ実機・画面輝度・ネットワーク条件で十分長く A/B を取り、OS の電力計測または外部電力計の値を比べる。ブラウザの Battery Status API は主要ブラウザ間で使えず、残量は測定誤差と他アプリの影響を受けるため、性能改善の合否判定に使わない（[MDN Battery Status API](https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API)）。低速端末は Chrome の CPU throttling を較正して反応性を再現するが、デスクトップの減速は実機の電力測定にはならない（[Chrome throttling](https://developer.chrome.com/docs/devtools/settings/throttling)）。

## 実装判断上の制約

- 検証は `SignatureGate` を唯一の入口に保つ。Worker 化する場合は同期 `EventStore.put` と API 境界が変わるため、局所ベンチで利益を確かめてから設計する。単に `setTimeout` で遅らせると、未検証イベントの表示や順序入れ替わりを招きうる。
- Schnorr のバッチ検証を既存ライブラリの ECDSA/BLS の `verifyBatch` と取り違えない。現在の noble の公開 API と対象曲線を実装時に確認し、個別の無効イベントを特定できることまで試す（[noble-curves の一次資料](https://github.com/paulmillr/noble-curves)）。
- Sentry に公開鍵・イベント ID・本文・画像 URL を送らない。現行 `telemetry.ts` は trace を本番で標本化し、URL とテキストを scrub する。追加するなら件数・時間・種類など集約値に限り、計測コード自身の負荷も比較する。
- 表示や状態を変えた場合は Storybook と主な利用経路の E2E を確認する。2023 年の参加記では得点改善後に見た目の差で失格になった（[本人の記録](https://zenn.dev/monica/articles/7e060938f72073)）。
