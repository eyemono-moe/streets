# NIP-78 デッキ同期 — 設計案

## 0. このスライスは何のためにあるか

デッキは現在、アカウント別の localStorage にだけ保存される。別の端末では同じ
デッキを使えず、localStorage を失うと組み直しになる。

このスライスでは [ADR-0013](../../adr/0013-deck-persisted-to-nip78.md) に従い、
デッキの正を NIP-78 の kind:30078 へ移す。NIP-44 で暗号化したデッキを自分の
write リレーへ保存し、localStorage は即時起動と未送信変更の保護に使うキャッシュ
とする。

同時に、次の複雑さを汎用の `Nip78Document<T>` module の内側へ閉じる。

- localStorage の旧形式からの移行
- ログイン後のリモート取得と復号
- 連続操作のデバウンス、直列保存、途中で増えた変更の再送
- 2 端末の競合検出と、ユーザーが選んだ側だけを残す解決
- NIP-44、Writer、EventStore の addressable event 対応

カラムを描く側は kind:30078、暗号文、remote event id、保存タイマーを知らない。

## 1. 一次情報と現在の差分

- [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) は、アプリ名と
  文脈を表す `d` タグを持つ kind:30078 をアプリ固有データに使う。
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) は、30000〜39999
  を `kind + pubkey + d` で識別する addressable event とする。
- [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) の暗号処理は、
  秘密鍵を持たない streets では NIP-07 / NIP-46 署名器へ委譲する。
- [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) に従い、取得と
  publish は本人の write リレーを使う。見つからない場合だけ既定リレーへ倒す。

Penpot の `v1 / redesign` / `Settings` は左ナビに「アカウント」を持つが、本文や
同期・競合状態はまだ描かれていない。ダイアログの 880 x 640、220px ナビ、本文の
余白と面の階層は既存 `SettingsShell` をそのまま使う。未完成の本文を独自の大きな
画面へ広げず、同期状態と競合解決だけを最小の Account ページとして置く。

## 2. NIP-78 のイベント形式

streets のデッキは次の 1 アドレスに保存する。

```ts
const DECK_EVENT_KIND = 30078;
const DECK_EVENT_IDENTIFIER = "moe.eyemono.streets/deck";

{
  kind: 30078,
  tags: [["d", "moe.eyemono.streets/deck"]],
  content: await signer.nip44.encrypt(pubkey, saveDeck(deck)),
}
```

`d` は schema version を含めない。`Deck.version` が payload の移行を担い、将来
version が上がっても同じアドレスから旧版を見つけられるようにする。

NIP-44 の peer はログイン中の自分自身の pubkey とする。平文 JSON、カラム、リレー
URL は tags へ出さない。署名器が NIP-44 に対応しない、権限が無い、または暗号化を
拒否した場合は、平文へ縮退せず未同期のローカルキャッシュを残す。

復号後の値は既存 `loadDeck` で検証する。署名が正しくても payload が streets の
`Deck` である保証はないため、JSON.parse の cast では受けない。

## 3. NIP-78 document とデッキを二層に分ける

kind:30078 の同期は今後、表示設定や既読状態などにも使う可能性が高い。取得・暗号化・
local cache・デバウンス・競合検出をデッキ専用 module にすると、次の document で同じ
状態機械を複製することになる。

そこで、`src/core/solid/create-nip78-document.ts` に、アカウント単位の暗号化された
NIP-78 document を扱う汎用 module を置く。外部 interface は値、同期状態、変更、
再試行、競合解決だけにする。

```ts
type Nip78DocumentState =
  | { phase: "signed-out" }
  | { phase: "loading"; cached: boolean }
  | { phase: "ready"; sync: "synced" | "pending" | "saving" }
  | { phase: "error"; message: string; retryable: boolean }
  | { phase: "conflict"; remoteCreatedAt: number };

type Nip78Document<T> = {
  value: Accessor<T | undefined>;
  state: Accessor<Nip78DocumentState>;
  update(change: (current: T) => T): void;
  refresh(): Promise<void>;
  keepLocal(): Promise<void>;
  useRemote(): void;
};

type Nip78DocumentDefinition<T> = {
  identifier: string;
  cacheKey(pubkey: string): string;
  initial(pubkey: string): T;
  serialize(value: T): string;
  parse(raw: string): T | undefined;
  equals(left: T, right: T): boolean;
  migrateLegacy?(raw: string): T | undefined;
};
```

`Nip78DocumentDefinition<T>` が document ごとに知るのは、`d` の値、初期値、値の
codec、同値判定、local cache key と旧形式だけである。kind:30078、`#d` フィルタ、
自分自身への NIP-44、base event id、保存 queue、generation、競合規則は定義側へ
漏らさない。すべての document はこのスライスでは NIP-44 self-encrypted とし、公開
content という未使用の選択肢を先回りして interface に追加しない。

デッキ側は `src/routes/v1/deck-store.tsx` で `Nip78DocumentDefinition<Deck>` を 1 個
定義し、`createNip78Document` の返り値をそのまま context で提供する。新しい保存状態
機械や `DeckSync` interface は作らない。

```ts
const deckDocument = {
  identifier: "moe.eyemono.streets/deck",
  cacheKey: deckStorageKey,
  initial: defaultDeck,
  serialize: saveDeck,
  parse: loadDeck,
  equals: (left, right) => saveDeck(left) === saveDeck(right),
  migrateLegacy: loadDeck,
} satisfies Nip78DocumentDefinition<Deck>;
```

`DeckStoreProvider` がデッキと `SettingsDialog` を包み、Account ページは context を
直接読む。`SettingsDialogProps` や `v1.tsx` へ同期状態・保存 handler を追加しない。

`update` は change が同じ参照を返した場合に何もしない。既存の `addColumnTo`、
`removeColumnFrom`、`moveColumnIn`、`renameColumnIn` はそのまま使い、画面側は
`deckStore.update(current => moveColumnIn(current, id, direction))` のように呼ぶ。

汎用 module の依存は作成時に注入する。

- アカウントを表す `pubkey` accessor
- `Signer`、`Writer.replace`、`fetchLatest`
- production の localStorage adapter / テストと Storybook の in-memory adapter
- デバウンスを決定的に進める scheduler

production とテストで実在する adapter だけを seam にし、暗号化や競合判定の途中状態は
interface へ出さない。テストは `Nip78Document<T>` の interface を通して観測する。

この分割により、次の kind:30078 利用は definition と利用側 context だけを足せばよい。
競合 UI を document ごとに置くか、将来 Account ページで一覧化するかは、その二つ目の
実例ができた時点で決める。まだ一つしかない document のために管理画面の汎用 registry
までは作らない。

## 4. localStorage は「表示キャッシュ + 未送信ログ」にする

現在のキー `streets.v1.deck.<pubkey>` は維持し、値を versioned envelope にする。

```ts
type Nip78DocumentCacheV1 = {
  cacheVersion: 1;
  serialized: string;
  dirty: boolean;
  remote?: {
    id: string;
    createdAt: number;
  };
};
```

`serialized` は definition の `serialize` が返した平文を入れ、読み込み時は必ず
`parse` へ通す。汎用 cache が `Deck` の構造を知ったり、未検証の `unknown` を `T` と
cast したりしない。

`remote.id` は、この cache が最後に取り込んだ kind:30078 の版を表す。次の保存時に
リレーの最新版と一致するかを確かめるための基準であり、画面の識別子には使わない。

旧形式の `{ version: 2, columns: [...] }` を読めた場合は、`dirty: true`、remote
無しへ移行する。これにより既存ユーザーのデッキを既定値で上書きせず、最初の同期対象に
できる。壊れた値は従来どおり採用しない。

変更時は次の順序にする。

1. memory の `deck` を更新する
2. envelope を `dirty: true` で localStorage へ保存する
3. デバウンス後にリモート保存を試す

localStorage の失敗で 1 を巻き戻さない。そのセッションは使える状態を保ち、Account
ページへ「この端末へ保存できない」エラーを出す。リモート保存の成否とも混同しない。

復号済み deck は元から localStorage にあった情報なので、account cache として同じ
キーへ置く。一方、NIP-44 の暗号文を IndexedDB に重ねて永続化する必要はない。
kind:30078 は既定の `scope: session / retention: none` のままにし、EventStore の
メモリにだけ置く。

## 5. 起動時の照合

ログイン後、NIP-65 のルーティング取得が settle してから write リレーへ
`{ kinds: [30078], authors: [pubkey], "#d": [DECK_EVENT_IDENTIFIER] }` を送る。

有効な local cache があれば、ネットワークや署名器を待たずに先に描く。cache が無い
新しい端末では、一瞬だけ既定デッキを出してからリモート版へ差し替えない。取得が
終わるまで deck を loading とし、リモートが無いと確定したときに既定デッキを作る。

照合規則は次のとおり。

| local | remote | 結果 |
| --- | --- | --- |
| 無し | 無し | 既定デッキを作り、pending として同期する |
| 無し | 有り | 復号・検証した remote を採用する |
| clean、base id が同じ | 同じ版 | local を維持し synced |
| clean | 新しい版 | remote を採用する |
| dirty、base id が同じ | 同じ版 | local を維持して保存を再開する |
| dirty | 新しい版 | 内容が同じなら新 base を採用、違えば conflict |
| 旧形式 local | 無し | local を同期する |
| 旧形式 local | 有り | 内容が同じなら remote を base にし、違えば conflict |

remote の取得、NIP-44 復号、Deck 検証のいずれかが失敗しても、有効な local を消さない。
local も無い場合はアプリを使えなくしないため既定デッキへ倒すが、`synced` とは表示
せず error を残す。

ログアウトまたはアカウント変更では、タイマー、競合中の remote、復号済み deck を
破棄する。進行中 Promise の完了は generation で無視し、A の結果を B の cache へ
書かない。

## 6. 保存、デバウンス、直列化

ローカル変更は即時反映し、最後の変更から 2 秒後に 1 回だけ署名する。追加、複数回の
移動、改名を短時間に続けたときに、操作回数ぶん NIP-07 の承認を連打しないためである。

デバウンスは event mutation を合成しない。常にその時点の `Deck` の最終 snapshot を
1 個の暗号文へする。そのため Issue #301 の汎用 `Mutation` 合成型を、このスライスの
前提にはしない。

保存は module 内の queue で直列化する。保存開始時に deck と revision を snapshot
し、publish 成功後に次を行う。

- revision が同じ: 返った event id を base にして `dirty: false`
- 保存中に変更が増えた: 返った event id を新しい base にするが dirty は維持し、
  最新 snapshot をもう一度デバウンスなしで保存する

`Writer.replace` の mutation 内で、再取得した current id と cache の base id を比較する。
一致しなければ暗号化・署名・楽観挿入より前に `DeckConflictError` を投げる。UI 側で
取得してから Writer を呼ぶだけでは、この間に別端末が書く窓が残るため、比較は
read-modify-write の seam の内側に置く。

publish 全滅、署名拒否、NIP-44 拒否では local の dirty snapshot を残す。自動 retry は
署名要求を勝手に繰り返すため行わず、Account ページの「再試行」または次の deck 操作を
契機にする。

`beforeunload` で非同期署名を始めない。ブラウザは完了を保証せず、突然の承認 UI にも
なる。dirty cache が次回ログイン後に再開することを、終了時の耐久性とする。

## 7. 競合はマージせず、ユーザーが片方を選ぶ

ADR-0013 のとおり、カラム配列の自動マージはしない。競合中も現在使っている local deck
を表示し、remote を勝手に適用しない。

Account ページには次を出す。

- 「この端末とリレーのデッキが両方変更されています」
- remote の更新日時
- 「この端末のデッキを保存」
- 「リレーのデッキを使う」

「この端末のデッキを保存」は、競合として確認した remote id を新しい base にして
もう一度 `Writer.replace` する。その間に remote がさらに変われば再び conflict とし、
確認していない版を上書きしない。

「リレーのデッキを使う」は、既に復号・検証済みの remote deck を memory と cache へ
保存し、dirty を消す。local の未送信変更を捨てる操作なので、ボタン文言で対象を明示し、
誤って設定ダイアログの外側を押しただけでは実行しない。

`deck()` の内容が同じなら event id が違っても競合にしない。暗号文は nonce により毎回
変わりうるため ciphertext や event id の相違だけで警告すると、実質同じデッキで
偽の競合になる。

## 8. EventStore / Writer の addressable event 対応

`EventStore` の置換索引を、通常の replaceable と addressable の両方を扱える内部 key
へ広げる。

- kind:0、3、10000〜19999: `kind + pubkey`
- kind:30000〜39999: `kind + pubkey + 最初の d タグ値`

文字列の `:` 連結では `d` 自体に `:` が入ると衝突するため、tuple の JSON 表現など
構造を保つ key を一箇所で作る。公開 interface は次の optional identifier で済ませる。

```ts
latestReplaceable(kind, pubkey, identifier?): NostrEvent | undefined;
replaceableFetchedAt(kind, pubkey, identifier?): number | undefined;
invalidate(kind, pubkey, identifier?): void;
```

追加・同着時の id 比較・remove 後の直前版再索引は、通常の replaceable と addressable
で同じ規則にする。変更通知には identifier を optional で含め、別の `d` の更新を
デッキ更新として扱わない。

`fetchLatest` は identifier があるときに投げる暫定ガードを外し、REQ へ `#d` を加え、
上の索引から同じ identifier だけを返す。identifier 無しで addressable kind を呼ぶなど、
索引できない組み合わせは黙って undefined にせずエラーにする。

`Writer.replace` は identifier がある場合、mutation が返した既存の `d` タグを除き、
`["d", identifier]` を必ず 1 個だけ付ける。引数を受けるだけで wire event へ反映しない
現在の暫定実装をここで完了させる。

## 9. 設定画面と Storybook

`SettingsDialog` の先頭に Penpot の予定どおり「アカウント」を追加し、その中に
「デッキ同期」だけを置く。プロフィール編集やアカウント切替はまだ置かない。

通常時は大きな成功通知を常駐させず、次の短い状態だけを示す。

- 同期を確認中
- 同期待ち / 保存中
- 同期済み（最終同期日時が分かる場合だけ併記）
- 保存失敗 + 再試行
- 競合 + 2 つの解決操作

競合と再試行可能な失敗は、設定を開いていないと気づけない状態にしない。デッキの
ヘッダーに短い「デッキの同期を確認」導線を出し、押すと Settings の Account ページを
開く。接続本数や raw error は出さない。

Account 本文は Penpot にまだ無いため、既存 `SettingsPage`、Button、notice の面と token
だけで組む。次の Story を作り、PR 前のローカル確認面にする。

- signed-out / loading
- synced / pending / saving
- NIP-44 unavailable / fetch error / publish error
- conflict
- 「リレー版を使う」後に synced へ変わる状態
- 「この端末を保存」で保存中へ変わる状態

Ark UI の新しい primitive が必要なら Ark UI を使う。競合の 2 ボタンだけのために別の
確認 Dialog を重ねず、Account ページ内で完結させる。

## 10. NIP-46 の再認可

kind:30078 の署名と NIP-44 encrypt/decrypt を要求権限へ含める。既存 session のまま
新しい `sign_event` を呼んで remote signer に拒否される状態を避けるため、保存形式を
version 3 に上げ、要求権限文字列も保存する。現在の必要権限と一致しない session は
復元せず、再接続を案内する。

現行の要求権限は kind:1 と kind:10000 だけで、直前スライスで実装した kind:6 / 7 が
含まれていない。このスライスで session version を更新する同じ箇所に、実装済みの
全 write kind を列挙する。

```text
sign_event:1
sign_event:6
sign_event:7
sign_event:10000
sign_event:30078
nip44_encrypt
nip44_decrypt
nip04_decrypt
```

NIP-07 は connect 時の権限交渉を持たないので、各操作の失敗を
`Nip78DocumentState` へ返す。

## 11. テスト

### 11.1 ブラウザ無し

- plain な旧 cache を dirty envelope へ移行し、壊れた cache は採用しない
- cache があれば remote を待たず描き、cache が無ければ remote 確定前に既定値を出さない
- NIP-44 は自分自身を peer とし、平文 deck を content / tags へ漏らさない
- 同じ `Nip78Document<T>` が別 identifier / codec の document を独立して管理できる
- document A の queue、base id、競合、logout が document B の状態へ影響しない
- remote payload を `loadDeck` で検証し、不正値で local を上書きしない
- 起動照合表の各組み合わせ（missing / clean / dirty / legacy / same content / conflict）
- 2 秒内の複数変更を 1 署名へまとめる
- 保存中の追加変更を、新 base に対する 2 回目の保存へ送る
- `Writer.replace` 内の base id 比較が競合を署名前に止める
- ログアウト・アカウント変更後に古い Promise が別アカウントへ反映されない
- publish / encrypt / storage 失敗で memory の deck と dirty cache を失わない
- `keepLocal` の再照合と `useRemote` の破棄規則
- addressable 索引が `d` ごとに最新版を分け、同着、remove、再索引を正しく扱う
- `fetchLatest` が `#d` を送り、別 identifier の event を返さない
- `Writer.replace` が `d` をちょうど 1 個付ける
- NIP-46 version 2 を復元せず、全 write kind を version 3 の権限に含める

新しいテストには「捕まえる変異」を書き、実際に各変異を入れて狙ったテストが赤に
なることを確かめて戻す。`src/core/write/**` の変更後は `pnpm mutation` も通す。

### 11.2 Storybook / E2E

Storybook は 9 節の全状態を外部リレーなしで操作できるようにする。

Playwright は NIP-07 stub とローカルリレーを使い、次を通す。

1. 旧 localStorage deck でログインする
2. NIP-44 暗号化された kind:30078 が `d` 付きで publish される
3. 別 browser context は localStorage 無しでも同じ deck を復元する
4. 2 context が同じ base から別々に変更し、後から保存した側が conflict になる
5. local / remote の各解決を選ぶと選んだ内容だけが残る
6. reload 中に dirty cache があれば未送信変更を維持して保存を再開する
7. 同時接続は既存 `ConnectionPool` 一本で、30 接続予算を越えない

暗号文そのものの実装は外部署名器の責務なので、E2E stub は NIP-44 の呼び出し引数と
往復を検証し、暗号アルゴリズムをアプリ側へ再実装しない。

## 12. このスライスで完了とするもの

- Issue #212 の kind:30078 + NIP-44 デッキ同期
- localStorage を即時表示 cache と未送信変更の耐久層として使うこと
- 2 端末競合を上書き前に検出し、Account ページで解決できること
- EventStore / fetchLatest / Writer の addressable event 対応
- NIP-46 の kind:30078 再認可と、実装済み kind:6 / 7 権限の欠落修正
- Storybook と E2E で同期・失敗・競合をリレー seed の手作業なしに再現できること

## 13. 範囲外

- デッキ同士の自動マージ、カラム単位の競合解決、履歴 UI
- 複数デッキ、デッキ名、共有デッキ
- アカウント切替 UI、プロフィール編集
- NIP-78 を専用リレーへ保存する設定
- NIP-78 を使った他の設定値や既読状態の同期
- 汎用 `Mutation` 合成型（Issue #301）
- Penpot ファイル自体の編集
- モバイルの設定画面
