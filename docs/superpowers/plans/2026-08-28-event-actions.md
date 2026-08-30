# イベントアクション列と返信 — 実装計画

対応仕様: `docs/superpowers/specs/2026-08-28-event-actions-design.md`

## 1. タスクと Issue

- 返信 UI の Issue を作成する
- #200 / #201 に今回の射程と残る範囲を記録する
- #290 をこのスライスで閉じる

## 2. 楽観表示の共通化

- `ProjectedWriter` とユニットテストを追加する
- `v1.tsx` の投稿フォームを `ProjectedWriter` 経由へ移す
- `DeckColumn` の根カラムとスレッドで楽観イベントを重ねる
- duplicate、全滅時の巻き戻し、楽観挿入計測を既存挙動から落とさない

## 3. engagement 読み取り

- `ReactionRequests` を kind:1 / 6 / 7 の `EngagementRequests` へ置き換える
- engagement 集計の純関数とテストを追加する
- `EventStore` の変更購読を追加し、ローカル insert / rollback を表示へ伝える
- `ReactionList` を新しい取得・変更通知へ移す

## 4. アクション送信 module

- `EventActions` interface、production implementation、Provider を追加する
- 返信・リポスト・Like を builder と `ProjectedWriter` へ接続する
- `seenRelays` から実 URL だけをリレーヒントに選ぶ
- 書き込みエラーをUI向け文言へ変換する

## 5. UI

- Penpot に合わせた `EventActionBar` を `NoteFull` へ追加する
- Ark UI の返信ダイアログを追加する
- compact と kind:7 通知内の対象でアクションを抑止する
- アクション列とリアクションチップで click propagation を止める
- pending、送信済み、失敗、再試行を実装する

## 6. Storybook と E2E

- EventActions の成功・保留・失敗 adapter を用意する
- 通常、送信済み、返信ダイアログ、失敗、通知抑止の Story を追加する
- ローカルリレーで返信・リポスト・Like の E2E を追加する
- 捕まえる変異を一つずつ入れ、対象テストが赤くなることを確認する
- `pnpm verify:all` を前景で完走させる

## 7. 仕上げ

- 仕様・Issue と実装の差分を確認する
- 日本語コミットを意味単位で作成する
- `v1` 向けPRを作成する
- 別コンテキストのレビュー結果を反映する
