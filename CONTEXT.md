# streets

デスクトップブラウザ向けの、マルチカラム型 Nostr クライアント。Nostr で表現されるあらゆる種類のイベントを、ユーザーが自由に並べたカラムに表示することを目的とする。

## Language

### 画面の構成

**デッキ**:
ユーザーが並べたカラムの集合と、その並び順・幅などの設定全体。アクティブなアカウントごとに1つ存在する。
_Avoid_: ワークスペース、ボード、レイアウト

**カラム**:
デッキを構成する縦1列。1つ以上のセクションの縦積みで構成される。
_Avoid_: ペイン、タブ、ウィジェット、フィード

**セクション**:
カラムを構成する区画。ソース・並び順・レンダラ群を持つ。大半のカラムは1セクションだけを持ち、ユーザー詳細やリレー詳細のように固定情報とリストを併せ持つカラムが複数セクションになる。カラム内で最後のセクションだけが無限スクロールする。
_Avoid_: ブロック、パート、エリア

**ソース**:
セクションに並べる項目の供給元。Nostr フィルタとは限らず、NIP-11 のリレー情報のように Nostr イベントですらない供給元もありうる。
_Avoid_: データソース、プロバイダ、クエリ

**レンダラ**:
ある kind のイベント1件を描画するコンポーネント。その kind に固有の知識（どのタグが何を指すか、どの関連イベントが必要か）を持つ唯一の場所。
_Avoid_: ビュー、カード、アイテムコンポーネント

**トークン**:
`parseContent`（`src/core/nostr/content.ts`）が `content` を分けた一片。テキスト・URL・メンション・カスタム絵文字・ハッシュタグのいずれか1種。レンダラはこれを受け取って描くだけで、`content` の生文字列を直接扱わない。
_Avoid_: セグメント、チャンク、認証トークン（NIP-98 等の別概念と紛れる）

**フォールバック表示**:
レンダラが未実装の kind に対する汎用の描画。著者・時刻・`content` をプレーンテキストで示す。レンダラの未実装は一時的な状態ではなく恒常的な状態であるため、これは例外処理ではなく通常の描画経路の一部である。

**既定デッキ**:
アカウントに紐づくデッキがまだ存在しないユーザーに、最初に与えられるカラム構成。
_Avoid_: 初期レイアウト、テンプレート

### 読み取りの仕組み

**読み取り層**:
ソースを実イベント列に変える単一の深いモジュール。ルーティング・クエリのリレー別分割・合流・重複排除・リレー別ページネーション・完了判定・needs の解決・件数と接続数の上限制御をすべて内側に持つ。呼び出し側が知るのは `createSection(source)` が返す `{ items, status, loadMore }` だけ。
_Avoid_: クエリ層、リポジトリ、データレイヤ

**ルーティング表**:
著者の公開鍵から、その著者のイベントを取りに行くべきリレーへの対応表。NIP-65 (`kind:10002`) を一次情報とし、リレーヒントと既定リレーで補う。
_Avoid_: リレーマップ、ピアテーブル

**needs**:
レンダラが宣言する、そのイベントを描くために必要な関連イベントの一覧。取得は行わない純粋関数であり、読み取り層がこれを集約して解決する。
_Avoid_: 依存、デプス、プリフェッチ指定

**波状解決**:
読み取り層が needs を解決する方法。セクション内の全アイテムの needs を集約して1クエリで引き、新しく届いたイベントの needs をまた集約して次の1クエリで引く、という反復。収束するか深さ上限に達すると停止する。各波が1クエリであるため N+1 が構造的に潰れる。
_Avoid_: カスケード、再帰フェッチ

**署名器**:
本人の秘密鍵を保持し、streets に代わって署名・復号を行う外部コンポーネント。NIP-07 のブラウザ拡張、または NIP-46 のリモート署名器を指す。streets は本人鍵を保持しない。NIP-46 transport の通信専用client keyは [ADR-0031](./docs/adr/0031-nip46-session-key-boundary.md) の限定された例外。
_Avoid_: ウォレット、キーストア、サイナー

**アクティブアカウント**:
現在 streets が署名対象とし、「自分宛」の判定基準としているアカウント。常に1つだけ存在する。
_Avoid_: カレントユーザー、ログインユーザー、me

## 決定の一覧

### 要件

| ADR | 決定 |
|---|---|
| [0001](./docs/adr/0001-others-first-self-via-settings.md) | 「他人が使えること」を自分の利便性より優先する |
| [0002](./docs/adr/0002-v0-parity-before-cutover.md) | v0 機能パリティを満たしてから一括切替する |
| [0003](./docs/adr/0003-open-column-abstraction.md) | カラムを「イベントの配列」の開いた抽象とする |
| [0004](./docs/adr/0004-kind-knowledge-lives-in-kind-specific-code.md) | kind 固有の知識は kind 側に置き、共有層は kind を知らない |
| [0005](./docs/adr/0005-outbox-model-from-v1.md) | Outbox Model (NIP-65) を v1 の最初から実装する |
| [0006](./docs/adr/0006-no-dm-in-v1.md) | v1 では DM (NIP-17) を実装しない |
| [0007](./docs/adr/0007-nip-tracking-pipeline-draft-pr-only.md) | NIP 追従パイプラインは draft PR までとし自動マージしない |
| [0008](./docs/adr/0008-signer-only-key-handling.md) | 秘密鍵をアプリに渡さない（NIP-07 / NIP-46 のみ） |
| [0009](./docs/adr/0009-mobile-single-column-view-only-editing.md) | モバイルは1カラム表示、デッキ編集はデスクトップ専用 |
| [0010](./docs/adr/0010-single-active-account.md) | 同時にアクティブなアカウントは常に1つ |
| [0011](./docs/adr/0011-performance-budget.md) | 性能予算を数値で固定し E2E で測定可能にする |
| [0012](./docs/adr/0012-external-images-loaded-directly-by-default.md) | 外部画像は既定で直接読み込む |
| [0013](./docs/adr/0013-deck-persisted-to-nip78.md) | デッキ設定を NIP-78 に保存する |

### 設計

| ADR | 決定 |
|---|---|
| [0014](./docs/adr/0014-thin-relay-connection-deep-read-layer.md) | Transport を1リレー専用に落とし、上に深い読み取り層を置く |
| [0015](./docs/adr/0015-section-status-excludes-renderer-fetches.md) | セクションの `status` はレンダラの遅延取得を含めない |
| [0016](./docs/adr/0016-routing-bootstrap.md) | ルーティング表は専用経路で構築しウォームアップ・永続化する |
| [0017](./docs/adr/0017-declarative-renderer-needs.md) | レンダラは needs を宣言し、読み取り層が波状に解決する |
| [0018](./docs/adr/0018-indexeddb-event-cache.md) | イベントを IndexedDB にキャッシュしメモリへ水和する |
| [0019](./docs/adr/0019-two-bucket-cache-policy.md) | 永続キャッシュを2バケットに分け、削除指示は破棄しない |
| [0020](./docs/adr/0020-no-nostr-library-noble-primitives-only.md) | Nostr ライブラリに依存せず、監査済み暗号プリミティブだけを借りる |
| [0021](./docs/adr/0021-reconnection-policy.md) | リレー再接続は指数バックオフ + ジッタで永久に諦めない（接続プールで実装済み） |
| [0022](./docs/adr/0022-deploy-to-cloudflare-workers-static-assets.md) | v1 以降は Cloudflare Workers の static assets として配信する（**proposed** — 未実装） |
| [0023](./docs/adr/0023-centralized-subscription-manager.md) | リレー接続と購読を単一の管理システムに集約する |
| [0024](./docs/adr/0024-shared-bodies-per-section-membership.md) | イベント本体は共有し、メンバーシップはセクションが持つ |
| [0025](./docs/adr/0025-greedy-relay-selection-under-a-global-budget.md) | 大域予算のもとで冗長度つき貪欲集合被覆によりリレーを選ぶ |
| [0026](./docs/adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md) | 常に見せるのは行動できる異常だけとし、診断値は開発者モードの背後に置く |
| [0027](./docs/adr/0027-account-boundary-and-cache-scope.md) | キャッシュする kind を「誰が見てよいか」で分類し、名乗らないものは永続化しない |
| [0028](./docs/adr/0028-ark-ui-for-v1-ui-primitives.md) | v1 の UI プリミティブは Ark UI に統一する |
| [0029](./docs/adr/0029-mutation-testing-for-build-and-write.md) | テストが宣言する変異は実際に落とせなければならない、を `src/core/nostr/build/`・`src/core/write/` で Stryker により強制する |
| [0030](./docs/adr/0030-single-verification-entrypoint.md) | ローカルと CI の検証入口を `verify` に揃える |
| [0031](./docs/adr/0031-nip46-session-key-boundary.md) | NIP-46 transport の通信専用 client key と本人鍵の境界を固定する |

設計の全体像は [docs/design/architecture.md](./docs/design/architecture.md)、既定リレー選定の調査は [docs/research/](./docs/research/)、スライスの記録は [docs/design/read-layer-followups.md](./docs/design/read-layer-followups.md)、動作確認の手順は [docs/design/verifying-v1-section.md](./docs/design/verifying-v1-section.md)を参照。**残タスクは [GitHub Issues](https://github.com/eyemono-moe/streets/issues)**（ラベル: 領域 `read-layer`/`ui`/`perf`/`test`/`infra`/`nip`/`observation`、優先度 `P1`/`P2`/`P3`、着手前にデザインが要るものは `design-needed`）。

## 書き方

### コードコメント

**書くのは、コードから復元できない非自明な WHY だけ。** 隠れた制約、workaround を入れた理由、読み手が驚く挙動。

**書かないもの:**

- **WHAT** —— コードを読めば分かること（`// ユーザー ID を取得する` の類）
- **変更履歴** —— 「〜を追加した」「旧実装では〜だった」「レビューの指摘で〜」。残したい経緯は ADR に書く
- **タスク ID / レビュー参照** —— `(UZU-XXXX)`、`(finding 9a)`、`(Task 2 fix round 1)` の類

コメントが「今このコードが何を守っているか」ではなく「そこへ至った経緯」を語り始めたら、行き先は ADR である。

### ドキュメント

**最新仕様のスナップショットだけを書く。** issue 参照・経緯・マイグレーション履歴は書かない。

例外は [docs/adr/](./docs/adr/) —— ADR は決定と**その理由**を記録する場所であり、経緯はここにだけ残す。

### 既存コードの扱い

この方針は 2026-08-10 に定めた。**それ以前のコメントには変更履歴やレビュー参照が多く残っている。** 一括での書き換えはしない —— レビューで積み上げた非自明な WHY を巻き添えで消すほうが損失が大きい。**触ったファイルで直す。**
