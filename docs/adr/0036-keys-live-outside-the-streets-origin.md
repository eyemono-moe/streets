---
status: accepted
---

# 本人の秘密鍵は Streets のオリジンの外に置く — Nosskey の iframe を足す

[ADR-0008](./0008-signer-only-key-handling.md) が守るのは「XSS で鍵が漏れ、取り消せないまま
アイデンティティを失うこと」を防ぐことで、ログインの方式を NIP-07 / NIP-46 に限ることそのものではない。
線は「本人の秘密鍵が Streets のオリジン（streets.eyemono.moe）の JS に入るか」で引く。

- 入らない方式は認める：NIP-07（拡張機能）、NIP-46（リモート署名器）、Nosskey を nosskey.app の
  iframe で埋め込む形。Streets の XSS は署名を頼めても、鍵は持ち出せない
- 入る方式は、まだ認めない：nsec の入力（#729）、Nosskey の SDK を Streets に組み込む形。
  パスキーの PRF の値がそのまま秘密鍵になり、XSS が生体認証を 1 回通させれば持ち出せる

## なぜ

Nosskey の iframe は鍵を nosskey.app のオリジンに置き、Streets とは postMessage で署名だけを
やりとりする。拡張機能と同じ立場で、ADR-0008 の理由に照らして同じ扱いでよい。nsec を持たない人が
パスキーだけで始められ、ほかの埋め込みアプリと同じアカウントを使える。

代わりに nosskey.app を信頼する。nosskey.app が乗っ取られると、そこに置いた鍵は全員分が危ない。
これは NIP-46 の署名サービスを信頼するのと同じ種類の預け方で、選ぶのはユーザーとする。

## Consequences

- Nosskey の iframe は試験中として出す。Safari・iOS は nosskey.app が対応外としている
- 鍵を Streets のオリジンで扱う方式を足すときは、この ADR を改める。暗号化して保存しても、
  解錠した後の XSS は防げないことを前提に決める
