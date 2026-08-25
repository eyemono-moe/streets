---
status: proposed
issue: 213
---

# NIP-46 bunker ログインの設計

## 1. 何を作るか

NIP-07 拡張がないブラウザでも、ユーザーが `bunker://` URI を貼って remote signer
へ接続し、既存の `/v1` を閲覧・投稿できるようにする。

このスライスに含めるもの:

- `bunker://` の解析と接続
- kind 24133 による `connect` / `get_public_key` / `sign_event` / `ping` /
  `switch_relays` / `logout`
- transport 用 NIP-44 v2
- 接続セッションの復元、失効時の破棄、明示的なログアウト
- `auth_url` の表示と待機
- NIP-07 / NIP-46 のどちらか一方だけを現在の `Signer` として使う配線

このスライスに含めないもの:

- クライアント側が URI と QR を発行する `nostrconnect://`
- NIP-46 経由の NIP-04
- NIP-46 経由の NIP-44 payload 暗復号（transport の NIP-44 とは別物）
- 複数アカウント、複数 remote signer の同時接続
- remote signer の一覧・名前付け・履歴 UI

`nostrconnect://` を同時に入れないのは、QR/deep link、接続待ち、未知の remote
signer pubkey を secret で結び付ける別の開始状態を増やさず、まず ADR-0008 が要求
する「拡張がなくても使える」最短経路を閉じるためである。下層の RPC client は後で
共用できる。

一次仕様の事実と未規定点は
[NIP-46 リモート署名 — 現行仕様と streets の制約](../../research/2026-08-25-nip-46-remote-signing.md)
に分離した。

## 2. セキュリティ境界

鍵を次の 3 つに分ける。

| 鍵 | 所有者 | streets での扱い |
| --- | --- | --- |
| user keypair | remote signer | 公開鍵だけを `get_public_key` で受け取る。秘密側は持たない |
| remote-signer keypair | remote signer | 公開鍵だけを接続先識別と応答検証に使う |
| client keypair | streets | kind 24133 専用。NIP-46 module の外へ出さない |

[ADR-0031](../../adr/0031-nip46-session-key-boundary.md) をこの境界の決定とする。
client secret は user secret ではないが、署名要求を送れる資格情報なので秘密として
扱う。console、診断パネル、Sentry、エラー文字列、URLへ出さない。

transport の NIP-44 v2 は NIP-46 client 自身が実行する。remote signer に委譲
すると通信開始前に通信が必要になるためである。高水準 Nostr ライブラリは使わず、
`@noble/curves` / `@noble/hashes` と cipher primitive を使う。NIP-44 の公式 test
vector を適合試験にし、独自の暗号方式や fallback は作らない。

## 3. 入力と永続化

### 3.1 `bunker://` の解析

`parseBunkerUri(input)` は次を満たさない値を拒否する。

- scheme が `bunker:`
- remote-signer pubkey が小文字 64 桁 hex
- `relay` が 1〜5 個あり、すべて正規化可能な `ws:` / `wss:` URL
- `secret` は任意。存在するときは空文字でない
- fragment、userinfo、未知の authority 形式を持たない

重複 relay は正規化後に除く。最大 5 本は NIP の規定値ではなく、署名器が返す無制限
の明示リレーで 30 接続予算を食い潰さないための streets の上限である。6 本以上を
黙って切らず、入力エラーとして利用者へ伝える。

未知 query parameter は前方互換性のため無視するが、永続化しない。入力した URI
そのものも保存しない。

### 3.2 保存するセッション

接続成立後、次だけを versioned JSON として localStorage に保存する。

```ts
type StoredNip46SessionV1 = {
  version: 1;
  clientSecret: string;
  remoteSignerPubkey: string;
  userPubkey: string;
  relays: string[];
};
```

保存キーはアプリで同時に 1 つだけとし、ADR-0010 の単一アクティブアカウントに
合わせる。bunker URI の one-time `secret` は `connect` 後に不要なので保存しない。

ページ再読込時は schema と各値を検証して client を復元し、`ping` と
`get_public_key` を行う。保存済み `userPubkey` と再取得値が一致したときだけログイン
状態へ戻す。不一致、RPC error、timeout、復号・署名検証失敗なら保存値を削除し、
「リモート署名器との接続を復元できませんでした。新しい bunker URI で接続して
ください」と表示する。`connect` を自動再送しない。secret の再利用可否と remote
session 消失の error code が仕様化されていないためである。

localStorage は XSS から client secret を守れない。しかしページ実行中の XSS は
メモリ上の client secret と署名要求経路にも到達でき、Web Storage を別のブラウザ
APIへ替えるだけでは security boundary にならない。初期スライスでは、再読込のたび
に one-time URI を取り直す実害より、明示ログアウトと保存値の非露出を優先する。
WebCrypto の non-extractable key 化は NIP-44 ECDH との適合性を別途検証する後続候補
とする。

## 4. NIP-46 client の境界

`src/core/signer/nip46/` に次の責務を閉じ込める。

```ts
type Nip46Client = {
  request(method: Nip46Method, params: string[]): Promise<string>;
  close(): void;
};

type Nip46ClientHooks = {
  onAuthUrl(url: URL, requestId: string): void;
};
```

client は `ConnectionPool` を受け取り、明示 relay に次を張る。

```json
{"kinds":[24133],"authors":["remote signer"],"#p":["client"]}
```

要求は client key で署名した kind 24133 として同じ pool から publish する。
NIP-46 専用 WebSocket を開かない。これにより投稿・読み取り・remote signing を含む
アプリ全体の 30 接続上限を一箇所で守る。NIP-46 relay は認証機能の明示リレーだが、
ブートストラップ専用の `{ reserved: true }` は使わない。

受信イベントは content を復号する前に、少なくとも次を検証する。

- `verifyEvent(event)` が成功する
- kind が 24133
- author が現在の remote-signer pubkey
- `p` tag が client pubkey を含む
- 復号した応答 id が現在 pending の要求に一致する

要求 id は cryptographically secure random とし、client 単位で衝突させない。pending
要求は Map に持ち、終端応答、timeout、`close()` のいずれでも必ず除去する。kind
24133 は ephemeral なので、未完要求を保存・再送しない。

## 5. RPC の待機と `auth_url`

通常 RPC は 30 秒で timeout とする。自動 retry はしない。`sign_event` の再送は
remote signer 側で承認 UI を重複させる可能性があり、共通の idempotency 規約も
ないためである。

`result: "auth_url"` の中間応答を受けた場合:

1. `error` を URL として解析し、`https:` のみ受け付ける
2. ログイン/投稿 UI の直上へリンクを表示する
3. `target="_blank" rel="noopener noreferrer"` でユーザーが明示的に開く
4. 同じ request id の終端応答を最大 2 分待つ

popup を自動で開かない。非同期応答時には popup blocker に阻まれやすく、remote
signer 由来 URL へ自動遷移する必要もない。URL が不正、2 分 timeout、ユーザーが
キャンセルした場合は pending を破棄する。後から届いた同じ id の応答は無視する。

## 6. 接続フロー

未ログイン UI は「NIP-07 でログイン」と「bunker URI でログイン」を並べる。
後者は説明を展開して URI 入力欄と接続ボタンを出す。nsec は受け付けず、入力欄の
近くで「秘密鍵ではなく `bunker://` から始まる接続情報を貼る」と明示する。

接続は次の順序に固定する。

1. URI を解析し、client keypair を生成する
2. 応答購読を張る
3. `connect` を remote-signer pubkey、URI secret、`sign_event:1`、metadata 付きで送る
4. `get_public_key` で user pubkey を得る
5. `switch_relays` を 1 回送る
6. 応答が 1〜5 本の妥当な relay URL なら購読・送信先を原子的に切り替える
7. セッションを保存して、現在の signer と user pubkey を同時に反映する

`switch_relays` が `null`、空配列、不正値、6 本以上、timeout/error の場合は、接続に
使った relay を維持する。切替だけの失敗で成功済みセッションを捨てない。ただし
不正応答は開発者モードの診断へ残す。切替時は新しい購読を張ってから古い購読を閉じ、
応答を受け取れない空白を作らない。新しい relay が予算で 1 本も開けなければ旧 relay
を維持する。

metadata は `{name:"streets", url: location.origin}` とする。認可材料ではなく表示 hint
であり、`location.href` を渡して query や入力値を混ぜない。要求権限は現在 UI から
実際に使う `sign_event:1` だけにする。reaction 等を配線するときは必要 kind を追加
し、既存セッションの再認可導線をそのスライスで設計する。

## 7. `Signer` と `/v1` の配線

`Signer` の公開 interface は変えない。NIP-46 版は次を対応させる。

- `getPublicKey()` → 接続時に確認した user pubkey
- `signEvent(template)` → `sign_event` RPC
- `nip44` → このスライスでは `undefined`

`sign_event` へ渡す JSON は NIP-46 の現行仕様どおり `pubkey` を含めない。返却値は
構造検証、`verifyEvent`、template の `created_at` / `kind` / `tags` / `content`、接続
中 user pubkey との一致を全て確かめる。remote signer が別内容へ署名した場合は publish
も楽観挿入も行わない。

現在の `/v1` は `Writer` へ NIP-07 signer を生成時に固定している。これを
`ActiveSigner` という小さな委譲 seam に替える。

```ts
type ActiveSigner = Signer & {
  set(signer: Signer | undefined): void;
};
```

各メソッドは呼び出した瞬間の signer へ委譲し、未ログインなら
`SignerUnavailableError` を投げる。`Writer` はこの同じ instance を持ち続ける。
ログイン完了時は `activeSigner.set(signer)` と `setPubkey(userPubkey)` を同じ同期処理で
行う。切替・ログアウト時は最初に active signer を外して新規書き込みを止め、その後
旧 NIP-46 client を close する。

NIP-07 ログインも active signer に設定する。これにより画面の pubkey は NIP-46、
投稿時だけ古い NIP-07 signer、という分裂を防ぐ。ADR-0010 どおり active session は
常に 1 つである。

## 8. ログアウトと失敗状態

ログイン後のヘッダに「ログアウト」を追加する。

- NIP-46: `logout` を最大 5 秒だけ試す。結果を待ち続けず、client を close し、保存
  セッションを削除し、client secret を保持する参照を捨てる
- NIP-07: remote 処理なしで active signer と pubkey を外す
- 共通: deck/read section は既存 Solid の pubkey 依存で片付き、次のログインでは
  pubkey ごとの deck を読み直す

エラーは利用者が行動できる単位に分ける。

| 状態 | 表示 |
| --- | --- |
| URI 不正 | bunker URI の形式・relay 上限をその場で直せる文言 |
| connect 拒否 | remote signer 側で承認し、新しい URI でやり直す案内 |
| auth_url | 外部認証を開くリンクとキャンセル |
| timeout / relay 0 本 | 接続先 relay と signer の稼働確認、新しい URI での再試行 |
| 保存セッション失効 | 保存値を削除済みと明示し、新しい URI を要求 |
| sign_event 拒否 | 投稿は未送信であることと remote signer 側の権限確認 |

remote-signer pubkey、RPC id、relay ごとの失敗内訳はユーザーが直接直せないので、通常
画面には出さず開発者モードの背後へ置く。client secret と bunker secret は開発者
モードにも出さない。

## 9. テスト境界

### 9.1 単体

- URI parser: scheme、鍵、重複 relay、0/5/6 本、secret、未知 parameter
- session storage: round trip、壊れた JSON、version、各鍵・relay の検証と削除
- NIP-44: 公式 v2 vectors、改ざん、未知 version、padding、長さ境界
- RPC client: 購読を先に張る、署名検証前に復号しない、author / `p` / id の照合、
  通常 timeout、auth_url 二段階、close 時の全 pending reject、遅延応答の無視
- signer: `sign_event` 入出力、user pubkey と template の完全一致、NIP-44 非公開
- active signer: 未設定、NIP-07→NIP-46 切替、切替中に旧 signer へ流さない
- relay switch: 新規購読先行、invalid/0/6 本で旧 relay 維持、予算拒否時の維持

テストには「捕まえる変異」を書き、実際に変異を入れて対象テストが赤くなることを確認
してから戻す。transport 暗号の test vector は変異コメントの代用にしない。

### 9.2 e2e

e2e 側だけは ADR-0020 の射程外なので、独立した NIP-46 signer fixture に既存 Nostr
ライブラリを使ってよい。次を 1 本の利用者経路として確かめる。

1. `bunker://` で接続する
2. remote signer の user pubkey でデッキが開く
3. 投稿し、fixture が署名した kind 1 が relay へ届く
4. reload 後に保存セッションを復元して投稿できる
5. ログアウト後に保存値が消え、再読込しても未ログインである

新しい fixture の鍵 seed は `fixture-pubkeys.test.ts` に登録し、衝突検査を通す。新しい
route は作らないので global setup の暖機一覧は変えない。

## 10. 実装順と完了条件

人による本仕様と ADR-0031 の確認後、別の実装計画を小さいコミット単位で作る。
概ね次の依存順になる。

1. transport NIP-44 と client event 署名
2. bunker URI / session schema
3. RPC client と relay switch
4. NIP-46 signer と active signer
5. `/v1` の接続・復元・auth_url・ログアウト UI
6. remote signer fixture と e2e
7. followups / feature inventory / issue #213 の更新

完了時は `pnpm verify` と、ローカル relay を起動した前景の `pnpm exec playwright test`
を通す。NIP-44 の公式 vector、RPC の失敗状態、保存セッション削除の単体テストを省略
しない。

## 11. 後続へ送るもの

- `nostrconnect://` と QR/deep link
- NIP-46 `nip44_encrypt/decrypt` を `Signer.nip44` に公開する権限拡張
- reaction / repost / follow / mute / kind 30078 ごとの再認可導線
- client keypair を WebCrypto non-extractable key として保持できるかの検証
- remote signer 一覧とアカウント切替 UI
- `switch_relays` を合理的な間隔で再取得する運用
