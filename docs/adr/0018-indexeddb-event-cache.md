---
status: accepted
---

# イベントを IndexedDB にキャッシュし、メモリへ水和して同期読み取りを保つ

イベント本体・ルーティング表・デッキのキャッシュを IndexedDB に永続化する。起動直後に前回のタイムラインが即座に表示されることを目指す。

## 同期インターフェースを壊さない構造

`EventStore` の読み取りは同期 (`getEvent(id): NostrEvent | undefined`) であり、非同期の IndexedDB で直接裏打ちできない。IndexedDB は `EventStore` の差し替えではなく、**その背後の水和・退避層**とする。

```
起動時   IndexedDB → メモリへ水和（非同期・1 回だけ）
読み取り メモリのみ（同期のまま）
書き込み メモリへ同期 + IndexedDB へ非同期キュー
```

これにより [ADR-0011](./0011-performance-budget.md) の「初回イベント表示 2 秒（キャッシュあり）」が、リレー応答を待たずに達成できる。

## seam の訂正

[ADR-0014](./0014-thin-relay-connection-deep-read-layer.md) では `EventStore` を「memory / 将来の永続化付き」の 2 アダプタを持つ seam としていたが、上記の構造により **`EventStore` の実装はメモリ 1 つだけ**になる。「1 つのアダプタは仮説上の seam」というルールに従い、`EventStore` は seam ではなく読み取り層の内部に降ろす。

代わりに `EventPersistence`（IndexedDB / インメモリ）が seam になる。テストを IndexedDB なしで走らせるために 2 つ目のアダプタが実在する。

## 古いデータの正しさ

キャッシュから復元したイベントは古い。種類ごとに扱いが異なる。

- **通常イベント（kind:1 など）** — 不変なので問題ない。
- **置換可能イベント（kind:0 / 3 / 10002 / 10000 など）** — 新しい版が届くまで古い版を表示する。許容する。
- **削除されたイベント（kind:5 で削除指示されたもの）** — **キャッシュに残っていると削除済みの投稿が復活して見える。これは実害であり許容できない。** 削除指示を永続化し、水和時に適用する必要がある。

## Consequences

- 容量上限と破棄ポリシー、スキーマ移行が v1 のスコープに入る。
- [ADR-0011](./0011-performance-budget.md) の「1 セクション 500 件で古い方から破棄」はメモリ上の話であり、IndexedDB 側の保持期間は別の軸になる。両者の関係を定義する必要がある。
- オフラインでも直前の状態が閲覧できるようになる（副次的な利点）。

## 実装の段階

- **永続化スライス（2026-08-10、[docs/design/read-layer-followups.md](../design/read-layer-followups.md)）** — 上記「seam の訂正」を実際に成立させた。`EventPersistence` seam を `src/core/read/event-persistence.ts` に定義し、`createIndexedDbPersistence`（`src/core/read/indexeddb-persistence.ts`）と `createMemoryPersistence` の 2 実装を持つ（後者はテストを IndexedDB なしで走らせるための仮の代役ではなく、それ自体が実在の実装 —— jsdom には IndexedDB が無い）。
- **`EventStore` は合成ルートの内部に降りた。** `src/core/read/read-layer.ts` の `createReadLayer` だけが `new EventStore()` する。`createSection` の公開オプションから `store` を削除し、`SubscriptionManager.store` 経由で唯一のインスタンスを共有する（`SectionReader` 側のテスト用 seam はそのまま残した）。
- **信用済み挿入は `put()` のフラグではなく別メソッドにした。** `EventStore.hydrate(entries, { deletedIds })` が水和専用の入口で、`verifyEvent` を呼ばない。リレー由来の値（`RelayConnection` のイベントハンドラが作れる形）がこの無検証経路に迷い込む余地を型シグネチャの時点で無くしている。
