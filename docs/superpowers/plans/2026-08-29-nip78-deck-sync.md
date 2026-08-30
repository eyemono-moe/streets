# NIP-78 デッキ同期 — 実装計画

## 対応する仕様

[2026-08-29-nip78-deck-sync-design.md](../specs/2026-08-29-nip78-deck-sync-design.md)

## 変更のまとまり

### 1. addressable event を read / write の共通能力にする

対象:

- `src/core/read/event-store.ts` / `.test.ts`
- `src/core/write/fetch-latest.ts` / `.test.ts`
- `src/core/write/writer.ts` / `.test.ts`

手順:

1. EventStore の最新版索引 key を、通常の replaceable は `kind + pubkey`、
   addressable は `kind + pubkey + d` から構造的に作る。
2. `latestReplaceable`、`replaceableFetchedAt`、`invalidate` に optional identifier を
   加え、kind と identifier の不正な組み合わせは投げる。
3. addressable event の追加、同着、別 `d`、remove 後の直前版再索引をテストする。
4. `fetchLatest` の identifier 暫定 throw を、`#d` 付き REQ と該当索引の読み出しへ
   置き換える。
5. `Writer.replace` が identifier を `d` タグとしてちょうど 1 個付ける。

既存 `src/core/nostr/replaceable.ts` は v0 repository 用で、`nostr-tools` 型と現在の
EventStore と逆の同着規則を持つため、この変更へ流用しない。v1 の既存規則を維持し、
今回触る EventStore 内で key 生成を一箇所に閉じる。

検証:

```sh
pnpm exec vitest run src/core/read/event-store.test.ts src/core/write/fetch-latest.test.ts src/core/write/writer.test.ts
pnpm mutation
```

### 2. 汎用 `Nip78Document<T>` を実装する

新規:

- `src/core/solid/create-nip78-document.ts`
- `src/core/solid/create-nip78-document.test.ts`

実装するもの:

- `Nip78DocumentDefinition<T>` と `Nip78Document<T>`
- versioned local cache envelope の検証
- 旧 cache の migration hook
- cache-first 初期化、remote-first の cache 無し初期化
- NIP-44 self encrypt / decrypt
- 2 秒デバウンスと直列 queue
- revision を使った保存中変更の再送
- base event id による mutation 内競合検出
- `refresh` / `keepLocal` / `useRemote`
- logout / account 変更の generation guard と dispose

テストは fake document を二つ作り、identifier、cache、queue、競合が独立することまで
interface 越しに固定する。localStorage、時刻、fetch、Writer は in-memory adapter を
注入し、内部変数を直接検査しない。

### 3. デッキ固有の定義と context を作る

対象:

- `src/core/deck/deck.ts` / `.test.ts`
- `src/routes/v1/deck-store.tsx` / `.test.tsx`（新規）
- `src/routes/v1.tsx`

手順:

1. `deck.ts` に cache envelope ではなく、Deck の codec と既存 localStorage key だけを
   維持する。
2. `deck-store.tsx` で identifier、default、codec、同値判定、旧 Deck migration を
   `Nip78DocumentDefinition<Deck>` として定義する。
3. `v1.tsx` の deck signal、初期化 effect、`updateDeck` を削り、
   `DeckStoreProvider` と `update` へ置き換える。
4. ログイン中の Provider を pubkey で key 付けし、MuteList と同じアカウント寿命にする。
5. 既存の追加・削除・移動・改名純関数と `data-testid` は維持する。

### 4. Account 設定と Storybook を追加する

新規・変更:

- `src/routes/v1/settings/AccountSettingsPage.tsx`
- `src/routes/v1/SettingsDialog.tsx`
- `src/routes/v1/SettingsDialog.stories.tsx`
- `src/storybook/SettingsScene.tsx`
- 必要な表示テスト

手順:

1. Penpot の Settings shell を変えず、先頭に「アカウント」を追加する。
2. signed-out / loading / pending / saving / synced / error / conflict を表示する。
3. conflict では `keepLocal` と `useRemote` を明示的な二つのボタンへ接続する。
4. error / conflict のときだけ、v1 header に Account ページを開く短い導線を出す。
5. SettingsScene に document の初期状態を宣言する adapter を足し、外部リレー・署名器
   無しで全 Story を操作できるようにする。

新しい menu / dialog は増やさない。必要な primitive が生じた場合だけ Ark UI を使う。

### 5. NIP-46 session を version 3 にする

対象:

- `src/core/signer/nip46/session.ts`
- `src/core/signer/nip46/session-storage.ts` / `.test.ts`
- `src/core/signer/nip46/session.test.ts`
- `e2e/fixtures/nip46-signer.ts`
- `e2e/nip46.spec.ts`

手順:

1. 必要権限を一つの定数にする。
2. kind:1 / 6 / 7 / 10000 / 30078 と NIP-44 / 旧 NIP-04 decrypt を列挙する。
3. session version 3 に権限文字列を保存し、現在値と違う session は復元しない。
4. version 2 の読み込みが赤になることを確認する。
5. bunker E2E で権限と kind:30078 の同期後も reload / 投稿 / logout が動くことを見る。

### 6. NIP-78 E2E を追加する

新規・変更:

- `e2e/deck-sync.spec.ts`
- NIP-07 signer fixture と fixture pubkey 一覧
- 既存のログイン系 spec（自動同期の追加通信に必要な範囲だけ）

1 本の spec 内で relay を共有する二つの browser context を使う。

- 旧 local cache の初回 upload
- 別 context の remote restore
- 二端末の競合
- local / remote の各解決
- dirty cache の reload 再開

秘密鍵 seed を増やしたら `fixture-pubkeys.test.ts` へ追加し、衝突検査を通す。

### 7. 最終検証と記録

1. 追加した「捕まえる変異」を一つずつ実コードへ入れ、対象テストが赤になることを
   確認して戻す。
2. `pnpm mutation` を実行する。
3. ローカルリレーを起動し、`pnpm verify:all` を前景で完走させる。
4. `docs/design/read-layer-followups.md` へ、実装で初めて分かった判断理由だけを追記する。
5. `docs/design/v1-feature-inventory.md` と AGENTS の動作一覧を実態へ更新する。
6. 日本語コミット、push、v1 向け PR を作り、別コンテキストでレビューする。
