---
status: accepted
---

# Nostr ライブラリに依存せず、監査済み暗号プリミティブだけを借りる

streets v1 は Nostr の高水準ライブラリ（nostr-tools / rx-nostr / NDK / @rust-nostr/nostr-sdk / Nostrify）に依存しない。依存するのは **`@noble/curves`（schnorr 署名検証）・`@noble/hashes`（sha256）・`@scure/base`（bech32 / NIP-19）** の3つの暗号・エンコーディングプリミティブのみとし、NIP-01 のメッセージ層と NIP-11 の取得は自前で持つ。

**暗号は自作しない。** 署名検証もハッシュも noble に委ね、NIP-44 の暗号化・復号は署名器に委譲する（[ADR-0008](./0008-signer-only-key-handling.md) の `Signer.nip44Encrypt` / `nip44Decrypt`）。streets が自前で書く暗号コードは存在しない。

## なぜライブラリが不要になったか

[ADR-0014](./0014-thin-relay-connection-deep-read-layer.md) で `RelayConnection` を1リレー専用の薄いアダプタに落とした結果、**Nostr ライブラリが提供する価値のほとんどが不要になった**。多リレーの協調、接続プール、outbox 補助、購読の合流 — これらはすべてこちらの読み取り層が持つ。残るのは「1本の WebSocket で NIP-01 を話す」という約 150 行と、暗号プリミティブだけである。

nostr-tools 自身も `@noble` と `@scure` にしか依存していない。したがって「nostr-tools を外す」ことは依存ツリーの実質を変えず、**制御だけを得る**変更である。

## 却下した選択肢

| 選択肢 | 却下理由 |
|---|---|
| **nostr-tools** | メンテは活発（2.24.1 / 2026-07）で、「メンテされていない」は事実ではない。ただし薄いラッパとしての価値が ADR-0014 により消えた |
| **rx-nostr** | 多リレーのオーケストレーションが主価値であり、それは読み取り層の責務。NIP-11 のために採用する動機もあったが、NIP-11 は HTTP GET 1 本で自前実装できる |
| **NDK** | Outbox Model を内蔵する高水準 SDK。採用すると [ADR-0014](./0014-thin-relay-connection-deep-read-layer.md) / [ADR-0015](./0015-section-status-excludes-renderer-fetches.md) / [ADR-0017](./0017-declarative-renderer-needs.md) を丸ごと破棄することになる。最終公開も 2026-02 と上記の中で最も古い |
| **@rust-nostr/nostr-sdk** | 最も活発（2026-07）だが WASM バンドルがブラウザの初回読み込みに乗り、[ADR-0011](./0011-performance-budget.md) の「初回イベント表示 2 秒」と正面衝突する |
| **applesauce** | 意図的にリレー通信を含まないため WebSocket 層の問題を解かない。かつイベント処理の役割が読み取り層と重なる |

## Consequences

- **NIP-01 の細部を自分で持つ。** 再接続、バックオフ、`OK` メッセージの解釈、`CLOSED` の扱い、メッセージの検証。ライブラリが吸収していた地味な部分が自分の責任になる。
- **NIP-11 も自前で取得する。** ブラウザから relay のドメインへ直接 GET するため、`Access-Control-Allow-Origin` を返さないリレーでは失敗する。取得失敗時はリレー情報なしで動作を継続すること。
- **新しい NIP を扱うたびに、その定義を自分で読む必要がある。** これは欠点に見えて、[ADR-0007](./0007-nip-tracking-pipeline-draft-pr-only.md) の NIP 追従パイプラインとは整合する — パイプラインはもともと NIP の markdown を一次情報として読む前提だった。ライブラリの更新を待つ経路がなくなる分、追従は速くなる。
- 既存の `nostr-tools` / `rx-nostr` / `rx-nostr-crypto` / `@rust-nostr/nostr-sdk` / `nostr-typedef` への依存は、旧実装の削除と同時に落とす。
