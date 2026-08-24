# 通知カラムはどのリレーから読むべきか

**この文書は「通知カラム (`{ kinds: [1,6,7], "#p": [自分] }`) がどのリレー集合を購読すべきか」を、NIPs 原文とクライアント実装の一次情報だけで検証したものである。** 結論だけを知りたい場合は 1 節で足りる。根拠が要る場合だけ 2 節以降を読む。

現在の streets の設計は「自分の NIP-65 read リレー、無ければ `FALLBACK_RELAYS`（3 本固定、`src/core/read/default-relays.ts`）」である。検証対象の仮説は次の 2 つ。

- **(a)** NIP は「自分宛のイベントは送り手が受け手の read リレーへ送る」と規定しているか。MUST か SHOULD か。
- **(c)** 「自分の write リレーを読んで通知を拾う」を実際に採用しているクライアントは存在するか。

---

## 1. 結論

**現在の設計（read リレー + 固定 fallback）を変える理由は見つからなかった。write リレーを足す・フォロワーの write リレーを追う、のどちらも根拠がない。**

理由は 3 つ。

1. **NIP-65 はそもそも「受け手が read リレーを見る」ことを前提にした設計になっている。** 送り手の SHOULD（2 節）は「あなたが見ている read リレーへ、私が送る」という約束であって、受け手側が write リレーを覗きに行く話ではない。読み手が自分の write リレーを読みに行く方式は、この約束の外側にある独自ルートであり、NIP に規定がない。
2. **調べられた範囲で、read リレー（NIP-65 inbox）を使わないクライアントは無かった。** nostrudel・coracle (welshman)・Amethyst・Snort の 4 つは、実装の言葉遣いは違っても全部「自分の read/inbox リレー」を通知の購読先にしている（3 節）。「自分の write リレーを読む」を採用している例は 1 つも見つからなかった（4 節）。
3. **「フォロワーの write リレー全部」は Nostr の構造上、割に合わないだけでなく求めるものが手に入らない。** Nostr には「自分をフォローしている人」を安く列挙する仕組みが無い（kind:3 は「自分が誰をフォローしているか」であって逆引きではない）。フォロワー集合を近似するには外部インデクサに頼るか、全 kind:3 をクロールするしかなく、[ADR-0011](../adr/0011-performance-budget.md) が守ろうとしている接続予算 30 本と真っ向から衝突する。ここでコストをかけても、NIP-65 が既に想定している「送り手が read リレーへ送る」という経路の**上**に別の探索経路を足すだけで、拾えるようになる通知の増分は不明である。

**唯一 read リレーだけでは拾いきれないと分かっているのが zap receipt (kind:9735) である。** NIP-57 は zap receipt の送り先を受け手の read リレーではなく、zap request 発行時に送信側クライアントが指定した `relays` タグ**へ MUST で publish**すると規定している（2 節）。慣習的に多くのクライアントはこの `relays` に受け手の read リレーを含めるが、それは NIP-65 の保証ではなく送信側クライアントの実装依存である。read リレーを購読していても zap receipt を取りこぼす余地は理論上残る——ただしこれは「read か write か」という今回の論点とは別の穴であり、fallback リレーを増やしても write リレーを足しても塞がらない。指摘として記録するに留める。

**Amethyst の設計は streets の現行設計とほぼ同型である。** `NotificationInboxRelayState`（3 節）は「NIP-65 read リレー ∪ ローカルリレー、NIP-65 が引けなければ `Constants.bootstrapInbox`」であり、「read リレー + fallback」という骨格が streets の `relay-selector.ts` と一致する。これは偶然の一致ではなく、NIP-65 の SHOULD が想定する読み方をそのまま実装するとこの形になる、ということだと理解してよい。

---

## 2. (a) NIP の規定 — 原文引用

一次情報は [nostr-protocol/nips](https://github.com/nostr-protocol/nips) の raw ファイル。参照コミットは [`656cecc7`](https://github.com/nostr-protocol/nips/commit/656cecc7c0a815b6a2b218d3b5d6f078b3f4dbab)（2026-08-24 時点の master）。

### NIP-65 — Relay List Metadata（outbox model の規定本体）

出典: [65.md](https://github.com/nostr-protocol/nips/blob/656cecc7c0a815b6a2b218d3b5d6f078b3f4dbab/65.md)

> When downloading events **from** a user, clients SHOULD use the **write** relays of that user.
>
> When downloading events **about** a user, where the user was tagged (mentioned), clients SHOULD use the user's **read** relays.
>
> When publishing an event, clients SHOULD:
>
> - Send the event to the **write** relays of the author
> - Send the event to all **read** relays of each tagged user
> - Send the author's `kind:10002` event to all relays the event was published to

**両方とも SHOULD であって MUST ではない。** 「自分宛の通知をどこで拾うか」に対応するのは 1 文目と 3 文目の 2 番目の箇条書きで、**送り手が自分（tagged user）の read リレーへ送る**ことが期待されている。streets が read リレーを購読するのは、この SHOULD を送り手が守っている前提に乗っているということであり、送り手が守らなければ拾えない。

`write` リレーの規定はこの逆——「その人**が書いたもの**を読みに行くときは write リレーを見る」——であり、フォロー中タイムラインの話であって通知の話ではない。write リレーを通知の購読先に足す根拠はこの条文には無い。

### NIP-01 — 基本のイベント配布

出典: [01.md](https://github.com/nostr-protocol/nips/blob/656cecc7c0a815b6a2b218d3b5d6f078b3f4dbab/01.md)

NIP-01 には read/write リレーという概念自体が存在しない（NIP-65 より前の仕様であり、outbox モデルを知らない）。あるのは REQ/EVENT/フィルタの基本セマンティクスだけで、「どのリレーを選ぶか」への言及は無い。**NIP-01 は今回の論点に対して中立——規定が無い、というのが正確な記述である。**

### NIP-10 — Text Notes and Threads

出典: [10.md](https://github.com/nostr-protocol/nips/blob/656cecc7c0a815b6a2b218d3b5d6f078b3f4dbab/10.md)

> `<pubkey>` SHOULD be the pubkey of the author of the `e` tagged event, this is used in the outbox model to search for that event from the authors write relays where relay hints did not resolve the event.

これは「引用/返信先イベントの本体を取りに行くとき、そのイベントの**著者の** write リレーを見る」という話であり、通知（`#p` で自分が指されたイベントをどこで拾うか）とは別の経路。NIP-10 に通知の relay 選択に関する直接の規定は無い。

### NIP-57 — Lightning Zaps

出典: [57.md](https://github.com/nostr-protocol/nips/blob/656cecc7c0a815b6a2b218d3b5d6f078b3f4dbab/57.md)

> Once the invoice is paid, the recipient's lnurl server MUST generate a `zap receipt` as described in Appendix E, and publish it to the `relays` specified in the `zap request`.

zap receipt (kind:9735) は、受け手の read リレーではなく、**zap request を作った送金側クライアントが `relays` タグに書いたリレー集合へ MUST で publish される**。この `relays` は zap request 側（Appendix A）が決めるものであり、

> `relays` is a list of relays the recipient's wallet should publish its `zap receipt` to.

としか規定されていない——「受け手の read リレーを含めよ」という規定は無い。1 節で触れたとおり、read リレー購読だけでは zap receipt を理論上取りこぼしうる。

---

## 3. (b) クライアント別の実態

**確認できたのは 4 クライアント + ライブラリ 2 つ + 部分的に 2 クライアント。** 全部ソースコードの該当箇所まで辿った。

| クライアント | 通知の購読先 | 判定 |
|---|---|---|
| nostrudel (hzrd149, TS) | `mailboxes.inboxes`（無ければ `fallbackRelays`） | **read** |
| coracle (coracle-social, TS/welshman) | `Router.get().ForUser()` = `RelayMode.Read` | **read** |
| Amethyst (vitorpamplona, Kotlin) | NIP-65 read リレー ∪ ローカルリレー、無ければ `Constants.bootstrapInbox` | **read** |
| Snort (v0l, TS) | `OutboxModel.forRequest` が `#p` を検出 → 対象 pubkey の read リレーを選ぶ | **read** |
| YakiHonne (web-app, TS/NDK) | NDK の outbox 計算は `authors` フィルタしか特別扱いしない。`#p` だけの通知フィルタは対象外で、固定のプラットフォームリレーへ送られる | **固定リレー**（NIP-65 非依存） |
| Damus (Swift) | 通知フィルタを明示的な relay 指定なしで既存の接続プールへ流す。プール自体は自分の NIP-65（read+write 両方）から構築される単一プール | **プール全体**（read/write を区別する処理は見当たらず） |
| Nostur (Swift) | 通知専用の relay 選択ロジックを特定できず | **確認できなかった** |
| Primal | 未確認 | **確認できなかった** |

### nostrudel

出典: [`src/services/notifications/common.ts`](https://github.com/hzrd149/nostrudel/blob/38f0eb9f6d9b4212910fecdff445f7a1a16e3349/src/services/notifications/common.ts)

```ts
// Get users mailboxes
const mailboxes$ = accounts.active$.pipe(
  switchMap((account) => (account ? eventStore.mailboxes(account.pubkey) : of(null))),
);

// Get users inboxes or fallback relays
export const inboxes$ = combineLatest([mailboxes$, localSettings.fallbackRelays]).pipe(
  map(([mailboxes, fallbackRelays]) => mailboxes?.inboxes ?? fallbackRelays),
);
```

`socialNotificationsLoader$` / `shareNotificationsLoader$` / `zapNotificationsLoader$` はいずれも `inboxes$` を購読先リレーとして `{"#p": [account.pubkey], kinds: [...]}` を投げている。

`mailboxes.inboxes` の定義は依存ライブラリ applesauce 側。出典: [`packages/core/src/helpers/mailboxes.ts`](https://github.com/hzrd149/applesauce/blob/ec51f7d4ecfd3db6099e786e8eec0062255588d4/packages/core/src/helpers/mailboxes.ts)

```ts
/** Parses a 10002 event and stores the inboxes in the event using the {@link MailboxesInboxesSymbol} symbol */
export function getInboxes(event: NostrEvent): string[] {
  // ... mode === "read" || mode === undefined
}
```

`inboxes` = NIP-65 の `read`（または無印）マーク付き `r` タグ。fallback へ落ちるのは自分の kind:10002 が引けなかったときだけ。

### coracle (welshman)

出典: [`src/engine/requests.ts`](https://github.com/coracle-social/coracle/blob/1137f8ad107ee8b9f9591f113f5f9e2935323dc3/src/engine/requests.ts)

```ts
export const loadNotifications = () => {
  const filter = {kinds: getNotificationKinds(), "#p": [pubkey.get()]}
  return pullConservatively({
    relays: Router.get().ForUser().policy(addMaximalFallbacks).getUrls(),
    filters: [addSinceToFilter(filter, int(WEEK))],
  })
}

export const listenForNotifications = () => {
  const filter = {kinds: getNotificationKinds(), "#p": [pubkey.get()]}
  myRequest({
    skipCache: true,
    relays: Router.get().ForUser().policy(addMaximalFallbacks).getUrls(),
    filters: [addSinceToFilter(filter)],
  })
}
```

`Router.ForUser()` の定義は `@welshman/router`（coracle の `package.json` は `^0.8.15` を要求。npm 公開版 `0.8.16` の dist を確認）。

```js
ForUser = () => this.FromRelays(this.getRelaysForUser(RelayMode.Read));
```

`ForUser()` は明示的に `RelayMode.Read`。**streets が「自分の read リレー」と呼んでいるものと同じ概念**であり、`.policy(addMaximalFallbacks)` は read リレーが薄いときにフォールバックを足す挙動——streets の `FALLBACK_RELAYS` と同じ役割。

出典: [unpkg `@welshman/router@0.8.16/dist/index.js`](https://unpkg.com/@welshman/router@0.8.16/dist/index.js)（該当パッケージのソースリポジトリは npm メタデータに repository フィールドが無く特定できなかったため、公開 dist を一次情報として引用）

### Amethyst

出典: [`Account.kt:765`](https://github.com/vitorpamplona/amethyst/blob/dad7fccaf2182fac6fd61afe8f0676990ee79b10/amethyst/src/main/java/com/vitorpamplona/amethyst/model/Account.kt#L765)

```kotlin
val notificationRelays = NotificationInboxRelayState(nip65RelayList, localRelayList, scope)
```

出典: [`NotificationInboxRelayState.kt`](https://github.com/vitorpamplona/amethyst/blob/dad7fccaf2182fac6fd61afe8f0676990ee79b10/amethyst/src/main/java/com/vitorpamplona/amethyst/model/nip01UserMetadata/NotificationInboxRelayState.kt)

```kotlin
class NotificationInboxRelayState(
    nip65RelayList: Nip65RelayListState,
    localRelayList: LocalRelayListState,
    scope: CoroutineScope,
) {
    val flow =
        combine(
            nip65RelayList.inboxFlow,
            localRelayList.flow,
        ) { nip65Inbox, localRelays -> nip65Inbox + localRelays }
        // ...
}
```

`inboxFlow` の定義（[`Nip65RelayListState.kt`](https://github.com/vitorpamplona/amethyst/blob/dad7fccaf2182fac6fd61afe8f0676990ee79b10/amethyst/src/main/java/com/vitorpamplona/amethyst/model/nip65RelayList/Nip65RelayListState.kt#L84-L92)）:

```kotlin
val inboxFlow =
    getNIP65RelayListFlow()
        .map { normalizeNIP65ReadRelayListWithBackup(it.note) }
        // ...

fun normalizeNIP65ReadRelayListWithBackup(note: Note): Set<NormalizedRelayUrl> =
    nip65Event(note)?.readRelaysNorm()?.toSet() ?: Constants.bootstrapInbox
```

**NIP-65 の read リレー（自分の kind:10002 が無ければ固定の `Constants.bootstrapInbox`）にローカルリレーを足したもの。** 実際の購読側でもこの `notificationRelays` がそのまま使われている（[`AccountNotificationsHistoryEoseManager.kt:109`](https://github.com/vitorpamplona/amethyst/blob/dad7fccaf2182fac6fd61afe8f0676990ee79b10/amethyst/src/main/java/com/vitorpamplona/amethyst/service/relayClient/reqCommand/account/nip01Notifications/AccountNotificationsHistoryEoseManager.kt#L109)）:

```kotlin
private fun notificationRelaySet(account: Account): Set<NormalizedRelayUrl> =
    account.notificationRelays.flow.value + groupsByRelay(account).keys
```

**streets の「read リレー、無ければ固定 fallback」と骨格が一致する実装例。**

### Snort

出典: [`packages/app/src/Pages/Notifications/Notifications.tsx`](https://github.com/v0l/snort/blob/8d01774c00a9965e7198db09c2c7c5a2a988b38c/packages/app/src/Pages/Notifications/Notifications.tsx) は `useNotificationsView()`（`@/Feed/WorkerRelayView`）を呼ぶだけで、relay 指定を持たないフィルタ (`kinds([...]).tag("p", [publicKey])`) を投げている。relay 選択は `@snort/system` の outbox 層に委ねられている。

出典: [`packages/system/src/outbox/outbox-model.ts`](https://github.com/v0l/snort/blob/8d01774c00a9965e7198db09c2c7c5a2a988b38c/packages/system/src/outbox/outbox-model.ts)

```ts
forRequest(filter: ReqFilter, pickN?: number): Array<ReqFilter> {
  // when sending a request prioritize the #p filter over authors
  const pattern = filter["#p"] !== undefined ? "inbox" : "outbox"
  const key = filter["#p"] !== undefined ? "#p" : "authors"
  const authors = filter[key]
  // ...
  const topWriteRelays = this.pickTopRelays(
    unwrap(authors),
    pickN ?? DefaultPickNRelays,
    pattern === "inbox" ? "read" : "write",
  )
  // ...
}
```

`#p` を持つフィルタ（通知フィルタはまさにこれ）は `"inbox"` パターンとして扱われ、`#p` に列挙された pubkey（＝自分）の **read** リレーが選ばれる。`OutboxModel` は既定で有効。出典: [`packages/system/src/system-base.ts`](https://github.com/v0l/snort/blob/8d01774c00a9965e7198db09c2c7c5a2a988b38c/packages/system/src/system-base.ts)

```ts
automaticOutboxModel: props.automaticOutboxModel ?? true,
```

同じ `outbox-model.ts` の `forReply` / `forReplyTo` は**送信側**の relay 選択（NIP-65 の「タグした相手の read リレーへ送る」SHOULD の実装）にも `"read"` を使っている——2 節で見た NIP-65 の 2 つの SHOULD の両方を、Snort は同じ「read リレーを引く」ヘルパーで実装している。

### YakiHonne（web-app）— 意外な反例

出典: [`src/Components/IinitiateNotifications.js`](https://github.com/YakiHonne/web-app/blob/4002d853e79014867f14dc0f71beefd099b32730/src/Components/IinitiateNotifications.js) の `getFilter()` は `{"#p": [userKeys.pub], kinds: [...]}` 形の複数フィルタを組み、`ndkInstance.subscribe(filter, ...)` へ渡す。`authors` を持つのはフォロー中タイムライン用フィルタだけで、通知系フィルタはすべて `#p` のみ。

出典: [`src/Helpers/NDKInstance.js`](https://github.com/YakiHonne/web-app/blob/4002d853e79014867f14dc0f71beefd099b32730/src/Helpers/NDKInstance.js)

```js
const ndkInstance = new NDK({
  explicitRelayUrls: relaysOnPlatform,
  enableOutboxModel: true,
  // ...
});
```

`enableOutboxModel: true` だが、NDK 本体の outbox relay 計算（[`core/src/relay/sets/calculate.ts`](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/sets/calculate.ts)）は **`authors` を持つフィルタしか特別扱いしない**（詳細は 3 節末尾「NDK」参照）。`#p` だけの通知フィルタは `authors` が無いので outbox 計算の対象外になり、`ndk.explicitRelayUrls`（＝`relaysOnPlatform`、プラットフォームが決め打ちした固定リレー）へフォールバックする。

**「outbox model を有効にしている」と謳っていても、通知フィルタの実際の送り先は自分の NIP-65 read リレーではなく固定リレーだった、という例。** ライブラリの outbox 実装が `authors` フィルタしかカバーしていないことの帰結であり、意図的な設計というより実装の隙間に見える。

### Damus

出典: [`damus/Features/Timeline/Models/HomeModel.swift`](https://github.com/damus-io/damus/blob/e462dbd53c47eadfd2535af4c56acf25973a48fc/damus/Features/Timeline/Models/HomeModel.swift) の `send_home_filters()`:

```swift
var notifications_filter = NostrFilter(kinds: notifications_filter_kinds)
notifications_filter.pubkeys = [damus_state.pubkey]
notifications_filter.limit = 500
let notifications_filters = [notifications_filter]
// ...
for await item in damus_state.nostrNetwork.reader.advancedStream(
    filters: notifications_filters,
    streamMode: .ndbAndNetworkParallel(networkOptimization: .sinceOptimization)
) { ... }
```

relay を明示的に選ぶ引数は無く、`reader`（`SubscriptionManager`）が既に接続しているプール全体へ流れる。プールの構成は [`UserRelayListManager.swift`](https://github.com/damus-io/damus/blob/e462dbd53c47eadfd2535af4c56acf25973a48fc/damus/Core/Networking/NostrNetworkManager/UserRelayListManager.swift) が担う。

```swift
private func computeRelaysToConnectTo(with relayList: NIP65.RelayList) -> [RelayPool.RelayDescriptor] { ... }
```

自分の NIP-65 `RelayList`（read・write 両方の情報を保持する `RelayDescriptor`）を単一の `RelayPool` へ反映する形になっており、通知フィルタだけを read マーク付きリレーに絞る処理はこのファイル・`HomeModel.swift` の範囲では見当たらなかった。**「read/write を区別せず、自分が既に繋いでいるリレー全部（＝自分の NIP-65 全体）に通知フィルタを投げている」というのが確認できた事実であり、それ以上の断定（例えば write 側からも意図的に拾っている、という主張）はできない。**

### Nostur・Primal

Nostur は `Nostur/Relays/Network/OutboxLoader.swift` を確認したが、これはフォロー中著者の write リレー（kind:10002）を先読みしてタイムライン用に使うための仕組みであり、通知専用の relay 選択ロジックではなかった。同ファイルには `getInboxRelays(forPubkey:)` という read リレーを計算する関数があるが、本体が `return []` で終わっており呼び出し元も見つからなかった——死んでいるコードに見えるが、通知に使われている確証もない。**通知専用の relay 選択ロジックの所在は確認できなかった。**

Primal は独自バックエンド（caching relay）を持つことで知られているが、そのバックエンドが通知取得に何を使っているかを示す一次情報（ソースコード）には到達できなかった。**確認できなかった。**

### ライブラリの outbox 実装

- **nostr-dev-kit/ndk**（[`core/src/relay/sets/calculate.ts`](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/sets/calculate.ts)）: `calculateRelaySetsFromFilters`（購読側）は `authors` を持つフィルタしか outbox 計算をしない。`#p` だけの通知フィルタは対象外——上記 YakiHonne の反例はこの仕様の直接の帰結。一方 `calculateRelaySetFromEvent`（publish 側、[同ファイル](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/sets/calculate.ts#L64-L74)）は NIP-65 の「タグした相手の read リレーへ送る」SHOULD をそのまま実装している。

  ```ts
  const pTaggedRelays = Array.from(
    chooseRelayCombinationForPubkeys(ndk, pTags, "read", {
      preferredRelays: new Set(authorWriteRelays),
    }).keys(),
  );
  ```

  **つまり NDK は「送信側で read リレーへ送る」は実装しているが、「受信側で `#p` フィルタを read リレーへルーティングする」は実装していない。** NIP-65 の 2 つの SHOULD のうち片方だけをライブラリが自動化しており、もう片方（受信側の最適化）はアプリ側が自前で担う必要がある——nostrudel・coracle・Snort は自前で担っており（3 節）、YakiHonne は NDK の挙動をそのまま受け入れて固定リレーに落ちている。

- **applesauce**（hzrd149）: outbox 専用モジュールという体裁ではなく、`mailboxes` ヘルパー（`getInboxes` / `getOutboxes`、上記 nostrudel の節で引用）が read/write の判定を提供するだけの薄い層。ルーティングの組み立ては呼び出し側（nostrudel）に任されている。

- **welshman**（coracle-social）: `@welshman/router` の `Router` クラスが `ForUser()`（read）/ `FromUser()`（write）/ `ForPubkey()` / `FromPubkey()` を揃えており、purpose-built な outbox ライブラリと言える。coracle の通知取得はこれを素直に使っている（上記）。

---

## 4. (c) 「自分の write リレーを読んで通知を拾う」の実在

**確認できた範囲では無い。**

3 節で relay 選択ロジックの中身まで確認できた 4 クライアント（nostrudel・coracle/welshman・Amethyst・Snort）は、全て「自分の read/inbox リレー」を通知の購読先にしていた。「自分の write リレーを読む」という設計を採用している実装は、調査した範囲では 1 つも見つからなかった。

NIP 側にもこの設計を示唆する規定は無い（2 節）。NIP-65 の write リレーの定義は「そのユーザーが書いたものを他人が読みに行く場所」であり、通知（他人が自分について書いたもの）を拾う場所としての規定は無い。ユーザーの見立てにあった「自分への通知を書く人は自分の write リレーを read しているはず」という推論は、**「NIP-65 準拠のクライアントは publish 時に `#p` で指した相手の read リレーへ送る」という規定（2 節）と両立しない前提**——read リレーへ届く設計になっているものを、あえて write リレー側で待ち受ける理由がクライアント側に無い。

---

## 5. 確認できなかったこと

- **Primal** が通知取得に何を使っているか。独自の caching relay/バックエンドを持つとされるが、そのソースコードで relay 選択ロジックを確認できなかった。
- **Nostur** の通知専用 relay 選択ロジックの所在。`OutboxLoader.swift` はフォロー中著者の write リレー先読み用であり、通知専用ではない。`getInboxRelays(forPubkey:)` は未使用に見えるコードで、実際に通知へ使われているか確認できなかった。
- **Damus** の relay プールが read/write のどちらかに絞られているか。単一プールへ自分の NIP-65 全体（read+write）を反映しているところまでは確認できたが、通知フィルタが実際にどちらのマークのリレーから応答を得ているかは、`RelayPool`/`SubscriptionManager` のさらに奥（個々の relay への配信ロジック）まで追わないと確定できない。
- **zap request の `relays` タグに受け手の read リレーを含める実装がどれくらい一般的か。** NIP-57 はこれを規定していない（2 節）ので、クライアントごとの慣習を個別に見る必要があるが、今回は時間の都合で確認していない。
