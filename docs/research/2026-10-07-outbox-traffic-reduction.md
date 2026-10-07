# Outbox クライアントがリレーとの通信を減らす手口と、Streets が取り入れる順序

調査日: 2026-10-07。Outbox モデルを採る Nostr クライアント・ライブラリが、リレーとの通信量・REQ 数・接続数・重複受信をどう減らしているかを、ソースコードと NIP で確かめた。Streets の現状と比べ、取り入れる価値の高い順に並べる。

**範囲。** 読んだのは Coracle / welshman、Gossip、Amethyst、noStrudel / applesauce、NDK、Snort、Nostur、nostter（と、nostter が使う rx-nostr）、Primal。一次情報は各リポジトリの `--depth 1` clone（版は 0 節）、[NIPs](https://github.com/nostr-protocol/nips/tree/a79e21d90fce5465b50ef385dd368bba99ec4a0b)、strfry のソースと設定、リレーの NIP-11 と WebSocket への実測に限る。ブログや解説記事の主張は使っていない。確かめられなかったことは「未確認」と書く。

**重複を避ける。** どのリレーを選ぶか・接続予算は [NIP-65 のリレー選択](./2026-08-01-nip65-relay-selection.md) と [Outbox の接続数と 30 接続予算](./2026-08-01-outbox-connection-budget.md) にある。ここでは選んだ後の、REQ の出し方・閉じ方・取り直し方だけを扱う。再接続は [ADR-0021](../adr/0021-reconnection-policy.md)、購読の集約は [ADR-0023](../adr/0023-centralized-subscription-manager.md)。

## 結論

- 通信量を減らすために広く使われている手口は 3 つある。**(a) 一定時間 REQ をためて 1 本にまとめる**（調査した全クライアントが持つ）、**(b) 使い終わった接続を 10〜60 秒残す**（welshman・NDK・applesauce・rx-nostr・Snort・Nostur・Gossip）、**(c) 取得済みの分をキャッシュや `since` で省く**（Amethyst・Gossip・welshman・Nostur）。Streets は (a) を 200ms 窓で持つが、(b) を持たず、(c) は再接続では使っていない。
- NIP-11 の `max_subscriptions` を購読の出し方に反映しているのは **Snort と rx-nostr（nostter 経由）の 2 つだけ**。どちらも上限に達した REQ を順番待ちにし、EOSE か CLOSED で枠が空いたら送る。Amethyst は NOTICE の文面から上限を学習する方式を持つ（ただし生成しているのは CLI だけ）。ほかは NIP-11 の値を購読の出し方に使わない。
- strfry は上限を超えた REQ を**登録せず、NOTICE（`ERROR: too many concurrent REQs`）を返すだけ**で、CLOSED は返さない。Streets の実測（NOTICE 10 回・CLOSED 0）と合う。つまり送った REQ は黙って捨てられており、反応の数やステータスが画面に出ない原因になりうる。
- 反応の数を NIP-45 の COUNT で取る案は、**一覧では使えない**。COUNT は複数の `#e` を渡しても 1 つの合計しか返さず（NIP-45 本文）、ノートごとに数えるなら REQ 1 本にまとめる今の方式より本数が増える。COUNT の実装を持つ Amethyst も、使っているのは投票の集計だけ。
- 実測（2026-10-07）で、`since = 手元の created_at + 1` を付けた kind:3 の取り直しは、4 つのリレーすべてで 0 件を返した。kind:3 のような大きい置換可能イベントの取り直しは、イベントが変わっていなければほぼ 0 バイトにできる。

## 0. 方法と読んだ版

| 対象 | 版（commit） | 備考 |
| --- | --- | --- |
| welshman（coracle-social） | `1ff83629e31f16aa68b151f4e6032bf80321a2e5` | `packages/net`、`packages/app` |
| Gossip（mikedilger） | `c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094` | Rust。`gossip-lib/src/minion` |
| Amethyst（vitorpamplona） | `de53ffa402e884c5aecbc81b239e146d484145a3` | `quartz`（ライブラリ）と `commons`、`cli` |
| applesauce（hzrd149） | `c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0` | `relay`、`loaders` |
| noStrudel（hzrd149） | `38f0eb9f6d9b4212910fecdff445f7a1a16e3349` | applesauce の利用側 |
| NDK（nostr-dev-kit） | `4b86acd13fe3c1284fddcb81a7f0d63e491db64a` | `core`、`sync` |
| Snort（v0l） | `9500e62fa5241caac9c9787879d2e7a6cc62a6a8` | `packages/system` |
| Nostur（nostur-com） | `ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e` | Swift。`Nostur/Relays/Network` |
| nostter（SnowCait） | `c5f7912b1fcfd374a285110a1780c59c5f0d4a12` | `rx-nostr` を使う |
| rx-nostr（penpenpng） | `7b9d1fd212d5fcfc20f0baae43e739a610dce453` | nostter の下層 |
| Primal（PrimalHQ） | `c96ee211043c6fee8a8b7c431746aab06392f765` | web アプリ。サーバー側は未公開（未確認） |
| strfry（hoytech） | `4cd3cf64850caf47dda46c2a2abbbf3525a64d10` | nos.lol・damus・yabu.me・wirednet が名乗る実装 |

リンクは commit 固定の permalink。行番号は読んだ版のもの。

Streets 側の実測値は、与えられた 2026-10-07 の計測（nos.lol の同時購読の最大 30・NOTICE 10 回、接続 6 回ずつ、重複 76% / 94%、yabu.me の kind:3 など）をそのまま使う。加えてこの調査で、次の 2 つを自分で測った（スクリプトは作業用ディレクトリのもので、リポジトリには入れていない）。

- **NIP-11・COUNT・圧縮の確認。** リレーへ NIP-11 を取り、`Sec-WebSocket-Extensions: permessage-deflate` を付けた WebSocket の握手と COUNT を送った（1 節・5 節・7 節）。
- **`since` を使った取り直しの確認。** kind:3 を 1 件取り、同じ著者へ `since = created_at + 1` と `since = created_at` を送った（4 節）。

## 1. 購読の上限と、REQ のまとめ方

### 規格と、リレー側の挙動

- NIP-11 の `max_subscriptions` は「1 本の接続で同時に開ける購読の数」（[11.md L123](https://github.com/nostr-protocol/nips/blob/a79e21d90fce5465b50ef385dd368bba99ec4a0b/11.md#L123)）、`max_limit` は「フィルタの `limit` をこの数へ切り詰める」（[L129](https://github.com/nostr-protocol/nips/blob/a79e21d90fce5465b50ef385dd368bba99ec4a0b/11.md#L129)）、`max_message_length` は 1 メッセージの最大バイト数（[L117](https://github.com/nostr-protocol/nips/blob/a79e21d90fce5465b50ef385dd368bba99ec4a0b/11.md#L117)）。
- NIP-01 は NOTICE の扱いを定めていない（[01.md L163](https://github.com/nostr-protocol/nips/blob/a79e21d90fce5465b50ef385dd368bba99ec4a0b/01.md#L163)）。CLOSED は機械可読の接頭辞（`rate-limited`・`error` など）を付けるが（[L182](https://github.com/nostr-protocol/nips/blob/a79e21d90fce5465b50ef385dd368bba99ec4a0b/01.md#L182)）、「購読数の超過」に当たる接頭辞は定められていない。
- **strfry は、上限を超えた REQ を捨てて NOTICE だけ返す。** `addSub` が `maxSubsPerConnection` 以上なら `false` を返し（[QueryScheduler.h L31](https://github.com/hoytech/strfry/blob/4cd3cf64850caf47dda46c2a2abbbf3525a64d10/src/QueryScheduler.h#L31)）、呼び出し側は `sendNoticeError("too many concurrent REQs")` を送るだけで購読を作らない（[RelayReqWorker.cpp L57](https://github.com/hoytech/strfry/blob/4cd3cf64850caf47dda46c2a2abbbf3525a64d10/src/apps/relay/RelayReqWorker.cpp#L57)）。CLOSED も EOSE も来ない。既定は 200（[strfry.conf L126](https://github.com/hoytech/strfry/blob/4cd3cf64850caf47dda46c2a2abbbf3525a64d10/strfry.conf#L126)）で、運営者が下げている。
- 同じ購読 ID で REQ を送り直すと、古い購読が置き換わる（[01.md L137](https://github.com/nostr-protocol/nips/blob/a79e21d90fce5465b50ef385dd368bba99ec4a0b/01.md#L137)）。
- 実測した NIP-11（2026-10-07）は次のとおり。

  | リレー | ソフトウェア | max_subscriptions | max_limit | max_message_length |
  | --- | --- | --- | --- | --- |
  | nos.lol | strfry 1.1.3 | 20 | 500 | 131072 |
  | relay.damus.io | strfry 1.1.0 系 | 200 | 500 | 1000000 |
  | yabu.me / directory.yabu.me | strfry 1.0.4 | 50 | 500 | 1310720 |
  | relay-jp.nostr.wirednet.jp | strfry 1.0.4 系 | 8 | 200 | 131072 |
  | purplepag.es | purplepag.es 0.2.0 | 50 | 500 | 書いていない |

  nos.lol の 20 は Streets の実測（最大 30・NOTICE 10 回）と、wirednet の 8 は「最大 8 ちょうど」と整合する。

### 各クライアントのやり方

**NIP-11 の上限で順番待ちにするもの**

- **Snort** は `max_subscriptions`（NIP-11 が取れるまでは 20）を `Connection.maxSubscriptions` に持つ（[connection.ts L422](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/connection.ts#L422)）。`sendTrace` は開いている購読数が上限に達していたら送らず、`#pendingTraces` に積む（[query-manager.ts L636](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/query-manager.ts#L636)）。EOSE と CLOSED のたびに `#retryPendingTraces` で、空いた分を送る（[L595-L619](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/query-manager.ts#L595-L619)、[L785-L801](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/query-manager.ts#L785-L801)）。送れない 1 本に当たったらそこで打ち切る。NIP-11 は WebSocket の握手と並行して取り、取れるまでは既定値で動く（[connection.ts L110-L113](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/connection.ts#L110-L113)）。
- **rx-nostr**（nostter が使う）は、リレーごとの購読を `ongoings` と `queuings` に分け、容量を NIP-11 の `max_subscriptions` から引く（無ければ無制限）。空きができるたびに `shift()` で順番待ちの先頭を有効にする（[subscribe.ts L258-L283](https://github.com/penpenpng/rx-nostr/blob/7b9d1fd212d5fcfc20f0baae43e739a610dce453/packages/rx-nostr/src/connection/subscribe.ts#L258-L283)）。**nostter は NIP-11 が取れないリレー向けに、既定値を `max_subscriptions: 20` と置いている**（[client.ts L10](https://github.com/SnowCait/nostter/blob/c5f7912b1fcfd374a285110a1780c59c5f0d4a12/web/src/lib/nostr/relay/client.ts#L10)）。

**NOTICE / CLOSED の文面から学習するもの**

- **Amethyst** の `AdaptiveRelayLimiter` は、購読数の上限と 1 秒あたりの REQ 数の上限を別の問題として扱う。購読数の上限に当たったら同時購読数を 100 → 20 → 10 と下げ、レート制限に当たったら REQ の間隔を 250ms → 500ms → 1s → 2s と広げる。判定は NOTICE と CLOSED の文面の部分一致で、購読数の側には `too many concurrent`・`maximum concurrent subscription` など 10 通りがある（[AdaptiveRelayLimiter.kt L71-L72](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/quartz/src/commonMain/kotlin/com/vitorpamplona/quartz/nip01Core/relay/client/accessories/AdaptiveRelayLimiter.kt#L71-L72)、[L255-L287](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/quartz/src/commonMain/kotlin/com/vitorpamplona/quartz/nip01Core/relay/client/accessories/AdaptiveRelayLimiter.kt#L255-L287)）。`too many concurrent` は strfry の文面と一致する。**ただしこのクラスを生成しているのは `cli` だけで**（[cli Context.kt L234](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/cli/src/main/kotlin/com/vitorpamplona/amethyst/cli/Context.kt#L234)）、Android アプリ本体と `commons` からの参照は grep で見つからなかった。
- 同じ Amethyst の `RelayReqRefusals` は、アプリが使う `PoolRequests` が持つ。CLOSED と NOTICE の文面から「検索専用リレー」「読み取り不可リレー」を 2 回の拒否で見分け、そのリレーを読み取り先から外す（接続ごと閉じる）。`REQ contains 12 filters, maximum is 10` のような文面からは 1 REQ あたりのフィルタ数の上限も学ぶ（[RelayReqRefusals.kt L63](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/quartz/src/commonMain/kotlin/com/vitorpamplona/quartz/nip01Core/relay/client/pool/RelayReqRefusals.kt#L63)、[L250](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/quartz/src/commonMain/kotlin/com/vitorpamplona/quartz/nip01Core/relay/client/pool/RelayReqRefusals.kt#L250)）。
- **Gossip** は CLOSED の `rate-limited:` 接頭辞だけを見て、その購読を 4 秒ごとの tick で再送する（[handle_websocket.rs L282](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/minion/handle_websocket.rs#L282)、[mod.rs L813](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/minion/mod.rs#L813)）。NOTICE はログに出すだけ（[handle_websocket.rs L95](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/minion/handle_websocket.rs#L95)）。NIP-11 の `limitation` は読まない（grep で参照なし）。
- **welshman** は CLOSED を受けたとき、「再試行しても変わらない理由」（`auth-required`・`blocked`・`invalid`・`mute`・`pow` ほか）なら終える（[message.ts L79](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/message.ts#L79)）。それ以外は、呼び出し側が `resubscribeAttempts` を指定したときだけ、`2^n` 秒待って、拒否された時刻からの `since` を付けて張り直す（[request.ts L89-L127](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/request.ts#L89-L127)）。NIP-11 の値は `net` では読まない。送信は 1 接続あたり 100ms ごとに 5 通までに絞る（[socket.ts L37-L38](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/socket.ts#L37-L38)）。
- **applesauce** は `limitations$` と `getLimitations()` で NIP-11 の値を公開するが（[relay.ts L1627-L1629](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/relay/src/relay.ts#L1627-L1629)）、購読の出し方には使っていない。noStrudel は NIP-11 の値を画面に出すだけ（[about.tsx L200](https://github.com/hzrd149/nostrudel/blob/38f0eb9f6d9b4212910fecdff445f7a1a16e3349/src/views/relays/relay/tabs/about.tsx#L200)）。CLOSED は接頭辞ごとの型付きエラーにする（[relay.ts L162](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/relay/src/relay.ts#L162)）。
- **NDK** は NIP-11 の型に `max_subscriptions` を持つが（[nip11.ts L20](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/nip11.ts#L20)）、スケジューリングでは使わない。NOTICE は `notice` イベントを出すだけで、メソッドの doc コメントは「切断して再接続する」と書くが、実装は emit のみ（[connectivity.ts L656-L658](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/connectivity.ts#L656-L658)）。
- Nostur は `max_subscriptions` を扱う箇所が見つからなかった（grep で参照なし）。

### REQ のまとめ方（バッチング）

| クライアント | まとめる窓 | まとめ方 |
| --- | --- | --- |
| welshman | 50ms（`Network.load`）[network.ts L25](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/app/src/plugins/network.ts#L25) | リレーごとに、同じ形のフィルタの `authors`・`#e` などを 1 本に統合する（`unionFilters`）[request.ts L322-L397](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/request.ts#L322-L397)、[Filters.ts L91](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/util/src/Filters.ts#L91)。リレーの半数が閉じたら返す（`threshold: 0.5`） |
| applesauce / noStrudel | 既定 1000ms・200 件（address / tag-value ローダー）[address-loader.ts L162-L167](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/loaders/src/loaders/address-loader.ts#L162-L167)。noStrudel はプロフィール 200ms、そのほか 500ms [loaders.ts L22-L54](https://github.com/hzrd149/nostrudel/blob/38f0eb9f6d9b4212910fecdff445f7a1a16e3349/src/services/loaders.ts#L22-L54) | 住所・id・タグ値をまとめて 1 REQ。反応は `#e` を束ねる [reactions-loader.ts L17](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/loaders/src/loaders/reactions-loader.ts#L17) |
| nostter | 1000ms・最大 10 件（プロフィール・参照）[MainTimeline.ts L284](https://github.com/SnowCait/nostter/blob/c5f7912b1fcfd374a285110a1780c59c5f0d4a12/web/src/lib/timelines/MainTimeline.ts#L284) | rx-nostr の `batch()` でフィルタを統合 |
| Amethyst | 500ms（`BaseEoseManager`）[BaseEoseManager.kt L34](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/relayClient/eoseManagers/BaseEoseManager.kt#L34) | 種類ごとに「いま画面にあるノートの id すべて」を 1 購読にする。反応は `ReactionsFilterAssembler`、プロフィールは `MetadataFilterAssembler`（`limit` は著者数）[ReactionsFilterAssembler.kt L51](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/relayClient/assemblers/ReactionsFilterAssembler.kt#L51)、[MetadataFilterAssembler.kt L53](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/relayClient/assemblers/MetadataFilterAssembler.kt#L53) |
| NDK | 既定 10ms（`at-most`）、プロフィールは 25ms [subscription/index.ts L274](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/subscription/index.ts#L274)、[user/index.ts L255](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/user/index.ts#L255) | 同じ形のフィルタを指紋で束ね、`limit` 付きは連結する。`limit` 付きが 10 本たまったら即時に送る [grouping.ts L21-L48](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/subscription/grouping.ts#L21-L48)、[relay/subscription.ts L236](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/subscription.ts#L236) |
| Snort | 窓ではなく、クエリの集合が変わるたびに最適化 | 近いフィルタを統合し（`mergeSimilar`）、差分だけ新しい REQ にする（`diffFilters`）[request-merger.ts L12](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/query-optimizer/request-merger.ts#L12)、[request-splitter.ts L4](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/query-optimizer/request-splitter.ts#L4) |
| Gossip | 4 秒の tick | 探している id を tick ごとにまとめて 1 REQ。プロフィールは 1 リレーにつき同時に 1 本だけ走らせ、待っている要求を合算する [minion/mod.rs L672](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/minion/mod.rs#L672)、[L766](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/minion/mod.rs#L766) |
| Nostur | 列ごとに時間をずらす | 複数の列が同時に REQ しないよう、列を 1 秒刻み（Mac の起動時は 0.25 秒刻み）で順に動かす。全列が 1 巡する間隔は 9 秒を列数で割る [FeedFetchScheduler.swift L23](https://github.com/nostur-com/nostur-ios-public/blob/ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e/Nostur/FeedFetchScheduler.swift#L23)、[NXColumnViewModel.swift L5787](https://github.com/nostur-com/nostur-ios-public/blob/ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e/Nostur/Columns/NXColumnViewModel.swift#L5787) |

窓の長さは 10ms〜1s と幅がある。画面のスクロールでまとめるのが目的なら、Amethyst・nostter・applesauce の 500〜1000ms 側が近い。

Nostur の outbox 側は、kind:10002 を **150 著者ずつ、1 REQ が終わってから次へ**取る（[OutboxLoader.swift L14](https://github.com/nostur-com/nostur-ios-public/blob/ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e/Nostur/Relays/Network/OutboxLoader.swift#L14)、[L268-L320](https://github.com/nostur-com/nostur-ios-public/blob/ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e/Nostur/Relays/Network/OutboxLoader.swift#L268-L320)）。1 本の REQ の大きさを抑えるのが目的と読めるが、コメントに理由はない（推測）。

### Streets の現状

- **NIP-11 の上限を購読に使っていない。** `parseRelayInfo` は `max_subscriptions`・`max_limit`・`max_message_length` を読むが（[relay-info.ts L20-L24](../../packages/core/src/relay/relay-info.ts#L20-L24)）、参照しているのは DevTools の Relays パネルだけ（`apps/web/src/devtools/RelayTrafficPanel.tsx`）。`ConnectionPool.subscribe` は上限を見ずに REQ を送る（[connection-pool.ts L397-L430](../../packages/core/src/read/connection-pool.ts#L397-L430)）。順番待ちの機構はない。
- **NOTICE は記録するだけ。** `WebSocketRelayConnection` は NOTICE を `traffic?.notice` に渡して終わり（[websocket-relay-connection.ts L378-L382](../../packages/core/src/relay/websocket-relay-connection.ts#L378-L382)）、`RelayTraffic` は最新 5 件を持つ（[relay-traffic.ts L71](../../packages/core/src/relay/relay-traffic.ts#L71)）。CLOSED は `auth-required` なら認証して 1 回だけ張り直し、そのほかは `onClosed` に渡す（[L303-L330](../../packages/core/src/relay/websocket-relay-connection.ts#L303-L330)）。strfry の上限超過は CLOSED が来ないので、この経路には乗らない。
- **まとめる窓は 200ms で、種類ごとに別の REQ になる。** 反応の数（`kinds:[1,6,7]` の `#e`、[engagement-requests.ts L34](../../packages/core/src/read/engagement-requests.ts#L34)・[L67](../../packages/core/src/read/engagement-requests.ts#L67)）、プロフィール（kind:0、[profile-requests.ts L48](../../packages/core/src/read/profile-requests.ts#L48)・[L86](../../packages/core/src/read/profile-requests.ts#L86)）、住所で指す投稿（kind:30315 を含む、[address-requests.ts L33](../../packages/core/src/read/address-requests.ts#L33)）がそれぞれ別の窓と別の `fetchOnce` を持つ。実測の nos.lol で 5 分に反応 80 回・ステータス 31 回・kind:0 を 1 人ずつ 24 回、計 135 本は、窓が短いうえに種類ごとに別 REQ だからと読める（推測。窓ごとの件数分布は未計測）。
- **フィルタの差し替えで一瞬だけ購読が増える。** 担当著者が変わったときは「新しい購読を先に開いてから古い方を閉じる」（[subscription-manager.ts L913-L922](../../packages/core/src/read/subscription-manager.ts#L913-L922)）。購読 ID は `s{連番}` で毎回別（[websocket-relay-connection.ts L139](../../packages/core/src/relay/websocket-relay-connection.ts#L139)）なので、その間は同じリレーに 2 本ある。nos.lol で最大 30 になった要因の 1 つかもしれないが、寄与は未計測。

## 2. 接続を閉じるまでの猶予と、再接続のバックオフ

### 各クライアントのやり方

**使い終わった接続を残す時間**

| クライアント | 猶予 | 何から数えるか |
| --- | --- | --- |
| welshman | 30 秒（3 秒ごとに確認）| 未完了の購読が 0 本で、最後の送受信から 30 秒。送ると自動で再接続する（直近 5 秒以内に失敗していなければ）[policy.ts L136](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/policy.ts#L136)、[L254](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/policy.ts#L254) |
| applesauce | 既定 30 秒 | 最後の購読者が抜けてから。その時間内に購読し直すと、同じ監視器に合流する [relay.ts L378](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/relay/src/relay.ts#L378)、[L703](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/relay/src/relay.ts#L703) |
| noStrudel | プールは 60 秒、ローカルのキャッシュ用リレーは 5 分 | [pool.ts L10](https://github.com/hzrd149/nostrudel/blob/38f0eb9f6d9b4212910fecdff445f7a1a16e3349/src/services/pool.ts#L10)、[local-relay.ts L9](https://github.com/hzrd149/nostrudel/blob/38f0eb9f6d9b4212910fecdff445f7a1a16e3349/src/services/event-cache/local-relay.ts#L9) |
| rx-nostr | 既定 10 秒（`lazy`）。nostter は `lazy-keep`（既定リレーは閉じない）| 通信が止まってから。タイマーは通信のたびに張り直す [config.ts L17](https://github.com/penpenpng/rx-nostr/blob/7b9d1fd212d5fcfc20f0baae43e739a610dce453/packages/rx-nostr/src/config/config.ts#L17)、[connection.ts L100-L117](https://github.com/penpenpng/rx-nostr/blob/7b9d1fd212d5fcfc20f0baae43e739a610dce453/packages/rx-nostr/src/connection/connection.ts#L100-L117) |
| Snort | 10 秒（5 秒ごとに確認）| 「一時的な接続」だけ。最後の送受信から 10 秒で、使用中の購読が 0 本なら閉じる [connection.ts L548](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/connection.ts#L548) |
| NDK | 30 秒 | 一時リレー（`useTemporaryRelay`）が使われるたびにタイマーを張り直し、30 秒使われなければプールから外す。明示リレーは外さない [relay/pool/index.ts L115-L143](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/pool/index.ts#L115-L143) |
| Nostur | 35 秒 | 一時接続を作ってから 35 秒後に外す（使われ続けても延びない）[ConnectionPool.swift L855](https://github.com/nostur-com/nostur-ios-public/blob/ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e/Nostur/Relays/Network/ConnectionPool.swift#L855) |
| Gossip | 10 秒 | 購読が 0 本になってから 10 秒たつと、接続を担う処理ごと終わる（コメントは 30 秒と書くが値は 10 秒）[minion/mod.rs L520](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/minion/mod.rs#L520) |
| Amethyst | 自動では閉じない（接続を落とす経路は、読み取り先から外れたリレーを落とす処理と `disconnect()` だけ見つかった）| |

猶予は 10〜60 秒に収まる。Streets の実測（接続 6 回ずつ）は、購読が 0 本になった瞬間に閉じていることが原因（#994）で、調べた実装に猶予 0 秒のものはない。

**再接続のバックオフ**

| クライアント | 式 | 上限 | リセット・特記 |
| --- | --- | --- | --- |
| Amethyst | 1 秒から倍々 | 未確認 | **60 秒つながり続けたあとの切断でだけ**リセットする。握手して即切るリレーが速い周期で再接続し続けるのを避ける [BasicRelayClient.kt L75-L81](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/quartz/src/commonMain/kotlin/com/vitorpamplona/quartz/nip01Core/relay/single/basic/BasicRelayClient.kt#L75-L81) |
| NDK | 1 秒から倍々。アイドル後は 0・1・2・5・10・30 秒 | 30 秒 | 切断の間隔のばらつきが小さいと「フラッピング」とみなして再接続をやめる [connectivity.ts L634-L693](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/connectivity.ts#L634-L693) |
| applesauce | `1.5^n` 秒 | 5 分 | [relay.ts L1650-L1659](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/relay/src/relay.ts#L1650-L1659)。別に `RelayLiveness` が、失敗回数で offline（30 秒から倍々、最大 5 分）→ 5 回で dead にし、端末に保存する [liveness.ts L108-L110](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/relay/src/liveness.ts#L108-L110)。noStrudel は基準を 5 秒にして localforage に残す [pool.ts L14](https://github.com/hzrd149/nostrudel/blob/38f0eb9f6d9b4212910fecdff445f7a1a16e3349/src/services/pool.ts#L14) |
| rx-nostr | 指数 + ジッタ、最大 5 回 | 回数で打ち切り | `polite: true`（nostter）は、最初から応答しないリレーには再試行しない [relay.ts L192](https://github.com/penpenpng/rx-nostr/blob/7b9d1fd212d5fcfc20f0baae43e739a610dce453/packages/rx-nostr/src/connection/relay.ts#L192) |
| Snort | 2 秒から倍々 | 未確認 | 開けたら 2 秒へ戻す [connection.ts L203](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/connection.ts#L203)、[const.ts L4](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/const.ts#L4) |
| welshman | 切れてから最低 5 秒空ける | | 5 秒以内の失敗後は、送信時の自動再接続もしない [policy.ts L198](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/policy.ts#L198) |

### Streets の現状

- **使い終わった接続は即座に閉じる。** `close()` で最後の購読が抜け、`holds` も 0 なら `#drop(url)`（[connection-pool.ts L486-L493](../../packages/core/src/read/connection-pool.ts#L486-L493)）。猶予の機構はなく、接続を開くたびに TLS と NIP-42 の認証がやり直しになる。Issue #994 の直し方（購読が 0 本でも数十秒開けておく・使っていない接続から先に閉じる）は、他実装の猶予と同じ形。
- **バックオフは 1 秒から倍々、上限 60 秒、ジッタ付き**（[connection-pool.ts L50-L52](../../packages/core/src/read/connection-pool.ts#L50-L52)、[L722](../../packages/core/src/read/connection-pool.ts#L722)）。4 回連続で失敗すると degraded とみなして選定から外す（`DEGRADED_AFTER_FAILURES`）。つながっている時間によるリセット（Amethyst 方式）はなく、開けた時点で失敗履歴を消す。

## 3. 同じフィルタを複数リレーへ送る重複の抑え方

### 各クライアントのやり方

- **著者ごとの冗長度。** NDK は `relayGoalPerAuthor` 既定 2（[sets/calculate.ts L118](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/sets/calculate.ts#L118)）、Gossip は `num_relays_per_person` 既定 2、`max_relays` 既定 50（[storage/mod.rs L692-L693](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/storage/mod.rs#L692-L693)）、noStrudel は `DEFAULT_MAX_CONNECTIONS` 20・`DEFAULT_MAX_RELAYS_PER_USER` 5（[const.ts L32-L35](https://github.com/hzrd149/nostrudel/blob/38f0eb9f6d9b4212910fecdff445f7a1a16e3349/src/const.ts#L32-L35)）。Amethyst の「フォロー中」フィードの読み込み部（`OutboxRelayLoader`）は、著者の write リレーを全部展開していて、冗長度の上限も接続数の予算もここにはない（[OutboxRelayLoader.kt L56](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/model/topNavFeeds/OutboxRelayLoader.kt#L56)）。ほかの場所に上限があるかは未確認。選び方の詳細は前の調査に任せる。
- **探しものは段階を踏み、見つかった分を次の段から外す。** applesauce の `createAddressLoader` は、(1) ローカルキャッシュ → (2) ポインタのリレーヒント → (3) 常に引く追加リレー → (4) 探索用リレー（lookup）の順に引き、前の段で見つかったアドレスは次の段の要求から外す（[address-loader.ts L170-L190](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/loaders/src/loaders/address-loader.ts#L170-L190)。絞り込みは同ファイルの `addressPointerLoadingSequence`）。noStrudel はプロフィールと kind:10002 を専用ローダーに通し、探索用リレーを最後の段に置く（[loaders.ts L30-L34](https://github.com/hzrd149/nostrudel/blob/38f0eb9f6d9b4212910fecdff445f7a1a16e3349/src/services/loaders.ts#L30-L34)）。
- **反応は「そのイベントを受け取ったリレー」へ。** applesauce の `createReactionsLoader` は、呼び出し側の `relays` に、そのイベントの seen-on（`getSeenRelays`）を足して引く（[reactions-loader.ts L17-L35](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/loaders/src/loaders/reactions-loader.ts#L17-L35)）。既定のリレーへ一律に投げるのではない。
- **半数が応答したら打ち切る。** welshman の `load` は `threshold: 0.5`（[request.ts L267](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/request.ts#L267)、[L438](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/request.ts#L438)）で、遅いリレーを待たない。
- **同じイベントを何度も処理しない。** welshman は `Tracker` が「どのリレーから見たか」を記録し、すでに見たものは `onDuplicate` に回して捨てる（[request.ts L152-L156](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/request.ts#L152-L156)）。Gossip は受け取ったイベントごとに seen-on を保存する（[process/mod.rs L66-L80](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/process/mod.rs#L66-L80)）。どちらも受信後の処理を省くもので、**回線を流れるバイトは減らない**。
- **EOSE の後・再接続のときの `since`。**
  - Amethyst は購読ごとに「リレーごとの最後の EOSE の時刻」を持ち、次の REQ に `since` として付ける（[ReactionsFilterAssembler.kt L85](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/relayClient/assemblers/ReactionsFilterAssembler.kt#L85)、[SingleSubEoseManager.kt L49](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/relayClient/eoseManagers/SingleSubEoseManager.kt#L49)）。**著者の集合が増えたら、そのリレーの EOSE を捨てて頭から取り直す**（新しく加わった著者が、先にいた著者の `since` を引き継いで古い投稿を取り損ねるため）（[MergedAuthorTracker.kt L42](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/relayClient/eoseManagers/MergedAuthorTracker.kt#L42)）。
  - welshman は、ソケットが閉じて開き直るとき、未完了の REQ すべてに「最後に受信した時刻」からの `since` を付けて送り直す（[policy.ts L198-L206](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/policy.ts#L198-L206)、[util.ts L13](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/net/src/util.ts#L13)）。
  - Gossip は、購読を差し替えるとき「相手が自分の都合で切ったのだから」として、その時刻を EOSE とみなして続きから取る（[minion/mod.rs L843](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/minion/mod.rs#L843)）。フィードの新着側は、持っている最新の投稿の時刻以降（`FeedRange::After`）で張る（[filter_set.rs L215](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/filter_set.rs#L215)）。
  - Snort は、切れたあとにストリーミング購読を張り直す（[query-manager.ts L161](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/query-manager.ts#L161)）が、`since` を付けるかは未確認。
  - Nostur は、列を開き直したとき「画面にある最新のノートの 5 分前」から取る（[NXColumnViewModel.swift L2803](https://github.com/nostur-com/nostur-ios-public/blob/ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e/Nostur/Columns/NXColumnViewModel.swift#L2803)）。

### Streets の現状

- 既定の 3 本（`FALLBACK_RELAYS`＝yabu.me・nos.lol・damus、[default-relays.ts L15](../../packages/core/src/read/default-relays.ts#L15)）へ、**同じフィルタをそろって送っている。** `fetchOnce` はリレーを指定しなければ `#defaultRelays()` 全部へ送り（[subscription-manager.ts L520-L545](../../packages/core/src/read/subscription-manager.ts#L520-L545)）、反応の数・プロフィール・住所で指す投稿はどれも指定しない。受信の 76%（damus）・94%（nos.lol）が重複という PR #960 の観察は、この経路が主な理由と読める。
- 段階を踏む取得（1 本に聞いて、見つからなかった分だけ次へ）はない。`collect` は全リレーの EOSE かソフト期限（2 秒、`FETCH_ONCE_SOFT_TIMEOUT_MS`）まで待つ。
- seen-on は `EventStore` に記録しているが、読み取りには使っていない。参照は返信・リポストのヒントに足す `apps/web/src/actions.tsx` だけ（[seen-relays.ts L9](../../packages/core/src/read/seen-relays.ts#L9)）。
- 冗長度は 2（`RELAY_REDUNDANCY`、[default-relays.ts L31](../../packages/core/src/read/default-relays.ts#L31)）で、各著者の write リレーへ分ける購読では、リレーごとに違う `authors` を送る。
- `since` を付けるのは、一時停止からの復帰（`pause()` / `resume()`、[subscription-manager.ts L324-L345](../../packages/core/src/read/subscription-manager.ts#L324-L345)、[L897-L909](../../packages/core/src/read/subscription-manager.ts#L897-L909)）だけ。**再接続は元のフィルタを張り直す**（`since` で埋めると 500 件の上限を食いつぶすため、[connection-pool.ts L776](../../packages/core/src/read/connection-pool.ts#L776)）。各リレーの EOSE の時刻は持っていない。

## 4. ローカルキャッシュを使った取り直しの省略と、再取得の間隔

### 各クライアントのやり方

- **キャッシュを先に引き、足りない分だけリレーへ。** applesauce の address ローダーは、段 1 でキャッシュ、足りないポインタだけ後の段へ（3 節）。tag-value ローダー（反応・zap など）はキャッシュとリレーを**並行して**引く（[tag-value-loader.ts L118-L125](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/loaders/src/loaders/tag-value-loader.ts#L118-L125)）。NDK の既定は `CACHE_FIRST`（[subscription/index.ts L271](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/subscription/index.ts#L271)）。
- **置換可能イベントの再取得を間引く。**
  - welshman の `makeLoadItem` は、手元にあって取得から 1 時間（既定 3600 秒）以内なら取り直さない。取り直すときも、同じ取得元への再試行は `2^失敗回数` 秒空ける（[repository.ts L705-L745](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/store/src/repository.ts#L705-L745)）。
  - Gossip はプロフィール（kind:0）を `metadata_becomes_stale_minutes`（既定 20 分）以内なら取り直さず、取ろうとして届かなかった人も同じ時間は再試行しない（届かない人は何度聞いても変わらない、という理由がコメントにある）（[storage/mod.rs L790](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/storage/mod.rs#L790)、[people/mod.rs L205-L235](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/people/mod.rs#L205-L235)）。
  - NDK は NIP-11 を 24 時間キャッシュする（[relay/index.ts L369](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/index.ts#L369)）。
  - **Nostur は kind:10002 を 3 段階で更新する。** まだ持たない著者を先に取り（`OUTBOX-MISSING-`）、24 時間ごとに全員を取り直し（`OUTBOX-AUDIT-`）、それ以外の日は「前回の更新の 1 時間前」以降の分だけを取る（`OUTBOX-INCREMENTAL-`）。起動の 20 秒後に動き、150 著者ずつ（[OutboxLoader.swift L13-L32](https://github.com/nostur-com/nostur-ios-public/blob/ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e/Nostur/Relays/Network/OutboxLoader.swift#L13-L32)、[L198-L232](https://github.com/nostur-com/nostur-ios-public/blob/ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e/Nostur/Relays/Network/OutboxLoader.swift#L198-L232)）。
- **古い投稿の取得に上限を付ける。** Nostur は「再開時の取得は最大 24 時間前まで」（[NXColumnViewModel.swift L609](https://github.com/nostur-com/nostur-ios-public/blob/ba859d1db376e0b2e80daf3e94c9c3e1ccab0a2e/Nostur/Columns/NXColumnViewModel.swift#L609)）。Gossip は giftwrap を 30 日（[overlord.rs L3229](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/overlord.rs#L3229)）。
- kind:0 / kind:10002 の再取得間隔は、welshman 1 時間（両方）、Gossip 20 分（kind:0）、Nostur 24 時間（kind:10002 の全件）。Streets は 1 日（kind:0）・7 日（kind:10002）で、これらより長い。

### 実測: `since = created_at + 1` で取り直しを 0 件にできる

置換可能イベントは、手元の版の `created_at` に 1 足した値を `since` に付けて REQ すれば、リレーに新しい版がない限り何も返らない（NIP-01 は `since` を `created_at >= since` と定める、[01.md L143](https://github.com/nostr-protocol/nips/blob/a79e21d90fce5465b50ef385dd368bba99ec4a0b/01.md#L143)）。この使い方を明示している実装は今回の調査では見つからなかった（Nostur の `OUTBOX-INCREMENTAL-` は同じ考え方を、著者個別ではなく前回更新時刻の一括で行うもの）。そこで 2026-10-07 に 4 つのリレーで確かめた。kind:3 を `limit: 1` で 1 件取り、その著者へ `since = created_at + 1` と `since = created_at` を送った結果は次のとおり。

| リレー | `since = created_at + 1` | `since = created_at` | 取った kind:3 のバイト数 |
| --- | --- | --- | --- |
| nos.lol | 0 件 | 1 件 | 554 |
| relay.damus.io | 0 件 | 1 件 | 8760（タグ 116 個） |
| directory.yabu.me | 0 件 | 1 件 | 554 |
| purplepag.es | 0 件 | 1 件 | 554 |

4 つとも、`+1` なら 0 件、`+0` なら手元と同じ 1 件が返った。実際の取り直しで変化がなければ、kind:3 の転送は EOSE だけになる。変化があれば新しい版が 1 件返る。**ただし、リレーが古い版を保持し、別のリレーに新しい版がある場合の挙動は測っていない**（`since` は各リレーが持つ版にだけ効く）。測った kind:3 は小さいものが中心で、実測の yabu.me の 7 件（約 39KB ずつ）のような大きい kind:3 での確認ではない。

### Streets の現状

- キャッシュ方針は `cache-policy.ts` の表（[L39-L82](../../packages/core/src/read/cache-policy.ts#L39-L82)）。kind:0 は 1 日、kind:10002 は 7 日（コメントに「変更頻度を測っていない暫定値」）、kind:30315 は 10 分、**kind:3 は `staleMs: 0` かつ `serveWhileRevalidating: false`**。理由はコメントにあり、`SortedEvents` は追記専用で古いメンバーシップを取り除けないため、新しい版が届くまで手元の版を使わせないから。
- 端末に残すのは `retention` が `none` でないものだけ（`shouldPersist`、[event-persistence.ts L59](../../packages/core/src/read/event-persistence.ts#L59)）で、**いまは kind:0 と kind:10002 だけ**。kind:3 と投稿（kind:1 など）は残さないので、ページを読み込むたびに取り直す。
- ブートストラップは、フォローリストを 4 つのインデクサから取り（`limit: 1`）、その全員分の kind:10002 を 1 REQ（`authors` を分割せず）で取る。後者は鮮度が足りている著者を除く（[bootstrap.ts L100-L150](../../packages/core/src/read/bootstrap.ts#L100-L150)）。分割がないので、フォローが数千人になると `max_message_length` を超えうる（nos.lol は 131072 バイト。64 文字の pubkey 1 件が JSON で 67 バイトとして、約 1900 人が目安。超えたときのリレーの挙動は未確認）。
- `since` を使った取り直し（`created_at + 1`）は、どの kind にもない。実測の yabu.me の受信 482KB のうち 275KB が kind:3 の 7 件、という数字に対しては、**7 件が何の要求から来たのかを先に特定する必要がある**。候補は、起動ごとのブートストラップ（インデクサ 4 本に `limit: 1`）、`followListSource`（フォロー一覧カラム、[column-sources.ts L205](../../packages/core/src/deck/column-sources.ts#L205)）、`followersSource`（フォロワー一覧カラム。**`#p` の kind:3 を `limit` なしで取る**、[L307](../../packages/core/src/deck/column-sources.ts#L307)）。どれが 7 件かは未確認。

## 5. 反応数・リプライ数などの集計

### 各クライアントのやり方

- **NIP-45 COUNT。** 規格は `["COUNT", id, filters...]` に対し `{"count": n}` を返し、複数フィルタは OR で**単一の合計**にまとめる（[45.md](https://github.com/nostr-protocol/nips/blob/a79e21d90fce5465b50ef385dd368bba99ec4a0b/45.md)）。HyperLogLog（`hll`、256 バイトのレジスタを 16 進で 512 文字）を返すリレーなら、複数リレーの結果を併合して重複を除いた推計ができる。リレーが拒否するときは CLOSED を返す。
  - **Amethyst は COUNT の実装を持つが、使うのは投票の集計（`RelayPollResponseLoader`）だけ**で、複数リレーの数字は足すと二重に数えるので `mergeCountResults` で扱う（[RelayPollResponseLoader.kt L65](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/relayClient/polls/results/RelayPollResponseLoader.kt#L65)）。反応の数は kind:7 を `#e` で REQ して数える（上の `ReactionsFilterAssembler`）。
  - **applesauce も `count()` を持つ**（[relay.ts L1010](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/relay/src/relay.ts#L1010)）が、反応・zap のローダーは REQ で取る。NDK も `count` の送信を持つ（[connectivity.ts L854-L857](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/connectivity.ts#L854-L857)）が、集計にどう使うかは未確認。
  - welshman・Gossip・Snort・Nostur・nostter は、COUNT を送る箇所が見つからなかった（grep の範囲での判断）。
- **サーバー側で集計して返すもの。** Primal は、独自のキャッシュサーバーへ `{cache: ["feed", ...]}` や `thread_view` を REQ の形で送り、**本文のイベントとは別に、集計済みの統計イベント（kind 10000100、`likes`・`reposts`・`replies`・`zaps` など）が同じ応答に載る**（[constants.ts L142](https://github.com/PrimalHQ/primal-web-app/blob/c96ee211043c6fee8a8b7c431746aab06392f765/src/constants.ts#L142)、[primal.d.ts L660-L672](https://github.com/PrimalHQ/primal-web-app/blob/c96ee211043c6fee8a8b7c431746aab06392f765/src/types/primal.d.ts#L660-L672)、[megaFeeds.ts L1002-L1006](https://github.com/PrimalHQ/primal-web-app/blob/c96ee211043c6fee8a8b7c431746aab06392f765/src/megaFeeds.ts#L1002-L1006)）。この集計をどう作っているかは、サーバーが公開されていないので未確認。Nostr のリレーで読む構造ではない。
- **画面に入ったものだけ取る。** Amethyst の反応の購読は「いま画面にあるノートの id」だけを対象にする（`purposeDetail = "reactions on notes currently on screen"`、[ReactionsFilterAssembler.kt L78](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/relayClient/assemblers/ReactionsFilterAssembler.kt#L78)）。
- **実測（2026-10-07）。** `["COUNT", id, {"kinds":[7], "#e":[最新の投稿の id]}]` と `{"kinds":[3], "#p":[その著者]}` を送った。nos.lol・relay.damus.io・relay.primal.net は `{"count": n}` を返した（`hll`・`approximate` は付かず）。yabu.me は `NOTICE: ERROR: bad msg: unknown cmd` で、COUNT 自体を知らない（NIP-11 の `supported_nips` に 45 がないことと合う）。relay.nostr.band は応答がなかった。

  | リレー | COUNT | NIP-11 の `supported_nips` の 45 |
  | --- | --- | --- |
  | nos.lol | 答える（count のみ） | あり |
  | relay.damus.io | 答える（count のみ） | あり |
  | relay.primal.net | 答える（count のみ） | 未取得 |
  | yabu.me | `unknown cmd` | なし |
  | relay-jp.nostr.wirednet.jp | 未測定 | なし |

  測ったのは 1 回、新しい投稿 1 件だけ（反応は 0）。多数の反応が付いたノートでの応答時間や `hll` の有無は測っていない。

### Streets の現状

- 反応・リポスト・返信の数は、表示したノートの id を 200ms ためて、`{kinds:[1,6,7], "#e": ids}` を 1 REQ にして既定の 3 本へ送り、受け取ったイベントを数える（[engagement-requests.ts L60-L70](../../packages/core/src/read/engagement-requests.ts#L60-L70)）。一度要求した id は二度要求せず（`requested` を刈り込まない）、EOSE で閉じる。表示されたものだけを取る点は、Amethyst と同じ。
- COUNT は使っていない。**COUNT に置き換えると、一覧ではかえって増える。** COUNT は 1 つの合計しか返さないので、ノート N 件の反応を数えるには N 本（反応・リポスト・返信を分けるなら 3N 本）の COUNT が要る。今の「N 件を 1 REQ」より本数が増える。COUNT が strfry の同時購読の枠を使うかは未確認。個別のノートを開いたとき、あるいは大量の反応が付くノートだけで COUNT を使うのが現実的だが、`hll` を返すリレーは実測で見つかっていない。

## 6. negentropy（NIP-77）

### 各クライアントのやり方

- **NIP-77** は、手元のイベントの id 集合とリレーの集合を突き合わせ、差分の id だけを知る仕組み。イベントそのものは別に REQ で取る。「反応の数だけ知りたいなら、ダウンロードしなくてよい」と本文にある（[77.md](https://github.com/nostr-protocol/nips/blob/a79e21d90fce5465b50ef385dd368bba99ec4a0b/77.md)）。
- **welshman** は `Sync` プラグインで、NIP-11 の `supported_nips` に 77 がある、または strfry の 0.x でないバージョンならネゲントロピーで `pull` / `push` し、そうでなければ通常の REQ / publish に落とす（[Relay.ts L73-L79](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/domain/src/other/Relay.ts#L73-L79)、[sync.ts L31](https://github.com/coracle-social/welshman/blob/1ff83629e31f16aa68b151f4e6032bf80321a2e5/packages/app/src/plugins/sync.ts#L31)）。明示的な同期（バックアップなど）用で、フィードの取得には使っていない。
- **applesauce** の `createSyncLoader` は、リレーごとに NIP-77 を試し、失敗したら「過去へさかのぼるページング REQ」に落とす（[sync-loader.ts L311-L322](https://github.com/hzrd149/applesauce/blob/c2cee994ed4934d644e6cf4afa4fc1eb5ced18e0/packages/loaders/src/loaders/sync-loader.ts#L311-L322)）。
- **NDK** は `@nostr-dev-kit/sync` を別パッケージにして、キャッシュとリレーの差分を取る。対応するリレーを覚えて、順番に同期する（`sync/README.md`）。
- **Snort** は、NIP-11 の `negentropy` フィールドが 1 以上のリレーにだけ `SYNC` クエリでネゲントロピーを使う（[query-manager.ts L676-L678](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/query-manager.ts#L676-L678)）。
- **Amethyst** は `quartz` にクライアント実装（`NostrClientNegentropySyncExt` ほか）を持つが、アプリ本体と `commons` からの呼び出しは見つからなかった（実装を使っているのは `geode`〈リレー実装〉と `relayBench`〈測定用〉）。
- Gossip・Nostur・nostter・Primal は、NIP-77 を使う箇所が見つからなかった。

### Streets の現状

- 使っていない（`packages/core/src` に `NEG-` を送る箇所はない）。リレー側の対応は割れていて、yabu.me・wirednet・purplepag.es は NIP-11 の `supported_nips` に 77 を載せ、nos.lol・damus は載せていない（nos.lol は strfry 1.1.3 を名乗るので実際には動く可能性があるが、未確認）。
- フィードの取得に使っている実装は、調べた中になかった。使いどころがあるとすれば、手元に膨大なイベントを持つ場面（長期の同期・バックアップ）で、Streets のように投稿を端末に残さない設計とは相性が悪い。置換可能イベントの鮮度確認は、4 節の `since` で足りる。

## 7. 圧縮と、そのほかの帯域節約

### 各クライアント・規格のやり方

- **permessage-deflate は、サーバー側の設定の問題。** strfry は既定で有効（`compression { enabled = true; slidingWindow = true }`、[strfry.conf L139-L146](https://github.com/hoytech/strfry/blob/4cd3cf64850caf47dda46c2a2abbbf3525a64d10/strfry.conf#L139-L146)）。実測（2026-10-07）では、`Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits` を付けた握手に対し、nos.lol・relay.damus.io・yabu.me・directory.yabu.me・relay-jp.nostr.wirednet.jp は `permessage-deflate; client_no_context_takeover` で応じた。purplepag.es は 101 を返したが拡張は返さなかった。
- **クライアント側の扱い。** Amethyst は OkHttp の握手の応答に `permessage-deflate` があったかを記録するだけ（[BasicOkHttpWebSocket.kt L116](https://github.com/vitorpamplona/amethyst/blob/de53ffa402e884c5aecbc81b239e146d484145a3/quartz/src/jvmAndroid/kotlin/com/vitorpamplona/quartz/nip01Core/relay/sockets/okhttp/BasicOkHttpWebSocket.kt#L116)）。Gossip の WebSocket は `tungstenite` の機能を最小にしており（`default-features = false`）、圧縮の設定は見つからなかった。HTTP の NIP-11 取得だけ `deflate(true)` などを有効にしている（[minion/mod.rs L392](https://github.com/mikedilger/gossip/blob/c9e1c2aa603ee3b8bfbfd2dd264c6ac128edc094/gossip-lib/src/minion/mod.rs#L392)）。
- **独自の圧縮。** Primal は、独自サーバーへの WebSocket で `set_primal_protocol` に `zlib` を指定して、以降のメッセージをバイナリ（圧縮）にする（[sockets.tsx L15-L33](https://github.com/PrimalHQ/primal-web-app/blob/c96ee211043c6fee8a8b7c431746aab06392f765/src/sockets.tsx#L15-L33)）。Nostr のリレーには適用できない。
- **`limit` の切り詰め。** 実測した 5 つのリレーはすべて `max_limit` が 500 以下（wirednet は 200）。Amethyst の `MetadataFilterAssembler` は `limit` を著者数にして、必要以上に受け取らないようにする。
- **結果が必ず空になるフィルタを送らない。** Snort の `trimFilters` は、空配列を含むフィルタを送らない（[request-trim.ts](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/request-trim.ts)）。

### Streets の現状

- ブラウザの `WebSocket` が `permessage-deflate` を自動で提案するかは、この調査では確認していない（ブラウザ仕様側の一次情報を読んでいない。**未確認**）。サーバー側は上の実測で、主要 5 本が受け入れる。確認は、DevTools の Network → WS で握手の `Sec-WebSocket-Extensions` を見るだけで済む。アプリ側でできる設定は見つからない。
- 再接続の `since` を使わない理由のコメントに「500 件上限」とある（[connection-pool.ts L776](../../packages/core/src/read/connection-pool.ts#L776)）。`max_limit` が 200 の wirednet では、500 を指定しても切り詰められるはずだが、その場合のページング・終了判定が狂わないかは未確認。

## 8. 取り入れる候補（価値の高い順）

「効く量の見込み」は、上の実測に基づく推定で、実装後に Relays パネルで確かめる前提。手間は S（数時間）・M（1〜2 日）・L（数日以上）。

| 順 | 手法 | 効く量の見込み | 手間 | 参考にした実装 |
| --- | --- | --- | --- | --- |
| 1 | **使い終わった接続を 30 秒ほど残す。** 購読 0 本・`holds` 0 でもすぐ `#drop` せず、使っていない接続から先に閉じる。残した接続も 30 の枠に数える | 実測の「接続を 5 分で 6 回ずつ」が 1 回に近づく。3 本×5 回ぶんの TLS 手合わせと NIP-42 認証のやり直しが消える。順番待ち（2）の枠の見積もりも安定する | S（#994。`connection-pool.ts` の `close()` と予算判定）| welshman 30 秒、NDK 30 秒、applesauce 30 秒、noStrudel 60 秒、rx-nostr 10 秒、Snort 10 秒、Gossip 10 秒（2 節）|
| 2 | **購読の順番待ち。** リレーごとに同時購読数を持ち、NIP-11 の `max_subscriptions`（取れるまでは 20）に達したら REQ を積み、EOSE・CLOSED・購読を閉じたときに空いた分を送る。NOTICE の `too many concurrent` を受けたら、そのリレーの上限をその時点の同時数まで下げ、捨てられた分を再送する | nos.lol の NOTICE 10 回が 0 になる。strfry は上限超過の REQ を黙って捨てる（CLOSED なし）ので、捨てられた反応の数・ステータスが画面に出ないことがなくなる。通信量そのものは変わらず、待つ分だけ表示が遅れる。`fetchOnce` のソフト期限（2 秒）と全体期限（10 秒）の内側に収める必要がある | M（`ConnectionPool.subscribe` の前段にリレーごとの枠と待ち行列。`fetchOnce` のタイムアウト、`collect()` の `reserved` 迂回との整理が要る）| Snort（待ち行列と EOSE / CLOSED での再送）、rx-nostr（`queuings` と `capacity`）、Amethyst（文面から上限を学ぶ。`too many concurrent`）|
| 3 | **置換可能イベントの取り直しに `since = created_at + 1` を付ける**（kind:3・kind:0・kind:10002）。手元に版があれば、その `created_at + 1` で REQ し、0 件なら変更なし、1 件なら更新 | kind:3 の取り直しが、変わっていなければほぼ 0 バイトになる（4 つのリレーで実測）。yabu.me の受信 482KB のうち 275KB が kind:3 の 7 件、という実測の大半を占める見込みだが、7 件の発生源の特定が先（4 節）。kind:0・kind:10002 は小さいので効きは小さい | M（kind:3 は、端末に残す設計と、`SortedEvents` が追記専用で古いメンバーを取り除けない問題の解決が要る。ここが手間の大半。kind:0 / 10002 は S）| Nostur の kind:10002 の差分更新、welshman・Gossip の鮮度判定（4 節）。`since + 1` 自体は実測で確かめたもので、先例は未確認 |
| 4 | **フィルタの差し替えを、同じ購読 ID の REQ で行う。** いまは「新しい購読を先に開いてから古い方を閉じる」ため、差し替えのたびに一瞬 2 本になる。NIP-01 は同じ ID の REQ を置き換えと定めている | nos.lol の最大 30（上限 20）への寄与は未計測。差し替えが多い場面（カラムの追加・フォロー変更）の同時数の山を減らし、順番待ち（2）を入れたあとも、この山が枠を食わなくなる | S〜M（`ConnectionPool` に ID を渡す口を足す。「先に開く」は予算を守るためなので、ID の再利用で同じ保証になることを確かめる）| NIP-01（L137）。Snort の `diffFilters` は別の手段で差分だけを送る。同じ ID を再利用する実装は、今回の調査では見つからなかった |
| 5 | **まとめる窓を延ばし、種類をまたいで 1 回にそろえる。** 反応・プロフィール・住所の 200ms を 500〜1000ms にし、同じ窓で出す | nos.lol の「反応 80・ステータス 31・kind:0 を 1 人ずつ 24（計 135 本）」が、窓の比（5 分の 1）に近いところまで減る可能性がある。実際の減り方はスクロールの速さに依存するので、既にある `lastBatchSize` / `maxBatchSize` の分布を測ってから決める | S（`ENGAGEMENT_BATCH_MS` / `PROFILE_BATCH_MS` / `ADDRESS_BATCH_MS` の変更）。表示が出るまでの遅れが許容範囲かは別に確認 | Amethyst 500ms、nostter 1000ms（最大 10 件）、applesauce 1000ms（200 件）、welshman 50ms（1 節）|
| 6 | **反応・プロフィールの行き先を絞る。** (a) 反応は、そのイベントを受け取ったリレー（seen-on）と投稿者の read リレーへ。(b) kind:0 は、既定の 3 本ではなくインデクサ（`BOOTSTRAP_INDEXERS`）か著者の write リレーへ。(c) 見つかった分は次の段の要求から外す段階取得 | 既定 3 本へ同じものを送る重複（damus 76%・nos.lol 94%）のうち、行き先を 1〜2 本にした分が消える。nos.lol への反応 80 回・kind:0 24 回も同じだけ減る。seen-on が空のノート（再読み込み直後など）は既定に戻す必要がある | M（`fetchOnce` に行き先を渡す口は既にある。seen-on は `EventStore` が持っている。行き先の決め方と取りこぼしの検出が要る。リレー選択は [NIP-65 調査](./2026-08-01-nip65-relay-selection.md) の領域）| applesauce の反応ローダー（seen-on を足す）と address ローダー（段階取得）、noStrudel の lookup リレー、Amethyst の `MetadataFilterAssembler`（`indexRelays`）|
| 7 | **再接続時と EOSE 後の `since`。** リレーごとに最後の受信時刻を持ち、再接続・一時停止からの復帰で `since` を付ける（`limit` は外す）。著者の集合が増えたときは、そのリレーの時刻を捨てる | 接続を残す（1）を入れたあとは再接続が減るので、効きは小さい。再接続のたびに最大 500 件を取り直す分が減る。「`since` で埋めると 500 件の上限を食いつぶす」という既存の判断（`connection-pool.ts` のコメント）とのすり合わせが要る | M | welshman（`socketPolicyLifecycle`）、Amethyst（`MergedAuthorTracker`）、Gossip |
| 8 | **kind:10002 の取得を分割し、更新を 3 段階にする。** 未取得 → 24 時間ごとの全件 → それ以外は前回の更新時刻以降。1 REQ の著者数も 150 程度に分ける | 起動時の 1 REQ（フォロー 1300 人なら約 87KB）が `max_message_length` を超えるのを防ぐ。差分更新は、フォローが多い人の起動時の帯域を減らす | M | Nostur の `OutboxRefreshPolicy` |
| 9 | **バックオフのリセットを「60 秒つながった後」に遅らせる。失敗履歴をセッションをまたいで残す** | 握手だけ通して切るリレーへの再接続の連打を防ぐ。影響は小さい | S〜M | Amethyst（`STABLE_CONNECTION_IN_SECS`）、applesauce の `RelayLiveness`、NDK のフラッピング検知 |
| 10 | **反応の数に COUNT を使う（個別のノートを開いたときだけ）。** 一覧では使わない | 一覧では REQ が増えるので逆効果（5 節）。詳細画面で、反応が多いノートの数字を出すだけなら効くが、`hll` を返すリレーは見つかっていない。nos.lol・damus・primal は count のみ | M | Amethyst（投票）、NIP-45 |
| 11 | **permessage-deflate の確認。** DevTools で握手の `Sec-WebSocket-Extensions` を見る | サーバー側は主要 5 本が受け入れ済み。ブラウザが提案していれば、すでに効いている。アプリ側の作業はない | S（確認のみ）| strfry の設定、実測 |
| 12 | **negentropy** | フィードには向かない（6 節）。Streets は投稿を端末に残さないので、使いどころが薄い | L | welshman・applesauce・NDK・Snort（用途は同期）|

候補 1〜2 は、実測の NOTICE と接続の作り直しの直接の原因に当たる。3 は実測の帯域の大半を占める kind:3 に当たるが、発生源の特定と kind:3 の保存方針が先に要る。4〜6 は REQ の本数と重複に効くが、見込みの数字は未計測で、1〜3 のあとに Relays パネルで測り直してから着手するほうがよい。

## 9. 未確認・この調査の限界

- 読んだのは `--depth 1` の最新版で、各クライアントの過去の挙動・リリース済みの版との差は見ていない。動いているアプリの通信は測っていない（ソースの読みのみ）。
- Amethyst の `AdaptiveRelayLimiter` は `cli` からしか生成されていない。Android アプリ本体で別の経路が上限を扱っているかは、grep の範囲では見つからなかった。
- Snort の再接続時に `since` を付けるか、Gossip の NIP-11 の扱い、Nostur の `max_subscriptions` の扱いは、該当する記述が見つからなかったことしか言えない（「やっていない」とは断定しない）。
- Primal のサーバー側（集計の作り方、`zlib` の中身）は公開されていないため未確認。
- ブラウザの `WebSocket` が `permessage-deflate` を提案する既定の挙動は未確認。
- COUNT が strfry で購読の枠を使うか、`hll` を返すリレーがあるかは測っていない（nos.lol・damus・primal は count のみ、という 1 回の測定だけ）。
- 実測の NIP-11・COUNT・`since`・圧縮の握手は 2026-10-07 の一回の測定で、リレーの設定は変わる。数字は腐る前提で扱うこと。
- Streets の「窓ごとの REQ 数の分布」「kind:3 の 7 件の発生源」「差し替えが同時購読 30 に与えた寄与」は未計測。上の候補の見込みは、これらを測ってから確定する。
