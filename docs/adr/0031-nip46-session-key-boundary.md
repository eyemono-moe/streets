---
status: accepted
---

# NIP-46 の通信鍵を、本人鍵とは別の失効可能なセッション資格情報として扱う

streets が生成・保持してはならない「秘密鍵」は、ユーザーの Nostr
アイデンティティを表す **user keypair の秘密側**とする。NIP-46 の通信にだけ使う
client keypair は、remote signer 側で失効できるセッション資格情報として、
NIP-46 実装の内部に限って生成・保持してよい。

client keypair はアプリ共通の署名・復号 API へ露出させず、`Signer.getPublicKey()`
が返す値にも使わない。ログアウト時には remote signer へ `logout` を試み、応答の
成否にかかわらずローカルから削除する。

NIP-46 transport の NIP-44 は remote signer へ委譲できないため、streets 側で
実行する。この実装には高水準 Nostr ライブラリを使わず、secp256k1 / hash / cipher
の監査済み noble プリミティブを組み合わせる。ユーザー間 payload の NIP-44 は、
従来どおり `Signer.nip44` を通して外部署名器へ委譲する。

## なぜ

現行 NIP-46 は client / remote signer / user の 3 鍵を区別する。client は kind
24133 の署名と transport の NIP-44 に自分の鍵を必要とするため、
[ADR-0008](./0008-signer-only-key-handling.md) の「秘密鍵を一切保持しない」を全種類の
鍵へ文字どおり適用すると、同 ADR が必須経路とした NIP-46 を実装できない。

client keypair が漏れると remote signer へ署名要求を送れるので、無害な一時値では
ない。一方、remote signer 側でセッションを失効でき、user keypair そのものは漏れず、
ユーザーの Nostr アイデンティティを恒久的に奪う本人鍵とは被害の性質が異なる。
そこで例外として放置せず、用途・保存先・削除条件を限定した資格情報として扱う。

[ADR-0020](./0020-no-nostr-library-noble-primitives-only.md) が NIP-44 を署名器へ委譲
するとしたのはユーザー鍵を使う payload の暗復号である。NIP-46 transport を成立
させる前に remote signer へ同じ処理を依頼することは循環するため、transport だけは
別責務としてクライアント側に必要になる。

## Consequences

- NIP-46 セッション保存値は秘密情報として扱う。ログ、診断表示、URL、エラー文へ
  client secret を出さない。
- 永続化する場合は専用の versioned schema で検証し、bunker URI の `secret` は
  接続成立後に保存しない。
- ログアウトはリモートの成功に依存せずローカル資格情報を削除する。remote signer
  側の削除は courtesy hint であって唯一の security boundary にしない。
- cipher primitive を依存に追加する場合も、NIP-44 のワイヤ形式と状態機械は
  streets が所有する。高水準 Nostr ライブラリへは戻らない。
- [ADR-0008](./0008-signer-only-key-handling.md) の本人鍵禁止と
  [ADR-0020](./0020-no-nostr-library-noble-primitives-only.md) の暗号を自作しない方針は
  維持する。この ADR は NIP-46 transport に必要な境界だけを明確化する。
