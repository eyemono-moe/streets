# streets v1 アーキテクチャ

用語は [CONTEXT.md](../../CONTEXT.md) に従う。個々の判断の理由は [docs/adr/](../adr/) にある。本書は全体像と各モジュールのインターフェースを示す。

## モジュール地図

```
UI (SolidJS)
  │  createSection(source) → { items, status, loadMore }
  ▼
┌──────────────────────────────────────────────────┐
│ 読み取り層（深いモジュール・アダプタ1つ）           │
│   ルーティング (NIP-65) / クエリのリレー別分割      │
│   合流 / 重複排除 / リレー別ページネーション        │
│   完了判定 / needs の波状解決 / バッチング          │
│   500 件破棄 / 30 接続上限                         │
│   ├─ 内部: EventStore（同期・メモリ）              │
│   └─ 内部: RoutingTable                           │
└──────────────────────────────────────────────────┘
  │                  │                   │
  ▼                  ▼                   ▼
RelayConnection   EventPersistence     署名器
(rx-nostr / fake) (IndexedDB / memory) (NIP-07 / NIP-46 / fake)
```

レンダラ登録テーブルは読み取り層とは独立している。UI は kind からレンダラを引き、読み取り層はレンダラの `needs` だけを参照する。

## 本物の seam は3つ

2 つ以上のアダプタが実在するものだけを seam とする（[ADR-0014](../adr/0014-thin-relay-connection-deep-read-layer.md), [ADR-0018](../adr/0018-indexeddb-event-cache.md)）。

### `RelayConnection`

**1 つのリレーとだけ話す。** 複数リレーへの同報も、どのリレーを選ぶかの判断も含まない。NIP-01 のメッセージ層（`REQ` / `CLOSE` / `EVENT` / `EOSE` / `CLOSED` / `OK`）を素の WebSocket 上に自前で持つ（[ADR-0020](../adr/0020-no-nostr-library-noble-primitives-only.md)）。

NIP-11 のリレー情報は `RelayInfoRegistry` が別に扱う。`wss://` を `https://` に置換して `Accept: application/nostr+json` で GET するだけ。ブラウザから relay のドメインへ直接投げるため CORS で失敗しうるので、**失敗しても `undefined` を返して動作を継続する**。用途は 3 つ — リレー詳細カラムの固定セクション、NIP-50 対応判定、`limitation.max_limit` を超える `limit` を送らないこと。

**切断は現時点では終局的である。** `onclose` / `onerror` は接続を閉じた状態にし、全購読に `onClosed` を配る。再接続は行わないため、そのカラムはコンポーネントが再マウントされるまで復帰しない。ただし切断は `status.incomplete.unreachableRelays` として表面化するので、[ADR-0011](../adr/0011-performance-budget.md) の「黙って欠落させてはならない」は満たしている。**未実装であることと壊れていることは区別できる。** 再接続の方針は [ADR-0021](../adr/0021-reconnection-policy.md)（proposed）にあり、接続プールと同じ計画で実装する。

### `EventPersistence`

IndexedDB への退避と起動時の水和。読み取り経路には介在しない（読み取りはメモリから同期で行う）。

### `署名器`

```ts
interface Signer {
  getPublicKey(): Promise<string>
  signEvent(template: EventTemplate): Promise<NostrEvent>
  nip44Encrypt(peer: string, plaintext: string): Promise<string>
  nip44Decrypt(peer: string, ciphertext: string): Promise<string>
}
```

秘密鍵は一度も現れない（[ADR-0008](../adr/0008-signer-only-key-handling.md)）。NIP-51 の自己暗号化リスト（ミュート等）は `peer` に自分の公開鍵を渡して扱う。

## 読み取り層

呼び出し側が知るのはこれだけ。

```ts
createSection(source: () => Source): {
  items: Accessor<Item[]>
  status: Accessor<SectionStatus>
  loadMore: () => void
}

type SectionStatus = {
  phase: "initial" | "streaming" | "settled"
  incomplete?: {
    unreachableRelays: number   // 接続上限や失敗で届かなかったリレー数
    unroutableAuthors: number   // kind:10002 が引けずルーティングできない著者数
  }
}
```

`source` が変われば自動で購読を張り直す。購読の破棄も内側で行う。

`status` はセクション自身のリストについてのみ語り、**レンダラの遅延取得は含めない**（[ADR-0015](../adr/0015-section-status-excludes-renderer-fetches.md)）。`incomplete` は [ADR-0011](../adr/0011-performance-budget.md) の「取得できていない著者の可視化」を満たすためにある。

### ソース

```ts
type Source =
  | { type: "nostr"; filters: Filter[]; relays?: RelayUrl[] }
  | { type: "relay-info"; url: RelayUrl }   // NIP-11 (HTTP)
```

単一イベント参照に専用の型は要らない。`kind:30003` を 1 件引くのも `kind:0` を 1 件引くのも `nostr` フィルタで表現できる。`relays` を指定した場合は Outbox ルーティングをバイパスする（特定リレー内タイムライン用）。

非 Nostr ソースは現状 NIP-11 の 1 つだけなので、プラグイン機構は作らない。

### 並び順

```ts
type Order = "created-at-desc" | "created-at-asc" | "thread-tree"
```

「リスト記載順」はセクションの関心事ではない。ブックマークセット・フォロー中一覧・スタンプリストはいずれも**セクション長 1** であり、中身の並びはそのレンダラが `related` を並べる際に決める。

### ルーティング

`kind:10002` の取得だけは Outbox ルーティングを使わない専用経路（ユーザー自身の read relay + 既定リレー）で行う。これで循環依存を断つ。ログイン時にフォロー中全員分を 1 クエリでウォームアップし、ルーティング表を TTL 付きで永続化する（[ADR-0016](../adr/0016-routing-bootstrap.md)）。

## レンダラ

```ts
defineRenderer({
  kind: 30003,

  // 純粋関数。取得はしない
  needs: (event) => ({
    events:   tagValues(event, "e"),
    profiles: [event.pubkey],
  }),

  // related は解決済みで渡される
  render: (event, related) => /* ... */,
})
```

読み取り層は needs を**波状**に解決する（[ADR-0017](../adr/0017-declarative-renderer-needs.md)）。

1. セクション内の全アイテムの needs を集約 → 1 クエリ
2. 新しく届いたイベントの needs を集約 → 次の 1 クエリ
3. 収束するか深さ上限に達したら停止

**引用の入れ子は 2 階層まで**（引用の引用まで）。それ以深は展開せずリンクのみ表示する。

レンダラが未実装の kind にはフォールバック表示を使う。著者・時刻・`content` をプレーンテキストで示し、リンク展開も Markdown 解釈も行わない。これは恒常的な経路であり例外処理ではない。

## 永続化

| 対象 | 保存先 |
|---|---|
| デッキ | `kind:30078`（正、NIP-44 暗号化）+ localStorage（キャッシュ） |
| ルーティング表 | IndexedDB（TTL 付き） |
| イベント | IndexedDB（2 バケット） |

読み書きの流れ（[ADR-0018](../adr/0018-indexeddb-event-cache.md)）。

```
起動時    IndexedDB → メモリへ水和（非同期・1 回だけ）
読み取り  メモリのみ（同期）
書き込み  メモリへ同期 + IndexedDB へ非同期キュー
```

バケット構成と削除指示の扱いは [ADR-0019](../adr/0019-two-bucket-cache-policy.md)。

## テスト戦略

| 層 | 方法 |
|---|---|
| レンダラ | `needs` / `render` を純粋関数として単体テスト。`related` を手で組み立てて呼ぶだけでよく、フック環境も Provider も不要 |
| 読み取り層 | fake `RelayConnection` で決定的にテスト（ルーティング分割・合流・波状解決・完了判定・上限制御） |
| 永続化 | インメモリ `EventPersistence` |
| 性能予算 | ローカルリレー + Playwright で [ADR-0011](../adr/0011-performance-budget.md) の 7 指標を測定 |

## 削除するもの

旧 v1 実装のうち、要件定義と設計で前提が崩れたもの。

- `src/core/view/profile-view.ts` — 「派生ビューはフェッチしない」という前提が [ADR-0004](../adr/0004-kind-knowledge-lives-in-renderers.md) で破棄された
- `src/core/repository/` — 読み取り層に吸収される
- `src/core/transport/` — 多リレー同報前提。1 リレー専用の `RelayConnection` に置き換える
- `src/core/query/` — Outbox 対応の読み取り層に置き換える
- `src/features/Column/libs/deckSchema/v0.ts` — 閉じた 9 種 union。[ADR-0003](../adr/0003-open-column-abstraction.md) で廃止

## 依存方針

Nostr の高水準ライブラリには依存しない（[ADR-0020](../adr/0020-no-nostr-library-noble-primitives-only.md)）。依存するのは監査済みプリミティブのみ。

| 依存 | 用途 |
|---|---|
| `@noble/curves` | schnorr 署名検証 |
| `@noble/hashes` | sha256（イベント id の計算） |
| `@scure/base` | bech32（NIP-19） |

**暗号は一行も自作しない。** NIP-44 の暗号化・復号は署名器に委譲する。

## 未決定

1. **既定リレーの選定。** [ADR-0016](../adr/0016-routing-bootstrap.md) のブートストラップの成否に直結する。
2. **設定項目の追加に対する歯止め。** [ADR-0001](../adr/0001-others-first-self-via-settings.md) を無制限に適用すると組み合わせ爆発を招く。
3. **IndexedDB のスキーマ移行手順。**
