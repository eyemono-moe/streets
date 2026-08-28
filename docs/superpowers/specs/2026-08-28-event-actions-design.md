# イベントアクション列と返信 — 設計

## 1. 目的

v1 の kind:1 表示には、本文を読んだ後に返信・リポスト・リアクションを
返す導線が無い。イベントビルダと `Writer` は既に揃っているが、画面から
そこへ到達する seam と、楽観挿入したイベントをカラム・スレッドへ重ねる
共通経路が無い。

このスライスでは Penpot の `v1 / redesign` にある `Anatomy / actions` と
`Compose / 返信` を一次情報として、kind:1 のアクション列と返信ダイアログを
実装する。対象は GitHub Issues #200、#201、#290 と、新設する返信 UI Issue。

## 2. 表示する操作

`NoteFull` の本文下に次の三つを置く。

- 返信: Ark UI Dialog で返信フォームを開く
- リポスト: kind:6 を送る
- Like: content `+` の kind:7 を送る

件数は、直接の返信、kind:6 リポスト、Like の既知件数をそれぞれ表示する。
0 件は数字を出さない。自分が既にリポストまたは Like している場合は強調し、
削除送信が未実装なので再送はできない状態にする。

右上の `EventMenu` はアクション列と別の層として維持する。compact 表示には
アクション列を出さない。通知カラムの kind:7 が対象ノートを `full` で内包する
場合も、Penpot の「アクション列が無いイベント」に合わせて対象側のアクションを
抑止する。kind:6 が内包する元ノートでは、元ノートに対する操作として表示する。

操作のボタンとリアクションチップは、クリックしてもノートのスレッドを開かない。
これは #290 も同時に閉じる。

## 3. 今回表示しないもの

Zap、ブックマーク、画像添付、任意絵文字ピッカー、引用は実装しない。
押しても動かないボタンや、将来位置を確保するだけの disabled ボタンも置かない
（ADR-0026）。

#200 の任意テキスト・カスタム絵文字リアクション、#201 の kind:16 は残るため、
このスライスだけでは両 Issue を閉じない。実装後に完了した範囲をコメントする。

## 4. 返信ダイアログ

Ark UI (`@ark-ui/solid/dialog`) を使う。Kobalte は使わない。

ダイアログは次を持つ。

- タイトル「返信する」と閉じるボタン
- 返信元の著者・本文を compact 相当で示す領域
- textarea
- 文字数
- 返信ボタン
- 送信失敗時の、再試行できるエラー表示

空白だけの本文は送れない。送信中は二重送信を止める。成功したら閉じ、失敗したら
入力を残す。単一 textarea の小さいフォームなので Solid signal で管理し、Formisch
は導入しない。複数フィールドや構造化された検証を持つ最初のフォームで、既に合意
した Formisch + Valibot 方針を ADR に記録する。

## 5. `ProjectedWriter`

`Writer` は署名、`EventStore` への楽観挿入、publish、全滅時の巻き戻しを担う。
しかし `SectionReader` は購読経由で受け取ったイベントしか一覧へ載せないため、
`store.put()` だけではカラムやスレッドに新しい投稿が現れない。

v1 固有の module `ProjectedWriter` を作り、次を一つの interface に閉じる。

- `Writer.publish()` の呼び出し
- `onOptimisticInsert` で追加されたイベントの一覧
- duplicate を一覧へ二重に足さない規則
- publish 全滅時の一覧からの巻き戻し
- 楽観挿入にかかった時間

既存の新規投稿フォームもこの module へ移し、イベントアクションだけが別の
楽観経路を持たないようにする。`DeckColumn` は根のカラムだけでなく、開いている
スレッドにもこの一覧を重ねる。返信は署名直後にスレッドへ現れ、リレー応答後に
購読本体と id で重複排除される。

## 6. `EventActions`

読み取り用の `RenderContext` へ `Writer` を追加しない。書き込み依存を混ぜると、
全レンダラと全 Story が Writer の存在を知る浅い interface になるためである。

別の `EventActions` module と context を作り、外部 interface は次の三操作だけにする。

```ts
type EventActions = {
  reply(target: NostrEvent, content: string): Promise<void>;
  repost(target: NostrEvent): Promise<void>;
  like(target: NostrEvent): Promise<void>;
};
```

ビルダ選択、`ProjectedWriter`、リレーヒントの選択は implementation に閉じる。
リレーヒントは `EventStore.seenRelays()` のうち `ws:` / `wss:` として正規化できる
最初の URL を使う。`local` や `embedded` をタグへ書かない。

Provider が無い場合はアクション列自体を描かない。これにより読み取りだけを検証する
既存テストへ fake Writer の配線を強制しない。本番 `/v1` はログイン済みデッキ全体を
一つの Provider で囲む。Storybook は成功・保留・失敗を作れる fake adapter を使う。

## 7. engagement の取得と集計

現在の `ReactionRequests` は表示中の event id を 200ms 窓でまとめ、kind:7 を取得する。
これを `EngagementRequests` へ広げ、同じ `#e` バッチで kind:1 / 6 / 7 を取得する。
接続は引き続き `SubscriptionManager` と同じ `ConnectionPool` を通り、別 WebSocket
経路は作らない。

取得結果は `EventStore.eventsByTag("e", targetId)` から純関数で集計する。

- 返信: `replyTarget(event)?.id === targetId` の kind:1 だけ
- リポスト: `repostTarget(event)?.id === targetId` の kind:6 だけ
- Like: `parseReaction(event)` の対象が一致し、content が `like` の kind:7 だけ
- 自分の状態: 上記のうち `viewerPubkey` が著者のもの

返信の root タグに対象が含まれるだけの子孫を、直接返信件数へ混ぜない。
任意絵文字リアクションは既存の `ReactionList` には引き続き表示するが、ハート横の
件数には Like だけを数える。

楽観挿入と巻き戻しでも集計が再評価されるよう、`EventStore` に insert / remove を
通知する購読 interface を足す。イベントを通知するだけで kind の意味は store に
持たせず、解釈は上記の集計関数へ置く（ADR-0004）。

## 8. エラーと操作状態

同じイベントの同じ操作は、処理中に再実行しない。返信ダイアログ、リポスト、Like
はそれぞれ独立した pending / error を持ち、一つの失敗で他のボタンを止めない。

`WriteFailedError` は「どのリレーにも届かなかった」、`SignerUnavailableError` は
「署名器を利用できない」として行動可能な文言へ変換する。未知の例外は詳細を隠さず
再試行導線とともに表示する。成功件数などの診断値は通常画面へ常設しない。

## 9. Storybook と検証

Storybook に少なくとも次を追加する。

- 通常のアクション列
- Like / リポスト済み
- 返信ダイアログ
- 送信中
- 送信失敗
- kind:7 通知ではアクション列が無い状態

ユニットテストは `ProjectedWriter` の duplicate / rollback、engagement の直接返信
判定と本人状態、`EventActions` のビルダ・リレーヒント、クリック伝播、返信フォームの
入力保持を検証する。「捕まえる変異」を書いたテストは実際に対象変異を入れて赤を確認
してから戻す。

E2E はローカルリレーと既存の fake NIP-07 signer を使い、返信・リポスト・Like が
実際に署名・publish され、返信とLikeが楽観的に画面へ反映される一本の経路を確認する。
最終入口は `pnpm verify:all` とする。
