# NIP-09 削除依頼の表示反映 — 実装計画

## 対応する仕様

[2026-08-29-nip09-deletion-application-design.md](../specs/2026-08-29-nip09-deletion-application-design.md)

## 変更のまとまり

### 1. 削除依頼を由来ごと永続化する

対象:

- `src/core/read/event-persistence.ts` / `.test.ts`
- `src/core/read/indexeddb-persistence.ts` / `.test.ts`
- `src/core/read/read-layer.ts` / `.test.ts`
- EventPersistence の stand-in を持つテスト

手順:

1. `deletedIds` と id 配列の保存・削除を、検証済み kind:5 イベントの
   `deletionRequests` / `saveDeletionRequest` / `deleteDeletionRequest` へ置き換える。
2. Memory 実装を削除依頼 id ごとの Map にし、同じ依頼の再保存と個別巻き戻しを固定する。
3. IndexedDB を version 2 へ上げ、`deletions` を削除依頼 id key の event store にする。
4. 同じ flush に保存と削除が積まれた場合は削除を勝たせる。
5. 起動時に削除依頼を通常イベントより先に `EventStore.hydrate` へ渡す。
6. version 1 は既存方針どおり全 store を破棄し、安全でない bare target id を移行しない。

検証:

```sh
pnpm exec vitest run src/core/read/event-persistence.test.ts src/core/read/indexeddb-persistence.test.ts src/core/read/read-layer.test.ts
```

### 2. `EventStore` を可視性の唯一の判定者にする

対象:

- `src/core/read/event-store.ts` / `.test.ts`
- 必要なら削除座標の純関数を同ファイル内に置く

実装するもの:

- kind:5 event、`e` target、`a` coordinate の相互索引
- 可視本体と非表示本体の分離
- 対象先着 / 削除依頼先着の両順序
- `e` の対象著者一致、`a` の座標著者一致と `created_at` 上限
- 削除依頼を対象にした削除依頼の無視
- 同一対象への複数依頼
- 削除依頼の物理 `remove()` による tombstone 巻き戻しと再表示
- addressable event を再表示したときの置換可能索引再計算
- `PutResult` の `"hidden"` と `EventStoreChange` の `hide` / `show`
- `isHidden(id)`。読み取り配送が非表示メンバーを覚えるためだけに公開する

`get()`、`eventsByTag()`、`latestReplaceable()` は可視本体だけを返す。非表示本体を
通常の `remove()` と同じ永続削除へ流さず、削除依頼が消えたときに取得元・取得時刻ごと
戻せるようにする。

### 3. セクションと楽観投影を可視性通知へ追随させる

対象:

- `src/core/read/sorted-events.ts` / `.test.ts`
- `src/core/read/section-reader.ts` / `.test.ts`
- `src/routes/v1/projected-writer.ts` / `.test.ts`
- `src/routes/v1.tsx` の生成配線

手順:

1. `SortedEvents.remove(id)` を追加し、配列と id 集合を同時に更新する。
2. `SectionReader.start()` で store を購読し、`hide` で表示集合から外して
   非表示メンバーを記録、`show` でそのセクションに属していた id だけを戻す。
3. 対象が既に非表示の状態で `onEvent` が来た場合も非表示メンバーへ記録する。
4. `stop()` で store 購読、非表示メンバー、通知 timer をすべて破棄する。
5. `ProjectedWriter` に store を渡し、成功済み・保留中どちらの entry も
   `hide` / `show` で非表示・再表示する。物理 remove と publish 全滅の既存処理は維持する。
6. ReactionList / EventActionBar は store のタグ索引を再読込する既存購読で
   hide / show にも追随することを対照テストで確認する。

### 4. 読み取りと書き込みの `"hidden"` 境界を固定する

対象:

- `src/core/read/subscription-manager.ts` / `.test.ts`
- `src/core/write/verify-optimistic-insert.ts` / `.test.ts`
- `src/core/write/writer.ts` / `.test.ts`

手順:

1. `SubscriptionManager` は `"hidden"` を署名不正として数えず、通常どおり
   `onEvent(id)` を配送する。
2. `verifyOptimisticInsert` は `"hidden"` を例外にし、楽観表示と publish へ進ませない。
3. kind:5 自身は削除依頼の対象にならず、従来どおり `"inserted"` で Writer の
   rollback 対象になることを固定する。
4. `src/core/write/**` の新しい分岐を Stryker が全て kill するテストにする。

検証:

```sh
pnpm exec vitest run src/core/read/subscription-manager.test.ts src/core/write/verify-optimistic-insert.test.ts src/core/write/writer.test.ts
pnpm mutation
```

### 5. ブラウザで到着順と偽装削除を確認する

対象:

- `e2e/fixtures/seed.ts` または NIP-09 専用 fixture
- `e2e/deletion.spec.ts`
- fixture pubkey 一覧（seed を増やす場合）

kind:5 を明示取得する専用カラムを作り、一つの spec で次を通す。

- 表示済みイベントへ同じ著者の kind:5 が届くと消える
- kind:5 が先に届いても、後着の対象は一度も表示されない
- 別著者が同じ target id を `e` に入れても対象は残る
- `a` は削除依頼時刻以前の版だけを隠し、新しい版を残す

ローカル kind:5 の publish 全滅は、リレー応答の人工制御を増やさずユニットテストで
決定的に確認する。

### 6. 最終検証と記録

1. 追加した「捕まえる変異」を実コードへ一つずつ入れ、対象テストが赤になることを
   確認して戻す。
2. `pnpm mutation` を実行する。
3. ローカルリレーを起動し、`pnpm verify:all` を前景で完走させる。成功ログは全文を
   会話へ流さず、件数と終了状態だけを残す。
4. 実装で初めて分かった判断理由だけを followups へ追記する。ユーザーの既存変更へ
   重なる場合は別ファイルまたは別節にし、勝手に混ぜない。
5. 機能棚卸しと AGENTS の動作一覧を実態へ更新する。
6. 日本語コミット、push、v1 向け PR を作り、独立レビューは必要な差分だけを渡す。
