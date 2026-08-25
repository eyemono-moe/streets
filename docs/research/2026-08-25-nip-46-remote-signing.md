# NIP-46 リモート署名 — 現行仕様と streets の制約

調査日 2026-08-25。NIP-46 の設計に先立ち、現行の公式 NIPs と streets の
既存 ADR / `Signer` 境界から、実装が従う事実と未確定点を分離した。
この文書は設計案ではない。NIPs は変更されうるため、実装着手時にはリンク先の
最新版を再確認する。

## 1. 鍵は 3 種類あり、同一視できない

現行 NIP-46 は次の 3 種類を区別する。

- **client keypair**: クライアントが生成し、remote signer との通信イベントの
  署名と NIP-44 暗号化に使う。一時的でよいが、ローカル保存することもでき、
  ログアウト時には削除すべきとされる。
- **remote-signer keypair**: remote signer が通信に使う鍵。`bunker://` に含まれ、
  応答イベントの著者でもある。
- **user keypair**: ユーザー本人のイベントを署名する鍵。remote-signer keypair と
  同じ場合も異なる場合もある。接続後に `get_public_key` を呼んで初めて
  user pubkey を得る。

根拠は [NIP-46 の Terminology / Overview](https://github.com/nostr-protocol/nips/blob/master/46.md#terminology)。
文書冒頭の Changes も、remote-signer pubkey と user pubkey を区別し、接続後の
`get_public_key` を必須にした変更を明記している。

これは streets の「ユーザーの秘密鍵をアプリへ渡さない」という
[ADR-0008](../adr/0008-signer-only-key-handling.md) には沿う。一方、NIP-46
クライアント自身は通信専用 client keypair の秘密側を生成・利用しなければ
ならない。ADR-0008 の「秘密鍵を一切保持しない」という文章を文字どおり全鍵へ
適用すると NIP-46 と両立しないため、**禁止対象が user keypair で、通信専用鍵は
別物であることを設計時に明文化する必要がある**。

また、現在の `Signer.getPublicKey()` は user pubkey、`signEvent()` は user
keypair による署名を表すので、公開境界の意味は NIP-46 でも維持できる。
client keypair と remote-signer pubkey は `Signer` の利用者へ露出する必要がない。

## 2. 接続開始には 2 つの向きがある

### 2.1 `bunker://`: remote signer がトークンを発行

形式は次のとおり。

```text
bunker://<remote-signer-pubkey>?relay=<relay>&relay=<relay>&secret=<optional-secret>
```

ユーザーがこれをクライアントへ渡し、クライアントが指定リレー経由で `connect`
要求を送る。`secret` は任意だが、一度接続成功に使った値を remote signer は
再利用させないことが推奨される。トークンにクライアント識別情報がないため、
クライアントは `connect` の第 4 引数に metadata を入れることが推奨される。
[NIP-46: Direct connection initiated by remote-signer](https://github.com/nostr-protocol/nips/blob/master/46.md#direct-connection-initiated-by-remote-signer)

### 2.2 `nostrconnect://`: クライアントがトークンを発行

origin は client pubkey。`relay`（1 個以上）と短いランダムな `secret` は必須、
`perms`、`name`、`url`、`image` は任意である。remote signer が client pubkey 宛に
接続応答を送り、クライアントはその著者から remote-signer pubkey を知る。
なりすまし防止のため、クライアントは応答 `result` が発行済み `secret` と一致する
ことを必ず検証する。
[NIP-46: Direct connection initiated by the client](https://github.com/nostr-protocol/nips/blob/master/46.md#direct-connection-initiated-by-the-client)

2 方式は開始方向が異なるだけで、接続後は同じ kind `24133` RPC へ収束する。
仕様は QR 表示・クリップボード・deep link のどれを UI に必須とするか、接続待ちの
期限、同時試行数、キャンセル方法を定めていない。

## 3. RPC のワイヤ形式

要求・応答はいずれも kind `24133` の署名済みイベントで、content は通信相手との
NIP-44 暗号文である。要求は remote-signer pubkey を、応答は client pubkey を
`p` tag に持つ。平文は JSON-RPC に似ているが JSON-RPC そのものではない。

```json
{"id":"random", "method":"method_name", "params":["strings"]}
{"id":"same-id", "result":"string", "error":"optional string"}
```

`id` は要求ごとのランダム文字列で、`params` は文字列の位置引数、`result` も
JSON を文字列化した値を含みうる文字列である。未知・未対応メソッドには remote
signer が error を返さなければならない。
[NIP-46: Request Events / Response Events](https://github.com/nostr-protocol/nips/blob/master/46.md#request-events-kind-24133)

kind `24133` は NIP-01 の `20000 <= kind < 30000` に入り、relay に保存を期待しない
**ephemeral event** である。したがって再接続時に過去の要求・応答をリレーから
復元できる前提にはできない。
[NIP-01: Kinds](https://github.com/nostr-protocol/nips/blob/master/01.md#kinds)

現行メソッドは以下。

| method | params | result |
| --- | --- | --- |
| `connect` | remote-signer pubkey、任意 secret / permissions / metadata | `ack` または secret |
| `sign_event` | pubkey を含まない未署名イベントの JSON 文字列 | 署名済みイベントの JSON 文字列 |
| `ping` | なし | `pong` |
| `get_public_key` | なし | user pubkey |
| `nip04_encrypt` / `nip04_decrypt` | 相手 pubkey、平文または暗号文 | 暗号文または平文 |
| `nip44_encrypt` / `nip44_decrypt` | 相手 pubkey、平文または暗号文 | 暗号文または平文 |
| `switch_relays` | なし | relay URL の JSON 配列または `null` |
| `logout` | なし | `ack` |

完全な引数定義は [NIP-46: Methods/Commands](https://github.com/nostr-protocol/nips/blob/master/46.md#methodscommands)。

## 4. 権限は要求であり、認可結果の機械可読な照会ではない

`connect` または `nostrconnect://` の `perms` は、カンマ区切りの
`method[:params]`。`sign_event` に限り現在は kind 番号を parameter として定義し、
例 `nip44_encrypt,sign_event:4` は NIP-44 暗号化と kind 4 署名を要求する。他の
メソッドの parameter は将来定義される。
[NIP-46: Requested permissions](https://github.com/nostr-protocol/nips/blob/master/46.md#requested-permissions)

仕様はこれを user convenience のための requested permissions と呼ぶ。接続応答に
「実際に許可された権限一覧」を返す形式はなく、以後の RPC 成否でしか利用可否を
確定できない。したがって、perms をローカルの認可済み capability とみなすことは
できない。

streets が現時点で署名する kind は投稿 `1`。実装済み builder を今後 UI に配線する
なら reaction `7`、repost `6`、follow `3`、mute list `10000`、deck `30078` なども
要求候補になる。これはリポジトリの現状から得た候補であり、NIP-46 が streets に
要求する固定集合ではない。NIP-44 encrypt/decrypt は既存 `Signer.nip44` と一致する。

## 5. NIP-44 と NIP-04 の役割は別

**NIP-46 の通信路そのものは現行仕様では NIP-44。** 要求・応答 content の暗号化に
NIP-04 fallback は定義されていない。一方 `nip04_encrypt/decrypt` は、ユーザー鍵を
使う処理を remote signer へ依頼する RPC メソッドとして現在も一覧にある。
[NIP-46 の request content と methods](https://github.com/nostr-protocol/nips/blob/master/46.md#request-events-kind-24133)

NIP-44 v2 は secp256k1 ECDH、HKDF-SHA256、ChaCha20、HMAC-SHA256、padding、base64
からなり、暗号文を含む外側の署名済みイベントを復号前に検証することを要求する。
未知 version のエラーと malformed payload のエラーも区別対象になる。
[NIP-44: Version 2 / Decryption](https://github.com/nostr-protocol/nips/blob/master/44.md#version-2)

これは streets の既存判断と重要な緊張がある。

- [ADR-0020](../adr/0020-no-nostr-library-noble-primitives-only.md) は高水準 Nostr
  ライブラリを禁止し、暗号を自作せず、NIP-44 を署名器へ委譲するとしている。
- しかし NIP-46 の remote signer に NIP-46 通信路の暗号化を依頼することは、
  その通信路ができる前なので不可能である。
- よって NIP-46 client transport のための NIP-44 は、監査済み暗号プリミティブを
  組み合わせて streets 側に持つか、ADR を変更して監査済み NIP-44 実装を借りるか、
  いずれかの明示的な設計判断が必要である。これは user 間 payload を
  `Signer.nip44` へ委譲する既存境界とは別責務である。

NIP-04 自体は公式一覧で unrecommended かつ NIP-17 により deprecated とされる。
ただし NIP-46 RPC の NIP-04 メソッドは現行文書に残るため、「NIP-04 は deprecated
だから NIP-46 から削除済み」とは言えない。
[公式 NIPs 一覧](https://github.com/nostr-protocol/nips/blob/master/README.md#list)、
[NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md)

## 6. `auth_url` は同じ request id の二段階応答

remote signer が追加認証を要するとき、最初の応答を次の形にできる。

```json
{"id":"request-id", "result":"auth_url", "error":"https://..."}
```

クライアントは `error` の URL を popup または新しいタブで表示し、**同じ request
id の次の応答**を待ち続ける。ユーザーが認証しなければ次の応答は永久に来ない
場合がある。
[NIP-46: Auth Challenges](https://github.com/nostr-protocol/nips/blob/master/46.md#auth-challenges)

仕様には URL scheme / origin の許可条件、popup block 時の fallback、timeout、
キャンセル RPC、複数 `auth_url`、同じ id への重複終端応答の扱いがない。URL は
remote signer 由来の外部入力として検証し、待機を無期限に資源保持しない方針を
製品側で決める必要がある。

## 7. relay 切替・再接続・セッション終了

接続直後（または合理的な間隔）に client は `switch_relays` を送り、remote signer
が返した relay 一覧へ以後の要求先を更新することが推奨される。remote signer が
接続用 relay を支配し、旧 relay から切断できるようにするためである。
[NIP-46: Switching relays](https://github.com/nostr-protocol/nips/blob/master/46.md#switching-relays)

streets ではこの一覧が「明示リレー」に相当するが、同時接続 30 本の
[ADR-0011](../adr/0011-performance-budget.md) と競合しうる。NIP-46 は返却本数の
上限を定めず、`null` と空配列の差も説明しない。streets の読み取り層では
`relays: []` が「0 本を明示」の意味なので、その規則を RPC 応答へ無検討に流用
してはいけない。

ログアウト時、client は `logout` を送ってよい。remote signer は `ack` 後に
client pubkey に対応する session を削除し、再度 `connect` するまで要求を拒否する
ことが推奨される。ただし `logout` は courtesy hint で、security boundary ではない。
応答の有無にかかわらず client はローカルの client keypair を削除しなければならない。
[NIP-46: Ending a session](https://github.com/nostr-protocol/nips/blob/master/46.md#ending-a-session)

仕様が定めるのはここまでであり、次は未規定である。

- ページ再読込やブラウザ再起動をまたいで client keypair / session を保持するか
- WebSocket 切断後は同じ session で購読を張り直すだけか、`connect` を再送するか
- pending RPC の timeout・retry・再送時の idempotency
- remote signer が session を失ったことを client が判定する共通 error code
- `switch_relays` を再問い合わせする「合理的な間隔」

NIP-01 上 kind `24133` は ephemeral なので、少なくともオフライン中の応答回収や
未完要求の durable replay を relay に期待できない。

## 8. 互換性上の注意

1. **remote-signer pubkey と user pubkey を分離する。** 現行 NIP-46 冒頭が明示する
   変更であり、`bunker://` の pubkey をログインユーザーとして扱う旧実装は誤る。
2. **接続後に必ず `get_public_key`。** `connect` の相手鍵から user pubkey を推測
   しない。ただし現行仕様では `get_public_key` の user pubkey は NIP-44 channel
   内の文字列であり、その user keypair 保有を別署名で証明しない。この点は公式
   repository の [未解決 Issue #2227](https://github.com/nostr-protocol/nips/issues/2227)
   でも問題提起されているが、現時点の規範仕様に追加手順はない。
3. **NIP-05 login / `create_account` を NIP-46 の機能と思わない。** 現行文書は前者を
   削除、後者を別 NIP へ移したと明記する。
4. **transport は NIP-44 のみ。** NIP-04 対応 remote signer との独自 fallback は
   現行 NIP-46 の相互運用性を保証しない。
5. **client metadata は未認証。** remote signer は表示 hint としてのみ扱い、認可に
   使ってはならない。streets が送信する `name` / `url` / `image` も信頼証明には
   ならない。
6. **relay URL は複数かつ変化する。** query の重複 `relay` を保持し、接続後の
   `switch_relays` に追随する必要がある。

## 9. streets の設計前に解く未確定点

NIP 本文だけでは決まらず、仕様書で判断が必要な論点は次のとおり。

- v1 の最小スライスで `bunker://` と `nostrconnect://` の両方を提供するか
- client keypair と接続情報をどこへ、どの期間保存するか。ログアウト時の確実な削除
- NIP-46 transport 用 NIP-44 実装を ADR-0008 / 0020 のどの責務として扱うか
- 最初に要求する permissions の最小集合と、後で kind が増えた場合の再認可導線
- `auth_url` の URL 検証、popup fallback、timeout、キャンセル、再開
- RPC timeout / retry と、切断・remote session 消失・RPC error の状態分類
- `switch_relays` の本数・URL 検証・30 接続予算との調停
- 単一アクティブアカウントという [ADR-0010](../adr/0010-single-active-account.md)
  のもとで NIP-07 と NIP-46 の接続情報をどう切り替え、古い signer を失効させるか
- remote-signer pubkey と user pubkey が異なる現在仕様を、永続化・表示・監査ログで
  混同しないデータモデル

以上は実装上避けられないが、NIP-46 自体から一意に答えは出ない。
