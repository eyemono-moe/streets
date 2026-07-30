---
status: accepted
---

# Transport を1リレー専用の薄いアダプタに落とし、その上に深い読み取り層を置く

`RelayConnection` は **1つのリレーとだけ話す**薄いアダプタとする（購読・publish・接続状態）。Outbox ルーティング、クエリのリレー別分割、結果の合流、重複排除、リレー別ページネーション、完了判定、関連イベント要求のバッチング、500 件上限の破棄、30 接続上限は、その上の **読み取り層**という単一の深いモジュールが持つ。

呼び出し側インターフェースは宣言的リアクティブとし、`createSection(source)` が `{ items, status, loadMore }` を返す。購読の開始と破棄、`source` 変更時の張り直しは読み取り層の内側にある。

## v0/旧v1 実装の何が問題だったか

旧 `NostrTransport` は **shallow** だった。6 メソッド + 5 型 + 9 値の接続状態 enum を持ちながら、rx-nostr の語彙をそのまま漏らしていた（`mode: "backward" | "forward"`、`NostrSubscription.emit()`、リトライ状態の素通し）。削除テストを適用すると、消しても呼び出し側に複雑さがほとんど再出現しない。つまり「rx-nostr を隠す」という目的を達成していなかった。

さらに [ADR-0005](./0005-outbox-model-from-v1.md) で必要になった振る舞い（論理クエリをリレー別に分割して合流する）に置き場所がなく、放置すれば query 層に流れ込んで肥大化する構造だった。

## 本物の seam は3つだけ

2つ以上のアダプタが実在するものだけを seam とする。

| Seam | アダプタ |
|---|---|
| `RelayConnection` | rx-nostr 実装 / fake |
| `EventStore` | memory / 将来の永続化付き |
| `署名器` | NIP-07 / NIP-46 / fake |

読み取り層はアダプタが1つしかないため seam を切らない。内部には seam を持つが、それは読み取り層自身のテストのためのものであり、外には出さない。

## Consequences

- `view/profile-view.ts` は削除する。ADR-0004 により「派生ビューはフェッチしない」という前提が破棄されたため、存在意義がない。
- `repository/` は読み取り層に吸収されて消える。
- fake `RelayConnection` により、ルーティング・合流・ページネーション・完了判定の全ロジックを決定的にテストできる。[ADR-0011](./0011-performance-budget.md) の性能予算の測定もこの seam に依存する。
- ルーティングが `kind:10002` を必要とし、その取得にルーティングが必要という循環依存が発生する。別途解く（[ADR-0016](./0016-routing-bootstrap.md)）。
