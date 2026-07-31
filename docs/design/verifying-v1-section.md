# `/debug/v1-section` の確認手順

[ADR-0002](../adr/0002-v0-parity-before-cutover.md) により、v0 機能パリティを満たすまで本番は切り替えない。その間 **`/debug/v1-section` が v1 の唯一の生きた検証面**になる。Outbox ルーティング、レンダラ、ページネーション、永続化 — 後続の計画はすべてこの画面を見ながら進むため、毎回思い出すのではなくここに書いておく。

## 起動

```bash
docker compose up -d nostr-rs-relay postgres
pnpm dev:relay:reset      # ローカルリレーの DB を初期化
pnpm e2e:seed             # 決定的なシードデータを投入
pnpm dev                  # http://localhost:5173/debug/v1-section
```

本番ビルドで確認したい場合は `pnpm build && pnpm preview`（`http://localhost:4173/debug/v1-section`）。

## 期待値を出す

```bash
pnpm dev:relay:inspect
```

リレーの NIP-11 文書と kind:1 の件数を表示する。**画面の値と突き合わせるための正解**がこれ。

```
NIP-11
  name            nostr-rs-relay
  supported_nips  1,2,9,11,12,15,16,20,22,33,40
  max_limit       -  (このリレーは公開していません。'-' が正常)

kind:1  418 件
```

## 画面の読み方

| 表示 | 通っている経路 |
|---|---|
| `name` / `supported_nips` が出る | NIP-11 の HTTP 取得 → フィールド単位の型検査 → 描画。**Nostr イベントですらない供給元がセクションになる**（[ADR-0003](../adr/0003-open-column-abstraction.md) の中核的主張） |
| `phase: settled` | WebSocket 接続 → `REQ` → `EVENT` 受信 → `EOSE` → 完了判定（[ADR-0015](../adr/0015-section-status-excludes-renderer-fetches.md) の3フェーズ） |
| `unreachableRelays: 0` | 劣化していない。1 以上なら「取得できていない著者がいる」の可視化が効いている（[ADR-0011](../adr/0011-performance-budget.md)） |
| `items: N` | N 件すべてが **id 再計算 + schnorr 署名検証 + 構造検証**を通過している。`dev:relay:inspect` の件数と一致すれば全件通過 |
| リストが降順 | 500 件上限を「新しい順で採用してから表示順に並べ直す」経路 |

**`items` の数字が最も情報量が多い。** リレーが返した件数と一致していれば、届いたイベントが 1 件も検証で落ちていないということ。

### 紛らわしいが正常な表示

- **`max_limit: -`** — `nostr-rs-relay` の NIP-11 文書は `limitation` に `payment_required` と `restricted_writes` しか持たず `max_limit` を公開していない。**値が無いだけで、取得は成功している。**
- **`no relay info`** — こちらが NIP-11 取得そのものの失敗。CORS を返さないリレーでは正常に起きる。**このときもイベントの取得と表示は動き続けるのが正しい挙動**（[ADR-0020](../adr/0020-no-nostr-library-noble-primitives-only.md)）。

「値が無い」と「取れていない」の区別がこの画面の要点。

## 手を動かす確認

### ① ライブ更新 — ストリーミング経路

ページを開いたまま、別ターミナルで:

```bash
pnpm dev:relay:publish "きょうのテスト"
```

**期待**: リレーが受理し、**ページをリロードせずに** `items` が +1 され、リストの先頭に今の時刻と本文が現れる。

購読が張りっぱなしで、新着が `SectionReader` を通って Solid のシグナルまで届いていることの証明になる。

### ② 切断の扱い — 「黙って欠落させない」

ページを開いたまま:

```bash
docker compose stop nostr-rs-relay
```

**期待**: `unreachableRelays: 0` → **`1`**。

**v1 は現時点で再接続しない**（[ADR-0021](../adr/0021-reconnection-policy.md) は proposed のまま）。切断されたカラムは再マウントまで復帰しない。ただし黙って空になるのではなく、**劣化していることが表示に出る** — これが [ADR-0011](../adr/0011-performance-budget.md) を満たしている証拠。

```bash
docker compose start nostr-rs-relay   # 復帰後、ページをリロードする
```

自動では戻らない。それが現在の仕様。

### ③ 署名検証はこの画面では試せない

偽造イベントを送ろうとすると **リレー自身が弾く**:

```
["OK", "3b9cd5ac…", false, "invalid: Event malformed pubkey"]
```

`nostr-rs-relay` は行儀が良いので、クライアント側の検証を通り抜ける経路を作れない。**クライアント側の検証は「悪意あるリレー」に対する防御**であり、正常なリレーでは発動しないのが正しい状態。

ここはユニットテストの担当範囲。`src/core/read/section-reader.test.ts` に「既知の id を再利用した偽造イベントを、その id を持つ 2 つ目のセクションに流し込む」テストがある（ブランチ全体レビューで見つかった Critical の回帰テスト）。

## 後片付け

```bash
pnpm dev:relay:reset && pnpm e2e:seed
```

`dev:relay:publish` で足した分を消してシード状態に戻す。e2e は決定的なシードを前提にするため、e2e を回す前に実行する。

## 自動テストとの関係

この手順は目視確認であり、回帰を守るのは自動テストの側。

```bash
pnpm exec vitest run          # ユニット
pnpm e2e e2e/v1-section.spec.ts   # 同じ画面に対する e2e
```

e2e は「シードしたノートが表示される」「新しい順に並ぶ」「NIP-11 文書が出る」の 3 件。**目視で確認したことは e2e に落とすこと** — 手順書は増えても守られないが、テストは落ちる。

なお [ADR-0011](../adr/0011-performance-budget.md) の性能予算 7 指標は現時点で **1 つも E2E で測っていない**。詳細は [read-layer-followups.md](./read-layer-followups.md)。
