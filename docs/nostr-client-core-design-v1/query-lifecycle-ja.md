# QueryClient / QueryRegistry ライフサイクル整理

[Back to v1 design index](../nostr-client-core-design-v1.md)

この文書は、v1 core の query 周りをコンテキストなしで読む人向けの補足です。
`ensureEvent` / `ensureProfile` / `ensureEventRelations` という名前だけでは意図が伝わりにくいため、現行実装と今後のバッチ方針を日本語で整理します。

## 先に要点

- `EventStore` は raw Nostr event の保存場所です。
- `FeedStateStore` は「ある feed/column にどの event id が見えているか」と loading/cursor 状態を持つ UI 用 state です。
- `QueryClient` は UI/hooks から呼ぶ公開 API です。
- `QueryRegistry` は transport subscription の lifecycle、dedupe、将来の batching を管理する内部寄りの層です。
- `ensureXXX` は「ローカル store に無ければ relay に取得を依頼して、後で store に入るようにする」ための cache warmer です。
- `ensureXXX` は feed の loading complete を直接管理しません。feed の complete/cursor は `ensureEventFeed` / `fetchMoreEventFeed` と `FeedStateStore` の責務です。
- Nostr の `REQ` に複数 filter を入れても、relay から返る `EVENT` は「どの filter に match したか」を教えてくれません。batched REQ の場合、client 側で event と各 filter を照合する必要があります。

## `ensure` という言葉の意味

このコードベースでの `ensureXxx(...)` は「今すぐ値を必ず返す」ではありません。

意味は次のニュアンスです。

```txt
ensureXxx(input):
  1. まずローカルの EventStore / derived view を見る
  2. 既にあればそれを返す
  3. 無ければ relay 取得を開始する
  4. relay から EVENT が来たら EventStore に保存する
  5. UI hook は EventStore / ProfileView の subscribe によって後から更新される
```

つまり `ensure` は「存在を保証して返す」というより、「存在しなければ取得を手配する」です。
より正確な名前にするなら `warmEventCache` / `requestEventIfMissing` / `ensureEventRequested` に近いですが、現状は `ensure` という名前を使っています。

重要な注意:

- `ensureEvent` / `ensureProfile` は missing の場合、現行実装では `undefined` を返しつつ relay request を開始します。
- UI は返り値だけに依存せず、store/view の snapshot + subscribe で後続更新を受けます。
- そのため `ensureXXX` の Promise 解決は「relay query が完全に終わった」ことを意味しません。

## なぜ `ensureEvent` と `ensureProfile` が分かれているのか

Nostr 的には profile も kind:0 の通常 event です。
`EventStore` 上では profile は特別な source-of-truth ではありません。

それでも API が分かれている理由は、取得条件と読み方が違うためです。

### `ensureEvent`

特定 event id を取得します。

```txt
input: event id
relay filter: { ids: [id] }
local read: EventStore.getEvent(id)
主な用途: quote / reply / thread / EventByID など、id 参照された event の補完
```

これは raw event id 指定の取得です。

### `ensureProfile`

pubkey の最新 kind:0 metadata event を取得します。

```txt
input: pubkey
relay filter: { authors: [pubkey], kinds: [0], limit: 1 }
local read: EventStore.getLatestReplaceable(0, pubkey) または ProfileView
主な用途: avatar / display name / profile card など
```

profile は raw event ですが、「最新の replaceable kind:0 を読む」という Nostr 固有ルールがあります。
UI は最終的に `ProfileView` から renderable な profile を読みます。

したがって profile は source-of-truth として特別扱いしているのではなく、取得 API と derived view として便利に分けています。

### `ensureEventRelations`

ある event に関係する event 群を取得します。

例:

```txt
replies:   { kinds: [1], tags: { e: [rootEventId] } }
reactions: { kinds: [7], tags: { e: [eventId] } }
reposts:   kind:6/16 など、対象 event id を e tag / a tag で参照するもの
quotes:    { tags: { q: [eventId] } }
```

`relations` は「対象 event の周辺情報」を温めるための汎用 query です。
単一 event id や profile とは違い、複数 event が返りうるので `closeOnFirstEvent` では閉じません。通常は timeout / EOSE / complete によって閉じるべき request です。

## `ensureXXX` と feed は別物

`ensureXXX` は cache warmer です。
feed/column の正式な表示状態は管理しません。

```txt
ensureEvent / ensureProfile / ensureEventRelations:
  - EventStore に event を入れるための補助 query
  - UI hook は EventStore/ProfileView の更新で再描画される
  - FeedStateStore の status/complete/cursor は基本的に触らない

ensureEventFeed / fetchMoreEventFeed:
  - feed/column のための query lifecycle
  - FeedStateStore に eventIds/status/cursor/hasMoreBackfill を書く
  - loading/live/complete/error の UI 状態に関係する
```

この分離により、同じ event が複数 feed に所属できる一方で、raw event は `EventStore` に一度だけ保存されます。

## 現行実装の complete 管理

現行実装では complete の扱いが用途ごとに違います。

### forward/live subscription

`QueryRegistry` が canonical key で dedupe/ref-count します。

- 同じ forward filter は 1 subscription を共有します。
- listener は個別に `close()` / timeout / `complete()` 状態を持ちます。
- underlying subscription は最後の listener が消えた時に閉じます。

この complete は「その listener の lifecycle complete」であり、feed の `complete` 状態とは別です。

### backward one-shot cache warmer (`ensureXXX`)

現行では基本的に次のどちらかで閉じます。

- `closeOnFirstEvent: true` の request は、対象 event を受けたら閉じる
- relations のような複数 event request は timeout まで開ける

現行の `ensureXXX` は、FeedStateStore に「load complete」を書きません。
missing 時の Promise も「relay request 完了」ではなく、主に即時の cached value を返すための API になっています。

### event page / feed backfill

`fetchEventPage` / `fetchMoreEventFeed` は別です。

- packets を集める
- EOSE/complete または timeout で `finish()` する
- `fetchMoreEventFeed` は FeedStateStore の `hasMoreBackfill` / cursor / status を更新する

feed の loading/complete に相当する UI 状態はこの系統で管理します。

## 複数 filter を 1 REQ にまとめた場合の問題

Nostr relay の response は次のような形です。

```txt
["EVENT", <subscription-id>, <event-json>]
["EOSE", <subscription-id>]
```

subscription id は分かりますが、「その event が REQ 内の何番目の filter に match したか」は返りません。

したがって、複数 filter を 1REQ にまとめた場合は client 側で管理が必要です。

必要な管理:

1. batched subscription は複数 listener を持つ
2. 各 listener は自分の original filter を保持する
3. relay event が来たら、client 側で `eventMatchesFilter(event, listener.filter)` を実行する
4. match した listener にだけ event を配送する
5. `closeOnFirstEvent` は「自分の filter に match した event を受けた listener」だけ閉じる
6. EOSE/complete は batch 内の全 listener に通知できるが、それを feed complete と同一視しない

この設計なら、profile A 用 filter の結果で profile B の listener が閉じる事故を避けられます。

## 今後の backward batching 方針

同一 tick だけの batching は、virtual scroll や onMount が複数 frame にまたがるケースでは弱いです。
一方、以前のような 1 秒 batching は relay subscription 数を抑えやすいものの、visible item の読み込み体感が遅くなる可能性があります。

現時点の推奨は次です。

```txt
対象:
  ensureEvent / ensureProfile / ensureEventRelations の backward cache warmer

対象外:
  fetchEventPage / fetchMoreEventFeed / forward live feed

delay:
  32ms〜50ms 程度から開始

batch key:
  mode + relays + defaultReadRelays

emit:
  互換性を壊さないため filter を統合せず、filter array として emit する
```

filter を統合しない理由:

```txt
{ authors: [alice], kinds: [0], limit: 1 }
{ authors: [bob],   kinds: [0], limit: 1 }
```

これを次のように merge すると危険です。

```txt
{ authors: [alice, bob], kinds: [0], limit: 1 }
```

`limit: 1` が全体にかかり、alice か bob の片方しか返らない可能性があります。
そのため安全な batching は次です。

```txt
[
  { authors: [alice], kinds: [0], limit: 1 },
  { authors: [bob],   kinds: [0], limit: 1 },
]
```

## batched backward request の complete 方針

batched backward cache warmer の complete は「UI feed の complete」ではありません。

推奨 semantics:

```txt
listener complete:
  - listener がもう relay result を待たない状態
  - first matched event / timeout / batch subscription complete / explicit close で発生

feed complete:
  - feed/backfill がこれ以上読み込むものがない、または現在 page が完了した状態
  - FeedStateStore が管理する
```

batched cache warmer は listener complete だけを扱います。
FeedStateStore の `status: complete` や `hasMoreBackfill` は変更しません。

## 実装時の注意

- backward request 全体を dedupe しない。emit 前の短い batching window に登録された listener だけを同じ subscription に載せる。
- batch flush 前に listener 登録を済ませる。emit 後に listener を追加すると既に流れた event を取り逃がす。
- `eventMatchesFilter` を QueryRegistry 近くに置き、EventStore の Nostr filter semantics と矛盾しないようにする。
- `search` や lazy `since/until` など、client 側 matching が曖昧な filter は batching 対象外にするか安全側で扱う。
- `limit` は client matching では基本的に無視する。limit は relay request の取得制約であり、event 単体の match 条件ではない。
- batched subscription の `EOSE` は batch 全体の EOSE であり、個別 filter が十分な結果を得た証明ではない。
- DevTools では将来的に active subscriptions だけでなく pending batch filter 数も見えると調査しやすい。

## 名前の整理候補

現行の `ensureXXX` はやや誤解を招きます。
将来的に名前を変えるなら次のような案があります。

```txt
ensureEvent        -> requestEventIfMissing / warmEventById
ensureProfile      -> requestProfileIfMissing / warmProfile
ensureEventRelations -> requestRelations / warmEventRelations
ensureEventFeed    -> startOrUpdateEventFeed
fetchMoreEventFeed -> fetchMoreFeedEvents
```

ただし、既存 hook との互換性や差分の大きさを考えると、今すぐ rename するより、まずドキュメントとコメントで意味を明確にする方が安全です。
