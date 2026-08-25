# AGENTS.md

コーディングエージェント向けの入口。**規約そのものは [CONTEXT.md](./CONTEXT.md) と [docs/adr/](./docs/adr/) にある。ここはそれを繰り返さず、「知らないと踏む罠」と「今どこにいるか」だけを書く。**

会話は日本語。コミットメッセージ・コメント・ドキュメントも日本語。

## 最初に読むもの

| | |
| --- | --- |
| [CONTEXT.md](./CONTEXT.md) | 用語・画面の構成・読み取りの仕組み・**コメントとドキュメントの書き方**。130 行。全部読むこと |
| [docs/adr/](./docs/adr/) | 0001〜0030。決定と**その理由**。経緯が残っているのはここだけ |
| [docs/design/architecture.md](./docs/design/architecture.md) | 読み取り層の全体像。8 節に未実装箇所が集約されている |
| [docs/design/read-layer-followups.md](./docs/design/read-layer-followups.md) | スライスで得た知見と判断理由。実行するタスクは GitHub Issues を参照 |

## 環境

- **pnpm 9.7.0**（`packageManager` で固定）。npm / yarn を使わない
- Node 20（check / test / build）と Node 22（e2e）。CI はこの 2 つで回る
- e2e にはローカルリレーが要る: `docker compose up -d nostr-rs-relay nostr-rs-relay-2`（8080 / 8081）

## 知らないと踏む罠

### 検証入口は `verify` の 1 本

```sh
pnpm verify       # check + typecheck + unit test + build
pnpm verify:all   # 上記 + Playwright
```

CI も同じ `verify` を呼びます。ブラウザを含む変更はローカルリレーを起動し、`verify:all` を前景で実行してください。詳細と `tsc --noEmit` を入口にしない理由は [ADR-0030](./docs/adr/0030-single-verification-entrypoint.md)。整形と import 順は `pnpm fix` で直ります。

### e2e はバックグラウンドで走らせない

前景で実行し、出力を最後まで見ること。バックグラウンドにすると結果を取り逃がし、「落ちたのに気づかない」が起きます。

初回の 1 本目は Vite の**ルートごとのモジュール変換**を被ります（依存の事前バンドルとは別のコスト）。`e2e/global-setup.ts` が spec の使うルートを 1 つずつ暖機しているのはそのためで、**新しいルートを使う spec を足したら暖機の一覧にも足すこと**。

### `relays: []` は「未指定」ではない

読み取り層では**空配列は「リレー 0 本の明示指定」**で、そこへは何も送られません。`authors: []` も同じく「該当者なし」であって「誰でもよい」ではありません。「まだ分からない」を表したいときは**キーごと省略**します（`resolveSource` のコメント参照）。

### Solid: 購読を作る memo に「settle したら変わる値」を読ませない

`DeckColumn` の `source` memo が warmUp のリソースを読むと、ウォームアップが片付くたびに**全カラムの `SectionReader` が破棄・再作成**されます。だから `resolveSource` の `followees` / `readRelays` は遅延アクセサで渡し、**それを必要とする分岐の中でだけ呼びます**。同型の事故が 2 回起きています。

警告やバッジを出す memo（購読を作らない）は warmUp に依存してよく、むしろ依存しないと状態が更新されません。

### テストは「捕まえる変異」を書き、実際に赤くなることを確かめる

このリポジトリのテストには「捕まえる変異: …」というコメントが付きます。**書いたら実際にその変異をコードへ入れて、狙ったテストが落ちることを見てから戻すこと。** 確認していないことをレポートに書かないこと。

`src/core/nostr/build/**` と `src/core/write/**` は StrykerJS で機械的に強制されています（`pnpm mutation`、閾値 100%、[ADR-0029](./docs/adr/0029-mutation-testing-for-build-and-write.md)）。読み取り層と CI 組み込みは範囲外と決まっています。

**フィクスチャの既定値を期待値と一致させると、そのアサーションは何も検証しません。** 同じ形の欠陥が独立に 4 回出たので機械化しました。

### e2e フィクスチャの秘密鍵はシード空間が 255 しかない

鍵は `((seed + i * 7) % 255) + 1` で作ります。**`% 255` により、離れた数字（911 と 1031 など）でも同じ pubkey になります。** 新しいフィクスチャを足したら `e2e/fixtures/fixture-pubkeys.test.ts` の一覧にも追加してください（衝突を機械的に検出します）。

### Nostr の実装にライブラリを使わない

[ADR-0020](./docs/adr/0020-no-nostr-library-noble-primitives-only.md)。暗号プリミティブ（noble）以外は自前です。**射程は Nostr だけ**で、それ以外（検証は valibot など）はライブラリを使って構いません。e2e フィクスチャが `nostr-tools` を使っているのは、テスト側は射程外だからです。

### 秘密鍵をアプリが持たない

[ADR-0008](./docs/adr/0008-signer-only-key-handling.md)。署名は NIP-07 / NIP-46 の署名者へ委譲します。`signer.ts` / `nip07-signer.ts` が秘密鍵を名前に出すことも保持することもありません。NIP-44 の暗号化も署名者へ委譲します。

### 劣化を隠さない。ただし、まだ存在しない劣化を確定した事実として見せない

[ADR-0011](./docs/adr/0011-performance-budget.md)。取得中と取得失敗を区別せずに「取得できませんでした」と出すのは、この規約の**逆方向の違反**です。実際に 2 回作り込みました（スレッドの「これより前の返信は取得できていません」、通知の「リレー設定が見つかりません」）。どちらも「片付いたか」のゲートを足して直しています。

ユーザーが**行動できる**異常だけを画面に出します。行動できない診断値は開発者モードの背後へ（[ADR-0026](./docs/adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md)）。

### 同時に開く WebSocket は 30 本まで

[ADR-0011](./docs/adr/0011-performance-budget.md)。publish 用の別経路を作らず、`ConnectionPool` 一本に集約します。**明示リレー（`NostrSource.relays`）は予算都合で落とされず必ず開かれる**ので、そこへ流し込む URL の件数には注意が要ります。

## ブランチとレビュー

**`v1` が開発ブランチです。`main` へ直接マージしません。** 作業は `v1` から切って `v1` へ戻します。

v1 は後方互換性なしの全面書き換えです。`src/features/` 以下の旧実装は参照してよいが、合わせる必要はありません。新しい読み取り層は `src/core/read/`、v1 の画面は `src/routes/v1/`。

コミットは日本語で、**何をしたかではなく何を直したか・なぜそうしたか**を書きます。

## 残タスクと判断理由の在り処

**実行するタスクの正は [GitHub Issues](https://github.com/eyemono-moe/streets/issues)。** 領域ラベル（`read-layer` / `ui` / `nip` / `test` / `infra` / `perf` / `observation` / `bug`）+ 優先度（`P1`〜`P3`）+ 着手前に設計が要るものは `design-needed`。

**[`docs/design/read-layer-followups.md`](./docs/design/read-layer-followups.md) は、スライスを実際に動かして得た知見と判断理由の記録。** タスク管理はせず、未完の作業は対応する Issue 番号から追う。着手時は Issue だけでなく、リンクされた followups の節も読み、既に下した判断を蒸し返さないこと。

## 開発の進め方

このリポジトリは**仕様 → 計画 → 実装**の順で進めてきました。記録は残っています。

- 仕様: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- 計画: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
- 各スライスの答えと判断理由: `docs/design/read-layer-followups.md`

設計判断を含む作業では、**実装の前に仕様を書いて人に確認を取ってください。** 過去の仕様は「何を決めたか」だけでなく「何を決めなかったか・なぜ」も書いており、次の読み手はそれを頼りにします。

小さい修正（followups に「直し方」まで書いてあるもの）は仕様を挟まずに進めて構いません。

## 手で触る

```sh
pnpm dev                                  # 5173
docker compose up -d nostr-rs-relay nostr-rs-relay-2
pnpm seed:dev                             # スレッドの各形をローカルリレーへ
```

`/v1?relays=ws://127.0.0.1:8080` を開いてログイン → 「+ カラムを追加」。`?relays=` はカラムの明示リレーを**解決の後で**上書きします（e2e もこれを使います）。

**この上書きは、明示リレーを持つカラムのリレー選択を検証不能にします。** 通知カラムは常に明示リレーを持つので、e2e はそのリレー選択を証明していません（ユニットテストの担当）。

`docs/design/verifying-v1-section.md` に読み取り層の動作確認の手順があります。

## いま動くもの / 動かないもの

**動く**: デッキ（ホーム / ユーザー / ハッシュタグ / グローバル / 通知の 5 種別、追加・削除・並べ替え・改名・localStorage 永続化）、Outbox ルーティング、接続プールと再接続、IndexedDB キャッシュ、kind:1/6/7 の描画、プロフィールカードとホバー、スレッド表示、通知カラム、投稿（kind:1）の送信。

**動かない**: リアクション・リポスト・フォロー・ミュートの**送信**（ビルダは `src/core/nostr/build/` に揃っているが UI 配線が無い）、設定画面、NIP-46、検索、画像アップロード、Zap、モバイル表示、デッキの NIP-78 保存。

機能単位の棚卸しは [`docs/design/v1-feature-inventory.md`](./docs/design/v1-feature-inventory.md)。着手順の提案もそこにあります（通知カラムまで完了、次は NIP-46）。
