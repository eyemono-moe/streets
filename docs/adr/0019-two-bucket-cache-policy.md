---
status: accepted
---

# 永続キャッシュを2バケットに分け、削除指示は破棄しない

[ADR-0018](./0018-indexeddb-event-cache.md) の IndexedDB キャッシュは、**一律の LRU ではなく2つのバケット**に分けて管理する。

| バケット | 対象 | 保持ポリシー |
|---|---|---|
| **参照データ** | `kind:0` / `3` / `10002` / `10000` / `10030` などの置換可能イベント | 全保持。著者ごと最新1件のみ |
| **流れるデータ** | `kind:1` / `6` / `7` など | 上限 20,000 件。`created_at` の古い順に破棄 |

参照データは件数が著者数に比例して頭打ちになり、かつ失うと [ADR-0016](./0016-routing-bootstrap.md) のウォームアップをやり直す羽目になる。流れるデータと同じ土俵で LRU 破棄の対象にすると、価値の高いデータが安いデータに押し出される。

[ADR-0011](./0011-performance-budget.md) の「1 セクション 500 件で古い方から破棄」は**メモリ上の表示上限**であり、本 ADR の保持上限とは別の軸である。

## 削除指示 (`kind:5`) は永続化し、破棄しない

`kind:5` による削除指示そのものを専用の領域に永続化し、水和時に対象イベントを除外する。**削除指示を保持期間の対象にしてはならない。**

削除指示を破棄すると、次回起動時にキャッシュから**削除済みの投稿が復活して表示される**。これは単なる古さではなく、ユーザーが消したはずのものを見せるという実害である。置換可能イベントが古い版のまま表示されること（許容する）とは性質が異なる。

## Consequences

- 削除指示の保持は単調増加する。実運用で問題になる規模かは監視が必要だが、安全側に倒す。
- スキーマ移行の手順が必要になる。バケット構成を変えるときにユーザーのキャッシュをどう扱うか（破棄して再取得が既定で十分）。

## 実装の段階

- **永続化スライス（2026-08-10、[docs/design/read-layer-followups.md](../design/read-layer-followups.md)）** — 上記の 2 バケットは kind ごとの `CachePolicy.retention`（`src/core/read/cache-policy.ts`）として一般化された。`Retention` は `{ type: "latest-per-author" } | { type: "capped"; max: number } | { type: "none" }` の判別共用体で、`policyFor(kind)` が返す。バケットという固定の 2 分割ではなく、kind ごとに 1 つ選ぶ値になった。
- **分ける理由が変わった。** 導入時点では「保持ポリシーの違い」（参照データは全保持、流れるデータは上限付き破棄）で 2 つに分けていたが、`staleMs` / `serveWhileRevalidating` を kind ごとに持たせる過程で、区別の土台はそちらではなく**可変性の違い**だと分かった —— 置換可能イベント（`kind:0`/`3`/`10002` など、参照データ＝`retention: "latest-per-author"`）は新しい版が届くまで古くなりうるので鮮度判定が要るのに対し、不変な kind（`kind:1`/`6`/`7`、流れるデータに相当）はあるか無いかしか無く `staleMs` と `serveWhileRevalidating` は意味を持たない。効くのは `retention` だけである（[仕様](../superpowers/specs/2026-08-10-event-persistence-design.md) 2 節）。
- **`capped` は型として定義されているが未実装で、指す kind が無い。** IndexedDB 実装の書き込み選別 (`selectForPersistence`、`src/core/read/indexeddb-persistence.ts`) は `capped` を渡されると例外を投げる。「流れるデータ」バケット（20,000 件上限、`created_at` 古い順破棄）に対応する kind は現時点で 1 つも `policyFor` に登録されておらず、未指定の kind は既定で `retention: "none"`（永続化しない）に落ちる —— イベント本体の水和を入れるスライスが最初の `capped` の利用者になる想定（[仕様](../superpowers/specs/2026-08-10-event-persistence-design.md) 4 節）。
