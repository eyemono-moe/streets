# NIP-65 の運用実態と既定リレーの選定

[ADR-0016](../adr/0016-routing-bootstrap.md) が残した唯一の未決定事項 — **`kind:10002` を引くための既定リレーに何を積むか** — を決めるための調査。[architecture.md の「未決定 1」](../design/architecture.md) に対応する。

一般論としての Outbox Model の解説ではない。「既定リレーを何にするか」に答えるために必要な事実だけを集めている。

## 0. 調査の範囲と時点

一次情報は 2 種類に限った。

1. **`nostr-protocol/nips` リポジトリの Markdown と git 履歴、および同リポジトリの issue / PR。** 解説記事・ブログは仕様の根拠として扱わない。
2. **各クライアント／ライブラリのソースコード。** すべて自分で clone して読み、コミット SHA を固定した。

これに加えて **実測** を行った（第 3 章）。リレーの NIP-11 と `kind:10002` の実配信は、ソースを読んでも分からず、かつ既定リレーの選定に直結するため。

| 対象 | 読んだコミット | 日付 |
|---|---|---|
| nostr-protocol/nips | `8228afb5777405ef37fec199acae3f78819175c2` | 2026-07-31 |
| vitorpamplona/amethyst | `d9e01c85044c10f72665f38a9347e8e9bc3a9356` | 2026-07-31 |
| nostur-com/nostur-ios-public | `37256b74db254c9bc57f649bc68a8df3d7515da3` | 2026-07-31 |
| v0l/snort | `3cc8317af0b95ca227d8c91b014eea414e0ac26f` | 2026-07-29 |
| coracle-social/welshman | `7ed6340dd099fe15ab72537e949f2e47be3f8fb8` | 2026-07-29 |
| nbd-wtf/nostr-tools | `7fa1ef45c562d607ffc7d72289c08cbfc44f5343` | 2026-07-29 |
| coracle-social/coracle | `85868b9b52187dfa700c303a244be5c3827f723c` | 2026-07-27 |
| soapbox-pub/nostrify | `08ef3432b22fb9f772db457ee37c6a10db3d2405` | 2026-07-23 |
| hzrd149/applesauce | `4f2c1bbef6185abfbcc41567956bf4954c6dde62` | 2026-07-23 |
| SnowCait/nostter | `ea34487fa70c7b5509ec495462b2ce091c5d244f` | 2026-07-15 |
| damus-io/damus | `e462dbd53c47eadfd2535af4c56acf25973a48fc` | 2026-06-08 |
| hzrd149/nostrudel | `1261b4f0de6fc9fd059edc2271347a2b91401a97` | 2026-07-01 |
| penpenpng/rx-nostr | `2feeceb936c3e4bf2f6fd79a867b2e35b1cc4fcc` | 2026-06-26 |
| YakiHonne/web-app | `80a264e8ef996b923f2b2828342db4048c079cc2` | 2026-05-17 |
| syusui-s/rabbit | `67ab83fef09130c588cc0438f7d74be200a15ffe` | 2026-05-09 |
| PrimalHQ/primal-web-app | `415952ea05e5ffda3fd6b3ef67e4a6aace72abaf` | 2026-04-08 |
| nostr-dev-kit/ndk | `4b86acd13fe3c1284fddcb81a7f0d63e491db64a` | 2026-04-05 |

実測はすべて 2026-08-01、日本国内の家庭回線（WSL）から実施。**計測地点が日本であることは結果に効く**（レイテンシと、地理的に近いリレーの優位）。以降その旨を明記する。

---

## 1. 仕様が実際に定めていること

### 1.1 `65.md` の MUST は 1 つだけ

現行の [65.md](https://github.com/nostr-protocol/nips/blob/8228afb5777405ef37fec199acae3f78819175c2/65.md) は極端に短い。規範的な文はこれだけ。

| 文 | 強度 |
|---|---|
| イベントは `r` タグのリストを含まなければならない。マーカー（`read` / `write`）は省略可、省略時は両方 | **MUST** |
| ある利用者**から**イベントを取るときは、その利用者の **write** リレーを使う | SHOULD |
| ある利用者**について**（タグ付けされた）イベントを取るときは、その利用者の **read** リレーを使う | SHOULD |
| 公開時は、著者の write リレー＋タグ付けした全員の read リレー＋**送信した全リレーに著者の `kind:10002` も送る** | SHOULD |
| リストは小さく保つよう利用者を誘導する（**各カテゴリ 2〜4 個**） | SHOULD |
| `kind:10002` は可能な限り多くのリレーに広める。特に**その時々でリレーリストの well-known な公開インデクサとして自然に機能しているリレー**に注意を払う | SHOULD |

**streets の ADR-0005 が採った方針は、仕様の SHOULD をそのまま実装したものである。** 逸脱はない。

一方で **仕様は「既定リレー」を一切定義していない**。`bootstrap` という語は NIPs 全体（`*.md`）に 1 度も出てこない。最後の Discoverability の一文が唯一の言及だが、リレー名を挙げず、「その時々で自然にそうなっているもの」という循環した書き方に留めている。

### 1.2 2025-04 に削除された条文 — ブートストラップに直接関係する

これが本調査で最も重要な発見のひとつ。`65.md` は [`45f6d59` "Shrink NIP-65 so it is clearer" (#1879, 2025-04-15)](https://github.com/nostr-protocol/nips/commit/45f6d598a19321a98592e1f4fdf0b40707871f26) で大幅に削られており、**そこで消えた条文がまさに streets が直面している問題を扱っていた**。

削除された「Final Considerations」から（原文）:

> 5. If a relay signals support for this NIP in their [NIP-11](11.md) document that means they're willing to accept kind 10002 events from a broad range of users, not only their paying customers or whitelisted group.
>
> 6. Clients SHOULD deduplicate connections by normalizing relay URIs according to [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986#section-6).
>
> 7. When publishing to a relay, clients SHOULD ensure the user's `kind 10002` is also available on that relay. Relays SHOULD accept and serve `kind 10002` notes for any pubkey whose notes they store. Relays MAY scrape the network for missing `kind 10002` events. **The goal here is that for any note served from a relay the user can also request the author's relay selections as a way of bootstrapping further context discovery.**

同時に消えたもの:

- 「この NIP は `kind:3` 形式のリレーリストを完全に置き換えるものではない。**`kind:10002` が見つからない場合、クライアントは他のリレーリストを使ってよい（MAY）**」
- DM は著者の write と受信者の read にのみ送る（→ [NIP-17](https://github.com/nostr-protocol/nips/blob/8228afb5777405ef37fec199acae3f78819175c2/17.md) の `kind:10050` に分離）
- Outbox Model 解説記事へのリンク

**帰結。**

- 「NIP-11 の `supported_nips` に 65 があれば誰の `kind:10002` でも受け付ける意思表示」という**判定基準は現在の仕様には存在しない**。既定リレー候補を機械的に選ぶ手がかりが仕様から失われている。
- 「リレーは自分が保存している note の著者の `kind:10002` を提供すべき」も消えた。つまり **「投稿を取れたリレーからその著者の `kind:10002` も取れるはず」という仮定は、もはや仕様に裏付けられていない**。streets の ADR-0016 が専用経路を切ったのは、この点で正しい。
- URI 正規化の RFC 3986 参照も消えたが、実装上は依然必須（重複接続を防ぐため）。仕様が消えても要件は消えていない。

### 1.3 リレー選択に関わる NIP の実装状況

| NIP / kind | 内容 | 状態 | streets への関係 |
|---|---|---|---|
| [NIP-65](https://github.com/nostr-protocol/nips/blob/8228afb5777405ef37fec199acae3f78819175c2/65.md) `kind:10002` | read / write リレー広告 | `draft` `optional`・マージ済 | ルーティングの基盤 |
| [NIP-11](https://github.com/nostr-protocol/nips/blob/8228afb5777405ef37fec199acae3f78819175c2/11.md) | リレー情報ドキュメント | `draft` `optional`・マージ済 | **「Relays MUST accept CORS requests」と明記**（[L29](https://github.com/nostr-protocol/nips/blob/8228afb5777405ef37fec199acae3f78819175c2/11.md#L29)）。`limitation.max_limit` / `max_subscriptions` は接続予算に直結 |
| [NIP-19](https://github.com/nostr-protocol/nips/blob/8228afb5777405ef37fec199acae3f78819175c2/19.md) | `nprofile` / `nevent` / `naddr` の TLV type `1` = relay | マージ済 | リレーヒント。「見つかる可能性が高い」だけで保証はない。`nrelay` は **deprecated** |
| [NIP-66](https://github.com/nostr-protocol/nips/blob/8228afb5777405ef37fec199acae3f78819175c2/66.md) `kind:30166` / `kind:10166` | リレー死活監視・発見 | **マージ済**（[#230](https://github.com/nostr-protocol/nips/pull/230) が 2025-03-03 にマージ、以後 2026-05 まで改訂継続） | 「Clients **MUST NOT** require `30166` events to function」と明記。既定リレーの代替にはならない |
| [NIP-17](https://github.com/nostr-protocol/nips/blob/8228afb5777405ef37fec199acae3f78819175c2/17.md) `kind:10050` | DM 受信リレー | マージ済 | [ADR-0006](../adr/0006-no-dm-in-v1.md) により v1 対象外 |
| [NIP-51](https://github.com/nostr-protocol/nips/blob/8228afb5777405ef37fec199acae3f78819175c2/51.md) `kind:10006` / `10007` / `10012` / `30002` | ブロックリレー / 検索リレー / お気に入りリレー / リレーセット | マージ済 | `kind:10006`（接続してはいけないリレー）は既定リレーより優先されるべき |
| **`kind:10086` Indexer relays** | kinds 0 と 10002 をどこから取る／どこへ送るか | **未マージ**（[PR #1985](https://github.com/nostr-protocol/nips/pull/1985)、vitorpamplona、2025-07-23 open のまま） | **Amethyst と applesauce/noStrudel が既に実装している。事実上の標準になりつつあるが仕様ではない** |
| [PR #2018](https://github.com/nostr-protocol/nips/pull/2018) | DHT によるリレー発見 | 未マージ | 参考 |

### 1.4 「既定リレー」は完全にクライアント側の問題である — 一次情報

NIPs リポジトリの [issue #1607 "We need tools to discover bootstrap relays"](https://github.com/nostr-protocol/nips/issues/1607)（arthurfranca、2024-11-24 起票、翌日 close）がこの問いを正面から扱っている。要旨:

- 起票者: 「ブートストラップリレー（`kind:10002` の配布を助けるリレー）として自分が知っているのは `purplepag.es` と `user.kindpag.es` だけ。新しいものをどう発見するか」
- vitorpamplona: 「bootstrap は悪い名前。あれはメタデータリレーで、最後の手段にすぎない。`kind:10050` のようなユーザー自身の preferred metadata relay リストを作るべき。**クライアントは新規ユーザー向けの既定値を持ってよいが、本来は各自が選ぶべきもの**」（→ これが後に `kind:10086` の PR になった）
- arthurfranca: 「有料リレーは支払い済みユーザーの `kind:10002` しか保存しないので、NIP-11 に 65 と書いてあってもブートストラップリレーとしては使えない」
- **fiatjaf（NIPs メンテナ）が close 時のコメント: 「Hardcoding by the app developer is probably enough.」**

**これが答えである。既定リレーはアプリ開発者がハードコードするもので、仕様が助けてくれることは今後もない。** streets は自分で選んで、自分で腐敗に備えるしかない。

なお [issue #1983 "Better guidance for event discovery"](https://github.com/nostr-protocol/nips/issues/1983)（staab、2025-07-21、open）は同じ問題をより広く提起しており、現状を次のように要約している（原文の言い換え）: 「今は `kind:10002` は purplepag.es、`kind:0` は relay.nostr.band、それ以外は relay.damus.io / nos.lol / relay.primal.net、という暗黙の中央集権がある」。**当事者たちが中央集権を認識したうえで解決できていない**、というのが 2026-08 時点の状態。

---

## 2. 各クライアントが実際に積んでいるもの

### 2.1 既定リレーの実物

すべてソースから引用。用途がクライアントによって違う（接続用／インデクサ用／新規アカウントの `kind:10002` 種）ので列を分けた。

| クライアント | 一般接続・フォールバック用 | インデクサ／メタデータ用 | 出典 |
|---|---|---|---|
| **Damus** (iOS) | `relay.damus.io`, `nostr.land`, `nostr.wine`, `nos.lol`<br>＋**地域別**（後述） | — | [RelayBootstrap.swift L11-34](https://github.com/damus-io/damus/blob/e462dbd53c47eadfd2535af4c56acf25973a48fc/damus/Features/Relays/Models/RelayBootstrap.swift#L11-L34) |
| **Amethyst** (Android) | `eventFinderRelays` = `nostr.wine`, `relay.primal.net`, `nostr.mom`, `nos.lol`, `nostr.bitcoiner.social`, `nostr.oxtr.dev`<br>`bootstrapInbox` = `relay.primal.net`, `nostr.mom`, `nos.lol`, `nostr.bitcoiner.social`, `nostr.oxtr.dev`, **`directory.yabu.me`** | `DefaultIndexerRelayList` = `purplepag.es`, `indexer.coracle.social`, `user.kindpag.es`, **`directory.yabu.me`**, `profiles.nostr1.com` | [Constants.kt L30-59](https://github.com/vitorpamplona/amethyst/blob/d9e01c85044c10f72665f38a9347e8e9bc3a9356/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/defaults/Constants.kt#L30-L59), [AmethystDefaults.kt L46-63](https://github.com/vitorpamplona/amethyst/blob/d9e01c85044c10f72665f38a9347e8e9bc3a9356/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/defaults/AmethystDefaults.kt#L46-L63) |
| **noStrudel** (web) | `DEFAULT_FALLBACK_RELAYS` = `relay.primal.net`, `relay.damus.io`<br>（推奨値には `nos.lol` も） | `RECOMMENDED_LOOKUP_RELAYS` = `purplepag.es`, `index.hzrd149.com`, `indexer.coracle.social` | [const.ts L31-58](https://github.com/hzrd149/nostrudel/blob/1261b4f0de6fc9fd059edc2271347a2b91401a97/src/const.ts#L31-L58) |
| **Coracle** (web) | `VITE_DEFAULT_RELAYS` = `relay.damus.io`, `nos.lol` | `VITE_INDEXER_RELAYS` = `relay.damus.io`, `purplepag.es`, `indexer.coracle.social` | [.env.template L4,L7](https://github.com/coracle-social/coracle/blob/85868b9b52187dfa700c303a244be5c3827f723c/.env.template#L4-L7), [state.ts L828-832](https://github.com/coracle-social/coracle/blob/85868b9b52187dfa700c303a244be5c3827f723c/src/engine/state.ts#L828-L832) |
| **Snort** (web, `default.json`) | `relay.snort.social` (rw), `nostr.wine` (r), `relay.damus.io` (rw) | `MetadataRelays` = `purplepag.es`, `relay.nostr.band`, `relay.snort.social` | [config/default.json L46-58](https://github.com/v0l/snort/blob/3cc8317af0b95ca227d8c91b014eea414e0ac26f/packages/app/config/default.json#L46-L58), [system/const.ts L61-71](https://github.com/v0l/snort/blob/3cc8317af0b95ca227d8c91b014eea414e0ac26f/packages/system/src/const.ts#L61-L71) |
| **Nostur** (iOS) | `nos.lol` (rw), `relay.damus.io` (w), `relay.primal.net` (w), `nostr.wine` (r、`// paid to write`), `purplepag.es` (rw) | — | [Maintenance.swift L49-95](https://github.com/nostur-com/nostur-ios-public/blob/37256b74db254c9bc57f649bc68a8df3d7515da3/Nostur/Utils/Maintenance.swift#L49-L95) |
| **YakiHonne** (web) | `nostr-01.yakihonne.com`, `nostr-02.yakihonne.com`, `relay.damus.io`, `relay.nsec.app`, `nos.lol`, `monitorlizard.nostr1.com` | NDK の既定を継承（下記） | [Content/Relays.js](https://github.com/YakiHonne/web-app/blob/80a264e8ef996b923f2b2828342db4048c079cc2/src/Content/Relays.js), [NDKInstance.js](https://github.com/YakiHonne/web-app/blob/80a264e8ef996b923f2b2828342db4048c079cc2/src/Helpers/NDKInstance.js) |
| **Primal** (web) | `PRIMAL_PRIORITY_RELAYS` = `relay.primal.net` のみ。**既定リレー一覧はクライアントに無く、キャッシュサービスに `get_default_relays` で問い合わせる** | — | [.env](https://github.com/PrimalHQ/primal-web-app/blob/415952ea05e5ffda3fd6b3ef67e4a6aace72abaf/.env), [lib/relays.ts L15-21](https://github.com/PrimalHQ/primal-web-app/blob/415952ea05e5ffda3fd6b3ef67e4a6aace72abaf/src/lib/relays.ts#L15-L21) |
| **NDK** (lib) | — | `DEFAULT_OUTBOX_RELAYS` = `purplepag.es`, `nos.lol` | [core/src/ndk/index.ts L269](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/ndk/index.ts#L269) |
| **applesauce / Nostrify / rx-nostr / nostr-tools** | **ハードコードなし** | なし | 下記 |

**ライブラリは既定リレーを持たない。** applesauce にリレー URL の定数は Primal キャッシュと Vertex の 2 つしかなく、既定リレーはアプリが `fallbacks` として渡す（[`setFallbackRelays`](https://github.com/hzrd149/applesauce/blob/4f2c1bbef6185abfbcc41567956bf4954c6dde62/packages/core/src/helpers/relay-selection.ts#L96)）。Nostrify の `NPool` は `reqRouter` / `eventRouter` をアプリから受け取るだけ。rx-nostr には Outbox の実装も既定リレーも無く、`setDefaultRelays()` は呼び出し側が渡す。nostr-tools には `nip65.ts` すら存在しない。**唯一 NDK だけが既定値を持ち、それを設定しないアプリ（YakiHonne が実例）は `purplepag.es` + `nos.lol` を継承する。**

### 2.2 事実上「インデクサ層」が分離している

上表で列を分けたとおり、**成熟したクライアントは「一般リレー」と「`kind:0` / `kind:10002` を引くためのインデクサ」を別の定数として持っている**。

- Amethyst: `DefaultIndexerRelayList`（`kind:10086` の既定値でもある）
- noStrudel: `RECOMMENDED_LOOKUP_RELAYS`（同じく `kind:10086` の既定値）
- Coracle: `INDEXER_RELAYS`
- Snort: `MetadataRelays`
- nostter: `metadataRelays`
- NDK: `outboxPool`（`ndk.pool` とは別のプール）

**これは streets の ADR-0016 が言う「専用経路」と同じ構造である。** 既存クライアントは全員この分離に到達している。ADR-0016 は「ユーザー自身の read relay + 既定リレー」と書いているが、**実装上は「既定リレー」を汎用フォールバックとインデクサに分けたほうがよい**（第 6 章）。

`indexer.coracle.social` は NIP-11 で `supported_nips: [65]` しか申告していない（実測、後述）。**`kind:10002` 専用のインデクサとして作られたリレーが実在する。**

### 2.3 ルーティング表の構築方式

| 実装 | 構築 | 永続化 | 出典 |
|---|---|---|---|
| **NDK** | `OutboxTracker.trackUsers()` が **400 件ずつのバッチ**で一括取得。セッション層がフォローリストを渡すので実質ウォームアップ | **なし**（`LRUCache` maxSize 100000 / **TTL 2 分**）。ソースに `TODO: The state of this tracker needs to be added to cache adapters` と明記 | [tracker.ts L60-64](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/outbox/tracker.ts#L60-L64) |
| **welshman / Coracle** | 著者ごとに遅延（`RelayLists.load(pubkey)`）。`kind:10002` の取得だけは **`indexers()` ＋呼び出し側のヒント**という専用経路。ソースに「ここで `outbox(pubkey)` を解決すると再帰する」とコメント | EventStore 経由（IndexedDB） | [relayLists.ts L25-34](https://github.com/coracle-social/welshman/blob/7ed6340dd099fe15ab72537e949f2e47be3f8fb8/packages/app/src/plugins/relayLists.ts#L25-L34) |
| **noStrudel / applesauce** | 遅延だが **200ms バッファでバッチ化**（`profileLoader = createAddressLoader(..., bufferTime: 200, lookupRelays: lookupRelays$)`）。選択自体も 500ms デバウンス | IndexedDB / SQLite のイベントキャッシュ経由 | [loaders.ts L29-35](https://github.com/hzrd149/nostrudel/blob/1261b4f0de6fc9fd059edc2271347a2b91401a97/src/services/loaders.ts#L29-L35), [outbox-selection.ts L49-61](https://github.com/hzrd149/nostrudel/blob/1261b4f0de6fc9fd059edc2271347a2b91401a97/src/models/outbox-selection.ts#L49-L61) |
| **Amethyst** | フォロー中の全員分を `pickRelaysToLoadUsers` でリレー別にまとめて発行。**「まだ試していないリレー」を `hasTried` で追跡し、試し尽くしたら止める** | ローカルキャッシュあり | [FilterFindFollowMetadataForKey.kt L80-190](https://github.com/vitorpamplona/amethyst/blob/d9e01c85044c10f72665f38a9347e8e9bc3a9356/amethyst/src/main/java/com/vitorpamplona/amethyst/service/relayClient/reqCommand/account/follows/FilterFindFollowMetadataForKey.kt#L80-L190) |
| **Nostur** | `setPreferredRelays(using: kind10002s)` に既取得の `kind:10002` 群を渡して一括で `pubkeysByRelay` を作る | Core Data | [ConnectionPool.swift L777-803](https://github.com/nostur-com/nostur-ios-public/blob/37256b74db254c9bc57f649bc68a8df3d7515da3/Nostur/Relays/Network/ConnectionPool.swift#L777-L803) |
| **nostter** | 自分の `kind:3` / `kind:10002` を `metadataRelays` ＋ default write relays から取得し、**localStorage にキャッシュ**。キャッシュがあればネットワークに出ない | localStorage | [RelayList.ts L10-30](https://github.com/SnowCait/nostter/blob/ea34487fa70c7b5509ec495462b2ce091c5d244f/web/src/lib/author/RelayList.ts#L10-L30) |
| **Damus** | **著者ごとのルーティングをしていない。** NIP-65 は「自分がどのリレーに繋ぐか」にのみ使う。`grep -i outbox` は `// TODO(tyiu) Ideally this list would be sorted by the event author's outbox relay preferences` 1 件のみ | — | [UserRelayListManager.swift](https://github.com/damus-io/damus/blob/e462dbd53c47eadfd2535af4c56acf25973a48fc/damus/Core/Networking/NostrNetworkManager/UserRelayListManager.swift) |
| **Primal** | クライアントは Outbox ルーティングをしない。フィードは自社キャッシュサービス（`wss://cache2.primal.net/v1`）から取る | — | [lib/relays.ts](https://github.com/PrimalHQ/primal-web-app/blob/415952ea05e5ffda3fd6b3ef67e4a6aace72abaf/src/lib/relays.ts) |

**ADR-0016 の「ログイン時に 1 クエリでウォームアップ + TTL 付き永続キャッシュ」は、どの既存実装よりも積極的である。** 最も近いのは NDK（400 件バッチ）だが NDK は永続化していない。**永続化まで含めてやっている実装は見つからなかった** — ただしイベントキャッシュ（IndexedDB）に `kind:10002` が入る実装（welshman / applesauce）は、結果としてほぼ同じ効果を得ている。**streets も「ルーティング表専用のストア」ではなく「イベントキャッシュに `kind:10002` が入っていること」で実現できる可能性がある**（[ADR-0018](../adr/0018-indexeddb-event-cache.md) との重複を減らせる）。これは設計時に検討する価値がある。

### 2.4 `kind:10002` がない著者の扱い

| 実装 | フォールバック |
|---|---|
| **Amethyst** | 段階的に広げる。① リレーヒント（`allUsedRelays()` + `LocalCache.relayHints`）→ ② ヒントが 3 未満なら**インデクサリレー**（pubkey ごとに `pubkeyHex.hashCode() xor relay.url.hashCode()` で決定的にシャッフルして負荷を散らす）→ ③ 自分の home リレー → ④ 検索リレー → ⑤ 接続中リレー（最大 100、フォロー 300 人超なら 20）→ ⑥ `eventFinderRelays`。**フォローが 300 人を超えるとインデクサへは 2 本だけに絞る**（コメント: `// picks one at random to avoid overloading these relays`） |
| **applesauce / noStrudel** | `setFallbackRelays(users, fallbacks)` — リレー 0 件のユーザーに `DEFAULT_FALLBACK_RELAYS` を丸ごと入れる |
| **welshman / Coracle** | `FallbackPolicy` を選べる（`addNoFallbacks` / `addMinimalFallbacks` = 0 件なら 1 本足す / `addMaximalFallbacks` = limit まで埋める）。既定は `addNoFallbacks` |
| **NDK** | `authorsMissingRelays` は `pool.permanentAndConnectedRelays()`（= `explicitRelayUrls`）に全部載せる。さらに `kind:10002` が無ければ **`kind:3` の `content` の旧式リレーリストにフォールバックする** |
| **Nostur** | Outbox 経路には載せない。通常のリレーセットで拾う |
| **Damus** | 該当なし（そもそも著者別ルーティングをしない） |

**「フォールバックを一切しない」という選択肢が welshman の既定である**点は注目に値する。ADR-0016 は「未解決の著者は既定リレーへ暫定的に送信し `unroutableAuthors` に計上する」としており、これは `addMinimalFallbacks` 寄りの方針。Amethyst の「フォロー数が多いときはインデクサへ 2 本だけ」という配慮は、[ADR-0011](../adr/0011-performance-budget.md) の 30 接続上限と同じ動機で、より細かい。

### 2.5 接続数の絞り方

**貪欲な最大被覆（greedy set cover）を実装しているのは applesauce だけである。** 他は per-author の上限か、単純な重み付けソート。

| 実装 | 方式 | 数値 |
|---|---|---|
| **applesauce** | **貪欲被覆**。未カバーのユーザーを最も多く拾えるリレーを 1 本ずつ選び、`maxConnections` に達するまで繰り返す。`maxRelaysPerUser` に達したユーザーはプールから外す | noStrudel の既定 `maxConnections: 20`, `maxRelaysPerUser: 5`（[const.ts L31-35](https://github.com/hzrd149/nostrudel/blob/1261b4f0de6fc9fd059edc2271347a2b91401a97/src/const.ts#L31-L35)、UI から変更可）。実装は [relay-selection.ts L14-93](https://github.com/hzrd149/applesauce/blob/4f2c1bbef6185abfbcc41567956bf4954c6dde62/packages/core/src/helpers/relay-selection.ts#L14-L93) |
| **welshman** | 重み付きスコア。`-(quality * (1 + log(weight)) * Math.random())` で並べて上位 `limit` 本。**`log` は「素の出現数だとハブが過大評価されるから」**、乱数は「たまに人気の低いリレーも選ぶため」とコメントに明記 | `limit` 既定 3（Coracle の `relay_limit` 設定も 3）。[RelaySelection.ts L146-191](https://github.com/coracle-social/welshman/blob/7ed6340dd099fe15ab72537e949f2e47be3f8fb8/packages/util/src/RelaySelection.ts#L146-L191) |
| **NDK** | 著者ごとに `relayGoalPerAuthor` 本。**接続済みリレーを優先**し、次に「既に他の著者のために選んだリレー」を優先し、最後に「その著者に書き込みが多い順」で埋める。**全体の接続上限は無い** | `relayGoalPerAuthor = 2`（[with-authors.ts L21](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/outbox/read/with-authors.ts#L21)） |
| **Nostur** | リレーを担当 pubkey 数の降順に並べ、上位 `maxPreferredRelays` 本。さらに `skipTopRelays: 3` で**最上位（＝最も人気の）3 本を意図的に飛ばす** — 「それらは通常のリレーセットで既に繋がっているから」 | `maxPreferredRelays = 50`（[ConnectionPool.swift L767, L825](https://github.com/nostur-com/nostur-ios-public/blob/37256b74db254c9bc57f649bc68a8df3d7515da3/Nostur/Relays/Network/ConnectionPool.swift#L767)） |
| **Amethyst** | 全体上限なし。個別クエリで `.take(100)` / `.take(20)` を掛ける | grep では全体接続上限が見つからなかった（不在の証明ではない） |

**streets の 30 接続上限（ADR-0011）は、この中で noStrudel（20）に次いで厳しい部類。** 実際に貪欲被覆を使うなら applesauce の実装（93 行）がそのまま参考になる。ただし `maxRelaysPerUser` の扱いには `// TODO: this will have more than maxRelaysPerUser relays` というコメント付きの既知の緩さがある。

### 2.6 リレー品質・死活

| 実装 | 方式 |
|---|---|
| **welshman** | `RelayStats.getQuality(url)`: 直近 1 分にエラー 1 回 → 0点、1 時間に 3 回超 → 0点、1 日に 10 回超 → 0点。接続中 1.0 / 過去接続あり 0.9 / 普通の URL 0.8 / それ以外 0.7。**ブロックリレーリスト（`kind:10006`）に載っていれば 0 点**。[relayStats.ts L60-93](https://github.com/coracle-social/welshman/blob/7ed6340dd099fe15ab72537e949f2e47be3f8fb8/packages/app/src/plugins/relayStats.ts#L60-L93) |
| **applesauce** | `RelayLiveness`: `online` / `offline` / `dead` の 3 状態。指数バックオフ（既定 30 秒〜5 分）、`maxFailuresBeforeDead: 5`。**ストレージアダプタで永続化できる**。noStrudel は `ignoreUnhealthyRelaysOnPointers(liveness)` で Outbox 選択から除外 |
| **Nostur** | `penaltybox`。**`CLOSED auth-required:` を返したリレーは Outbox 用途から即座に外す**（[MessageParser.swift L122-138](https://github.com/nostur-com/nostur-ios-public/blob/37256b74db254c9bc57f649bc68a8df3d7515da3/Nostur/Nostr/MessageParser.swift#L122-L138)）。SSL エラー・DNS 解決失敗・証明書不正も即 penalty。「他のリレーが応答しているのにこれだけエラー」の場合だけ penalty に入れる、という判定が入っている |
| **Amethyst** | `RelayOfflineTracker.cannotConnectRelays`。接続成功で自動解除。全てのリレー選択から減算される |
| **noStrudel / Snort** | NIP-66 の監視リレー（`relay.nostr.watch`, `monitorlizard.nostr1.com`）を持つが、**用途はリレー探索 UI であって Outbox の選択ではない**。noStrudel の Outbox 選択が使うのは自前の `liveness` |

**NIP-66 を Outbox のリレー選択に使っているクライアントは見つからなかった。** 全員、自分の接続履歴で判断している。NIP-66 自身が「MUST NOT require」と書いているとおり。

---

## 3. 実測（2026-08-01・日本の家庭回線から）

ソースを読んでも分からないことを測った。**すべて再現可能な手順**（NIP-11 は `curl -H 'Accept: application/nostr+json' -H 'Origin: ...'`、リレー問い合わせは Node 24 の組み込み `WebSocket` で `REQ` を投げて `EOSE` まで数えるだけ）。

### 3.1 NIP-11 と CORS

streets は [ADR-0014](../adr/0014-thin-relay-connection-deep-read-layer.md) どおりブラウザから直接 NIP-11 を取りに行くので、CORS が通らないと `RelayInfoRegistry` が機能しない。候補全部を確認した。

| リレー | HTTP | `Access-Control-Allow-Origin` | `limitation` の要点 |
|---|---|---|---|
| `directory.yabu.me` | 200 | `*` | `max_limit: 500`, `max_subscriptions: 50` |
| `yabu.me` | 200 | `*` | 同上 |
| `r.kojira.io` | 200 | `*` | `max_limit: 1000`, `max_subscriptions: 100` |
| `relay-jp.nostr.wirednet.jp` | 200 | `*` | **`max_limit: 200`, `max_subscriptions: 8`** |
| `relay.nostr.wirednet.jp` | 200 | `*` | `max_limit: 200`, `max_subscriptions: 16` |
| `purplepag.es` | 200 | `*` | `max_subscriptions: 50`, `auth_required: false` |
| `user.kindpag.es` | 200 | `*` | 申告なし |
| `indexer.coracle.social` | 200 | `*` | **`supported_nips: [65]` のみ** |
| `profiles.nostr1.com` | 200 | `*` | `max_subscriptions: 80`, `max_limit: 10000` |
| `nos.lol` | 200 | `*` | `max_limit: 500`, **`max_subscriptions: 20`** |
| `relay.damus.io` | 200 | `*` | `max_limit: 500`, `max_subscriptions: 200` |
| `relay.primal.net` | 200 | `*` | `max_limit: 500`, `max_subscriptions: 20` |
| `nostr.mom` | 200 | `*` | `max_subscriptions: 50` |
| `nostr.bitcoiner.social` | 200 | `*` | `max_subscriptions: 20` |
| `relay.snort.social` | 200 | `*` | `max_limit: 5000`, `max_subscriptions: 300` |
| `search.nos.today` | 200 | `*` | NIP-50 対応 |
| `nostr.wine` | 200 | `*` | **`payment_required: true`, `restricted_writes: true`** |
| `nrelay-jp.c-stellar.net` | **502** | なし | — |
| `relay.nostr.band` | **タイムアウト（15 秒、2 回試行）** | — | — |

**得られた事実。**

- **CORS は問題にならなかった。** 応答した 17 本すべてが `Access-Control-Allow-Origin: *` を返した。NIP-11 が MUST としているだけあって、実際に守られている。

  ただし**再計測するときは `Origin` ヘッダを必ず付けること**。`purplepag.es` は `Origin` が無いリクエストには `Access-Control-Allow-Origin` を返さない（2026-08-01 に確認）。ブラウザは必ず `Origin` を送るので実害は無いが、`curl` から `Origin` 無しで叩くと「CORS 非対応」という誤った結論が出る。上表は `Origin` 付きで測った値。
- **`relay-jp.nostr.wirednet.jp` は `max_subscriptions: 8`。** 購読数の予算がリレーごとに大きく違う（8 〜 300）ことの実例。

  > **訂正（2026-08-01）**: 初版はこれを「10 カラム前提の streets とは構造的に非互換」と書いたが、**これは誤りである。** NIP-01 は 1 つの `REQ` に複数フィルタを載せることを認めており（[`01.md:118,147`](https://github.com/nostr-protocol/nips/blob/master/01.md)、複数フィルタは OR 条件）、同一リレーへ向かう複数カラムのフィルタを 1 購読にまとめられる。購読数はカラム数に比例しない。詳細と代償は第 5.4 節。`max_subscriptions` は**除外の基準ではなくスケジューリングの入力**として扱うべきである。このリレーを既定から外す判断自体は、被覆率 48%（`directory.yabu.me` は 87%）という別の理由で維持される。
- **`nrelay-jp.c-stellar.net` は 502。** nostter が `localizedRelays.ja` に積んでいる 4 本のうち 1 本が死んでいる。**既定リレーのリストは腐る**、の実例。
- **`nostr.wine` は `payment_required: true` かつ `restricted_writes: true`。** Nostur のソースにある `// paid to write` というコメントと一致する。有料リレーを既定に入れると、読めるが書けない、あるいは所属していない著者の `kind:10002` を持たない。
- `relay.nostr.band` はこの計測地点から 2 回ともタイムアウトした。**リレーが落ちているとは断定しない**（経路や地理の可能性がある）。ただし Snort の `MetadataRelays` と staab の issue #1983 で「`kind:0` の事実上のインデクサ」とされているリレーがこう振る舞うこと自体、既定に入れるリスクとして記録しておく。

### 3.2 `kind:10002` / `kind:0` の被覆率 — これが決定材料

**手順**: `wss://yabu.me` から `{kinds:[1], limit:300}` を取り、著者 pubkey を重複排除して 100〜129 人のサンプルを作る（＝**日本語圏で実際に今書き込んでいる人たちの母集団**）。各候補リレーに `{kinds:[10002], authors:[サンプル]}` と `{kinds:[0], authors:[サンプル]}` を投げ、返ってきた著者数を数える。

日本語圏サンプル（129 人）:

| リレー | `kind:10002` を返した人数 | 割合 |
|---|---|---|
| **`directory.yabu.me`** | **112 / 129** | **87%** |
| `nos.lol` | 106 / 129 | 82% |
| `indexer.coracle.social` | 103 / 129 | 80% |
| `r.kojira.io` | 101 / 129 | 78% |
| `purplepag.es` | 63 / 129 | 49% |
| `relay-jp.nostr.wirednet.jp` | 62 / 129 | 48% |
| `relay.primal.net` | 31 / 129 | 24% |
| `user.kindpag.es` | 27 / 129 | 21% |
| `relay.damus.io` | 計測不能（後述） | — |

**全リレーの和集合も 112 人（87%）だった。** つまり `directory.yabu.me` の集合が他のすべてを包含しており、**他のリレーを追加しても 1 人も増えなかった**。残り 17 人（13%）は、この 9 本のどこにも `kind:10002` を公開していない。

同じサンプル 100 人で `kind:0` と `kind:10002` を並べ、EOSE までの所要時間も計測（**日本からの計測なので時間は地理の影響を強く受ける**）:

| リレー | `kind:0` | 時間 | `kind:10002` | 時間 |
|---|---|---|---|---|
| **`directory.yabu.me`** | **99 / 100** | **101 ms** | **84 / 100** | **65 ms** |
| `profiles.nostr1.com` | 98 / 100 | 1377 ms | 82 / 100 | 872 ms |
| `nos.lol` | 92 / 100 | 1683 ms | 79 / 100 | 1641 ms |
| `indexer.coracle.social` | **0 / 100** | 602 ms | 75 / 100 | 654 ms |
| `purplepag.es` | 22 / 100 | 2141 ms | 46 / 100 | 1937 ms |
| `user.kindpag.es` | 23 / 100 | 1116 ms | 20 / 100 | 1076 ms |

**得られた事実。**

- **日本語圏の著者に対しては `directory.yabu.me` が単独で最良であり、しかも桁違いに速い。** これは「日本語圏だから」という主観ではなく測定値。
- **`purplepag.es` は日本語圏では弱い。** `kind:0` を 22% しか持っていない。「メタデータリレーといえば purplepag.es」という業界の通念（issue #1607 / #1983）は、日本語圏の母集団に対しては当てはまらない。
- **`indexer.coracle.social` は `kind:0` を 1 件も返さない。** NIP-11 の `supported_nips: [65]` どおり `kind:10002` 専用。用途を誤ると `kind:0` の欠落として現れる。
- `profiles.nostr1.com`（Amethyst のインデクサリスト所属）は `kind:0` 98%、`kind:10002` 82% と、汎用インデクサとして優秀。
- グローバル母集団（`nos.lol` の `kind:1` から作った 150 人）でも `directory.yabu.me` が 37% で最良、`nos.lol` 33%、`indexer.coracle.social` 31%、`purplepag.es` 23%、`user.kindpag.es` 3%、`relay.primal.net` 3% だった。**グローバルで被覆率が全体に低いのは、`kind:1` を書く母集団にブリッジやボットなど `kind:10002` を持たないアカウントが多く混ざるため**（推測。母集団の内訳までは調べていない）。

- **`relay.damus.io` は `{kinds:[10002], authors:[...]}` を連続で投げると WebSocket エラーで切られた。** 著者 1 件・20 件・50 件では成功し、他リレーへの問い合わせを挟んで短時間に何度も接続すると失敗する。**接続レート制限と推測されるが、確証はない**（計測地点固有の可能性を排除できていない）。最も広く既定に採用されているリレーが、ブートストラップという「短時間に集中して叩く」用途で最も不安定だった、という観測結果として記録する。

### 3.3 単一クエリでのウォームアップは何人まで通るか

ADR-0016 の「`{kinds:[10002], authors:[...]}` の 1 クエリ」が実際に通るかを確認した。3 リレーから集めた 391 人のプールを使用。

| リレー | authors=100 | authors=300 |
|---|---|---|
| `directory.yabu.me` | 84 件 / 95 ms | 151 件 / 166 ms |
| `nos.lol` | 79 件 / 1427 ms | 142 件 / 2000 ms |
| `purplepag.es` | 46 件 / 1771 ms | 76 件 / 2717 ms |

**300 著者の単一クエリは 3 本とも問題なく通った。** ADR-0016 の前提はこの範囲では成立する。**500 人以上は検証できていない**（サンプルを 391 人しか集められなかった）。フォロー数が 1000 を超えるユーザーで通るかは未確認。

### 3.4 `purplepag.es` は replaceable event の旧版も返す

20 著者に `{kinds:[10002], authors:[...]}` を投げたところ:

| リレー | 返ったイベント数 | 著者数 | 複数版を返した著者 |
|---|---|---|---|
| `purplepag.es` | 20 | 8 | **3**（1 著者あたり最大 4 版、`created_at` が全部違う） |
| `directory.yabu.me` | 15 | 15 | 0 |

**`purplepag.es` は同一著者の `kind:10002` を複数バージョン返してくる。** streets の読み取り層は `kind:10002` を受け取る際、**pubkey ごとに `created_at` 最大のものを採らなければならない**。「replaceable だからリレーが 1 件に畳んでいるはず」という仮定は成り立たない。これは実装上の必須事項であり、fake リレーを使ったテストにこのケースを入れるべき。

---

## 4. 日本語圏はどこに集まっているか

主張ではなく、**ソースと NIP-11 の自己記述だけ**で確認できたものを挙げる。

### 4.1 クライアントが実際に積んでいる日本向けリレー

| クライアント | 日本向けの扱い | 中身 | 出典 |
|---|---|---|---|
| **Damus** | `REGION_SPECIFIC_BOOTSTRAP_RELAYS[.japan]`。iOS の地域設定が日本なら**新規アカウント作成時に**既定へ追加 | `relay-jp.nostr.wirednet.jp`, `yabu.me`, `r.kojira.io` | [RelayBootstrap.swift L18-34](https://github.com/damus-io/damus/blob/e462dbd53c47eadfd2535af4c56acf25973a48fc/damus/Features/Relays/Models/RelayBootstrap.swift#L18-L34) |
| **Rabbit**（日本語のマルチカラムクライアント） | `window.navigator.language.includes('ja')` なら既定に追加。日本語 TL カラムのリレーにも使う | `relay-jp.nostr.wirednet.jp`, `r.kojira.io`, `yabu.me` | [relayUrls.ts L9-15](https://github.com/syusui-s/rabbit/blob/67ab83fef09130c588cc0438f7d74be200a15ffe/src/core/relayUrls.ts#L9-L15), [useConfig.ts L129-135](https://github.com/syusui-s/rabbit/blob/67ab83fef09130c588cc0438f7d74be200a15ffe/src/core/useConfig.ts#L129-L135) |
| **nostter** | `locale` が `ja` で始まるなら `rxNostr.addDefaultRelays(localizedRelays.ja)` | `relay-jp.nostr.wirednet.jp`, `yabu.me`, `r.kojira.io`, `nrelay-jp.c-stellar.net`（※ 502） | [Constants.ts L101-123](https://github.com/SnowCait/nostter/blob/ea34487fa70c7b5509ec495462b2ce091c5d244f/web/src/lib/Constants.ts#L101-L123), [+layout.ts L12-16](https://github.com/SnowCait/nostter/blob/ea34487fa70c7b5509ec495462b2ce091c5d244f/web/src/routes/+layout.ts#L12-L16) |
| **nostter**（メタデータ） | `metadataRelays` の既定 | `purplepag.es`, `user.kindpag.es`, **`directory.yabu.me`** | [Constants.ts L126-130](https://github.com/SnowCait/nostter/blob/ea34487fa70c7b5509ec495462b2ce091c5d244f/web/src/lib/Constants.ts#L126-L130) |
| **Snort**（`めく` ビルド） | 日本語版ビルド `meku.json`（`appName: "めく"`, `language: "ja"`, `hostname: meku.app`） | `relay.nostr.wirednet.jp`, `yabu.me`, `nos.lol` | [config/meku.json L45-49](https://github.com/v0l/snort/blob/3cc8317af0b95ca227d8c91b014eea414e0ac26f/packages/app/config/meku.json#L45-L49) |
| **Amethyst** | 地域判定はしないが、**グローバルのインデクサリストに `directory.yabu.me` を入れている** | `DefaultIndexerRelayList` の 5 本のうち 1 本 | [AmethystDefaults.kt L62-63](https://github.com/vitorpamplona/amethyst/blob/d9e01c85044c10f72665f38a9347e8e9bc3a9356/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/defaults/AmethystDefaults.kt#L62-L63) |

Damus の該当コミット [`d2bb013d` (2023-10-30)](https://github.com/damus-io/damus/commit/d2bb013db7d2a1d1161b524a4a5c35b0c7fa94e9) のメッセージは目的を明言している。

> Depending on user's locale. currently only supported for Japanese users. This change allows Japanese users to automatically connect with popular Japanese regional relays during account creation, thus allowing Japanese users to better connect with the Japanese Nostr community.

**地域別既定リレーは Damus が日本語圏のために最初に導入した機能であり、その後タイ・ドイツに拡張された。** 日本語圏は Nostr の地域コミュニティのなかで最も早く既定リレーの分離を要求した集団である、と言える。

### 4.2 リレー運営者自身の記述（NIP-11 実測、2026-08-01）

| リレー | `name` | `description` | 運営者 pubkey |
|---|---|---|---|
| `yabu.me` | やぶみ 🏹📨 | **"Aggregator relay for (mainly) Japanese users."** | `b707d6be7f...5a0c20` |
| `directory.yabu.me` | やぶみ電話帳 | **"Nostr directory service"** | `b707d6be7f...5a0c20`（同一） |
| `r.kojira.io` | kojirelay | "kojira's japanese relay" | — |
| `relay-jp.nostr.wirednet.jp` | relay-jp.nostr.wirednet.jp | （自己言及のみ） | contact: `kirino.minato+relay-jp@gmail.com` |

**`yabu.me` は運営者自身が「主に日本語話者のためのアグリゲータリレー」と名乗っており、`directory.yabu.me` は同一運営者の「ディレクトリサービス」である。** これが第 3 章の被覆率の裏付けになる — アグリゲータが日本語圏の投稿を集め、ディレクトリがその著者の `kind:0` / `kind:10002` を索引している。**4 クライアント（Damus / Rabbit / nostter / Snort-めく）が独立に yabu.me 系を積んでいる**ことと合わせて、「日本語圏が集中している」という主張は一次情報で裏が取れている。

---

## 5. 選定原則と失敗様式

### 5.1 実際に使われている選定原則

ソースから読み取れた原則を、明示されている順に。

1. **地理／言語コミュニティ**（Damus, Rabbit, nostter, Snort-めく）— 唯一、コード上に明示的な分岐として実装されている原則。
2. **役割の分離**（Amethyst, Coracle, noStrudel, Snort, nostter, NDK）— 「一般リレー」と「インデクサ」を別リストにする。第 2.2 節。
3. **有料／AUTH 必須リレーを外す**（Nostur の `penaltybox`、arthurfranca の issue #1607 コメント）— 有料リレーは非会員の `kind:10002` を持たない。
4. **ハブへの集中を意図的に薄める**（welshman の `log(weight)`、Nostur の `skipTopRelays: 3`、Amethyst の pubkey ごと決定的シャッフル）— **3 実装が独立に、人気リレーへの負荷集中を明示的に避ける仕組みを入れている。**
5. **自社リレーを混ぜる**（YakiHonne, Primal, Snort）— streets には該当しない。
6. **稼働実績**（welshman / applesauce / Nostur / Amethyst の失敗追跡）— 静的な選定ではなく実行時の降格。

**採用されていない原則**: NIP-66 による選定（誰もやっていない）、NIP-11 の `supported_nips` による自動判定（仕様から根拠が消えた）。

### 5.2 既定リレーの選定を誤ったときに起きること

| 失敗様式 | 根拠 |
|---|---|
| **リストが腐る** | nostter の `nrelay-jp.c-stellar.net` が 502（実測）。既定リレーは書いたら終わりではない |
| **有料／制限つきリレーを入れる** | `nostr.wine` は `payment_required: true`, `restricted_writes: true`（実測）。非会員の `kind:10002` を持たない可能性が高い |
| **`max_subscriptions` が小さいリレーをマルチカラムで使う** | `relay-jp.nostr.wirednet.jp` は 8、`nos.lol` は 20、`nostr.bitcoiner.social` は 20（実測）。streets は 10 カラム想定（ADR-0011）で、これらは容易に上限に当たる |
| **短時間の集中アクセスで切られる** | `relay.damus.io` への `kind:10002` 連続問い合わせが WebSocket エラーになった（実測、確証なし）。ブートストラップはまさにこの形のアクセス |
| **用途違いのリレーを入れる** | `indexer.coracle.social` は `kind:0` を返さない（実測）。`filter.nostr.wine` / `purplepag.es` は Nostur が `SPECIAL_PURPOSE_RELAYS` として Outbox から除外している |
| **replaceable の旧版が混ざる** | `purplepag.es` は同一著者の複数版を返す（実測）。`created_at` で選ばないとルーティング表が古い情報で埋まる |
| **CORS で NIP-11 が取れない** | **実測した 17 本すべてで `*` が返り、問題は起きなかった。**（ADR-0014 の「失敗しても `undefined` を返す」設計は依然正しいが、既定リレーの選定基準としては効かない） |
| **全新規ユーザーが同じ数本を叩く** | welshman・Nostur・Amethyst が独立に対策を入れている（5.1 の 4）。実害の観測はできていないが、3 実装が対策していること自体が根拠 |

### 5.3 収束は良いことか

`relay.damus.io` / `nos.lol` / `purplepag.es` は事実上どのクライアントにも入っている（第 2.1 節の表）。これは:

- **良い面** — データがある可能性が高い。実測でも `nos.lol` は日本語圏で 82%、`kind:0` 92% と汎用として強い。
- **悪い面** — staab 本人が issue #1983 で「中央集権的で暗黙的」と認めている。実測でも `relay.damus.io` が集中アクセスで不安定、`purplepag.es` が日本語圏で 49% しかない、と**通念が実測と一致しない**ケースが出た。

**「みんなが入れているから入れる」は、streets の主な想定利用者（日本語圏）にとって最適とは限らない、というのが本調査の結論。**

---

### 5.4 `max_subscriptions` は除外基準ではなくスケジューリングの入力

初版はリレーの `max_subscriptions` が小さいことを既定リレーから外す理由として扱ったが、これは誤りだった。NIP-01 の該当箇所を直接確認した結果を残す。

| `01.md` の行 | 内容 |
|---|---|
| 109 | クライアントは **1 リレーにつき WebSocket 1 本**を開き、全購読をそれで賄うべき |
| 118 | `["REQ", <subscription_id>, <filters1>, <filters2>, ...]` — **1 つの REQ に複数フィルタを載せられる** |
| 147 | 複数フィルタは **OR 条件**として解釈される |
| 149 | `limit` は**フィルタごと**に効き、初回クエリのみ有効 |
| **157** | **`["EOSE", <subscription_id>]` — EOSE は購読単位であってフィルタ単位ではない** |
| **137** | 同じ `subscription_id` で REQ を送り直すと**古い購読は置換される** |

つまり、同一リレーへ向かう 10 カラム分のフィルタを 1 つの REQ にまとめれば、消費する購読枠は 10 ではなく 1 になる。`limit` はフィルタごとに効くのでカラムごとの件数指定も保たれる。**購読数はカラム数に比例しない。**

ただし代償が 2 つある。どちらも streets の既存の決定に直接効く。

1. **EOSE の粒度が失われる。** EOSE は購読単位なので、10 カラムを 1 購読にまとめると EOSE も 1 回しか来ない。どのカラムが読み終わったかが分からず、[ADR-0015](../adr/0015-section-status-excludes-renderer-fetches.md) の `phase`（`initial` / `streaming` / `settled`）をセクションごとに解決できなくなる。まとめたグループは**最も遅いカラムに合わせて一斉に settled になる**。
2. **グループの変更が破壊的になる。** 同じ `subscription_id` への REQ は置換なので、1 カラムを閉じるにはグループ全体を張り直すことになる。他のカラムは初回クエリを再配信され、`phase` も巻き戻る。カラムの生死が互いに結合する。

**両立させる形はある。** 初回取得と定常ストリーミングを分けること。

- **初回取得中**は EOSE の粒度が要るのでカラムごとに購読を分ける。`max_subscriptions` を超える分はキューに積んで順に流す。
- **settled 後**は EOSE がもう要らないので、そのリレー向けの購読を 1 本にまとめて張り替える。

こうすると定常状態の購読数はリレーあたり約 1 本に落ち、`max_subscriptions` が効くのは初回取得中だけになる。そこはキューイングで吸収できる。

**したがって `max_subscriptions` はリレーを除外する基準ではなく、初回取得の並列度を決めるスケジューリングの入力である。** 実装は接続プールの計画（後続 #3）で扱う。

## 6. 推奨 — streets が積むべき既定リレー

### 6.1 まず、1 つのリストにしない

ADR-0016 は「ユーザー自身の read relay + 既定リレー」と書いているが、**「既定リレー」を 2 種類に分けることを推奨する**。第 2.2 節のとおり、成熟したクライアントは全員この分離に到達している。

| 名前 | 用途 | 使われる場面 |
|---|---|---|
| **`BOOTSTRAP_INDEXERS`** | `kind:10002` と `kind:0` を引く専用経路 | ADR-0016 のウォームアップ、未知の著者に遭遇したとき |
| **`FALLBACK_RELAYS`** | `kind:10002` が無い／引けない著者の投稿を取りに行く先 | `unroutableAuthors` に計上される著者の暫定送信先 |

分ける理由は 3 つ。① `indexer.coracle.social` のように `kind:10002` しか返さないリレーがあり、汎用フォールバックには使えない（実測）。② インデクサは「短時間に大量の著者を一括で問い合わせる」使い方をするので `max_subscriptions` より `max_limit` と応答速度が効く。③ ADR-0011 の 30 接続上限のもとで、この 2 つは別の予算を持つべき（インデクサは起動時に一瞬使い、フォールバックは常時つながる）。

### 6.2 具体案

```ts
// kind:10002 / kind:0 を引く専用経路（ADR-0016 のブートストラップ）
const BOOTSTRAP_INDEXERS = [
  "wss://directory.yabu.me/",       // 日本語圏 87% / kind:0 99% / 101ms（実測）
  "wss://profiles.nostr1.com/",     // kind:0 98% / kind:10002 82%（実測）
  "wss://indexer.coracle.social/",  // kind:10002 専用インデクサ 80%（実測）
  "wss://purplepag.es/",            // 事実上の標準。日本語圏では弱いが慣性がある
];

// kind:10002 が引けない著者の投稿を取りに行く先
const FALLBACK_RELAYS = [
  "wss://yabu.me/",                 // 日本語圏アグリゲータ（運営者自己記述）
  "wss://nos.lol/",                 // 汎用。日本語圏 kind:0 92%（実測）
  "wss://relay.damus.io/",          // 汎用。最も広く使われている
];
```

**locale による追加は行わない。** Damus / Rabbit / nostter は `ja` 判定で日本向けリレーを足しているが、streets は逆に**日本語圏に強いリレーを最初から既定に含め、locale 分岐を持たない**ほうがよい。理由:

- 分岐は「日本語 locale でない日本語話者」（英語 OS を使う開発者など、ADR-0001 の想定利用者に多い）を取りこぼす。
- `directory.yabu.me` はグローバル母集団でも最良だった（37%、実測）。日本語圏に効くリレーがグローバルで足を引っ張らない。
- 分岐は設定項目の組み合わせ爆発（architecture.md の「未決定 2」）の第一歩になる。

### 6.3 各選定の根拠

| リレー | 採用理由 | 種別 |
|---|---|---|
| `directory.yabu.me` | 日本語圏の `kind:10002` 被覆 **87%（測定した全リレーの和集合と同値）**、`kind:0` 99%、応答 100ms 前後。運営者が「Nostr directory service」と自己記述。**Amethyst と nostter が独立にインデクサリストへ採用済み** | インデクサ |
| `profiles.nostr1.com` | `kind:0` 98% / `kind:10002` 82%（実測）。Amethyst のインデクサリスト所属。`max_limit: 10000` と大きく一括問い合わせ向き | インデクサ |
| `indexer.coracle.social` | NIP-11 で `supported_nips: [65]` を申告する **`kind:10002` 専用インデクサ**。Coracle・noStrudel・Amethyst の 3 者が採用。日本語圏 80% | インデクサ |
| `purplepag.es` | NDK・Coracle・noStrudel・Snort・Nostur・Amethyst・nostter が採用する事実上の標準。**日本語圏では 49% と弱く単独では不十分だが**、他クライアントが `kind:10002` を publish する先でもあるため、ここにしか無い著者が存在しうる | インデクサ |
| `yabu.me` | 運営者自己記述「Aggregator relay for (mainly) Japanese users.」。Damus・Rabbit・nostter・Snort-めく が採用。`kind:10002` が無い日本語圏の著者の投稿はここにある可能性が最も高い | フォールバック |
| `nos.lol` | 日本語圏サンプルで `kind:0` 92% / `kind:10002` 82%。Snort-めく が日本語ビルドに入れている数少ないグローバルリレー | フォールバック |
| `relay.damus.io` | 最も広く既定に採用されている（本調査の 6 クライアント）。`max_subscriptions: 200` と余裕がある | フォールバック |

**意図的に外したもの。**

- **`nostr.wine`** — `payment_required: true`, `restricted_writes: true`（実測）。有料リレーは非会員の `kind:10002` を持たない（issue #1607 の arthurfranca の指摘）。
- **`relay.nostr.band`** — 計測地点から 2 回タイムアウト（実測）。Snort の `MetadataRelays` に入っているが、確認できない以上は入れない。
- **`user.kindpag.es`** — 日本語圏 21%、`kind:0` 23%（実測）。`purplepag.es` と同系列でありながら被覆が明確に劣る。
- **`relay-jp.nostr.wirednet.jp` / `relay.nostr.wirednet.jp`** — 日本語圏で 3 クライアントが採用しているが、**`max_subscriptions` が 8 / 16 と小さく、10 カラム前提の streets には構造的に合わない**（実測）。かつ被覆は 48% で `directory.yabu.me` に大きく劣る。**ユーザーが手動で追加できるようにはすべきだが、既定には入れない。**
- **`r.kojira.io`** — 日本語圏 78%、`max_subscriptions: 100` と条件は良い。`directory.yabu.me` と `nos.lol` で被覆が飽和するため今回は外したが、**`directory.yabu.me` が使えなくなったときの第一候補**。
- **`nrelay-jp.c-stellar.net`** — 502（実測）。
- **`relay.primal.net`** — 日本語圏 24%（実測）。Primal 自身がクライアントから既定リレーをハードコードしていない。

### 6.4 併せて実装すべきこと

既定リレーの選定だけでは足りない。実測で判明した以下は実装要件として扱うべき。

1. **`kind:10002` は pubkey ごとに `created_at` 最大を採る。** `purplepag.es` が複数版を返す（3.4 節）。fake リレーのテストケースに入れる。
2. **リレーごとの `max_subscriptions` を尊重する。** NIP-11 は既に `RelayInfoRegistry` で取っている（ADR-0014）。`limitation.max_limit` を超える `limit` を送らないのと同様に、`max_subscriptions` を超える購読を張らない。既定リレーは全部 20 以上だが、ユーザーが追加するリレーは 8 のものもある。
3. **失敗したリレーを降格する。** welshman・applesauce・Nostur・Amethyst の 4 者が全員持っている。streets は現状 [ADR-0021](../adr/0021-reconnection-policy.md) が proposed のままなので、接続プールの実装と同じ計画で入れる。
4. **ルーティング表の永続化はイベントキャッシュで代用できないか検討する。** ADR-0016 が「新しい永続化要件」としたものは、welshman / applesauce では `kind:10002` が普通のイベントとして IndexedDB に載ることで実現されている（2.3 節）。ADR-0018 の 2 バケットのどちらに入れるかを決めれば済む可能性がある。
5. **`kind:10006`（ブロックリレーリスト）を既定リレーより優先する。** welshman が実装済み。ユーザーが明示的に拒否したリレーに既定として繋ぐのは避ける。

### 6.5 検証できなかったこと

**このリストは 2026-08-01 の 1 回の計測に基づく。以下は確認していない。**

- **サンプルの代表性。** 日本語圏サンプルは `yabu.me` の直近 `kind:1` から作った 100〜129 人。`yabu.me` に書かない日本語話者は含まれていない。**`directory.yabu.me` が有利に出るバイアスが構造的に存在する**（同一運営者のアグリゲータからサンプルを取っているため）。より中立な母集団での再測定が望ましい。
- **`relay.damus.io` の接続エラーの原因。** レート制限と推測したが確証はない。計測地点（日本の家庭回線）固有の可能性を排除できていない。
- **`relay.nostr.band` のタイムアウト。** 同上。リレーが落ちていると断定していない。
- **フォロー 500 人以上の単一クエリ。** サンプルを 391 人しか集められず、300 までしか確認できていない。ADR-0016 の「1 クエリでウォームアップ」がフォロー 1000 人規模で通るかは未検証。
- **`directory.yabu.me` への書き込み可否。** NIP-11 に `auth_required` / `restricted_writes` の申告が無く、実際に publish して試すことはしなかった。**自分の `kind:10002` をここに広める（NIP-65 の Discoverability）ことができるかは未確認。**
- **Coracle の本番既定リレー。** リポジトリの `.env.template` は読めるが、`app.coracle.social` のビルドは Render の環境変数で上書きされうる。表の値はテンプレートの値であって稼働中の値ではない。
- **Primal の既定リレー。** `get_default_relays` はキャッシュサービスがサーバ側で返すため、ソースからは読めない。
- **Amethyst の全体接続数上限。** grep で見つからなかったが、不在の証明にはならない。
- **`kind:10086`（Indexer relays）の行方。** PR #1985 は 2025-07 から open のまま。Amethyst と applesauce が先行実装しているが、マージされるか、kind 番号が変わるかは不明。**streets が対応するのは尚早。ただし既定リレーを「インデクサ」と「フォールバック」に分けておけば、後から `kind:10086` を読むだけで対応できる形になる。**
- **各リレーの運営体制・資金・継続性。** 一切調べていない。既定リレーの最大のリスクは技術ではなく継続性だが、本調査はそこに触れていない。

**このリストは半年で腐る前提で扱うこと。** nostter の `nrelay-jp.c-stellar.net`（502）と Damus の `eden.nostr.land → nostr.land` 改名（[`ada99418`, 2024-04-12](https://github.com/damus-io/damus/commit/ada99418)）が実例。**第 3 章の計測手順は数十行のスクリプトで再現できるので、既定リレーを触るときは必ず測り直すこと。**
