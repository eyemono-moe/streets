# Nostr クライアントは何を最適化しているのか

リレーからイベントを取るだけなら難しくない。
WebSocket を開いて `["REQ", id, filter]` を送り、返ってきた `EVENT` を並べれば動く。
そのコードは 50 行で書ける。

難しくなるのは掛け算が始まってからである。
カラムが 5 本、著者の write リレーが 1 人あたり 3 本、1 ノートにつきプロフィールとリアクションと返信数。
このどれもが単独では小さいのに、掛けると数百本の REQ と数十本の WebSocket になる。

ここでは、その掛け算をどこで断ち切るかという観点で、既存の Web クライアントとライブラリの実装を並べる。
軸は 7 つある。
最初の 4 つは接続と購読とイベント取得の数を減らす話で、残る 3 つはブラウザ側の資源の話である。

## 比較する実装

| 実装 | 種別 | データ層 | 永続化 | 署名検証 |
|---|---|---|---|---|
| [rx-nostr](https://github.com/penpenpng/rx-nostr) | ライブラリ | RxJS のストリームのみ | 無し | Web Worker へ委譲可 |
| [NDK](https://github.com/nostr-dev-kit/ndk) | ライブラリ | キャッシュアダプタ | Dexie / SQLite / Redis | 呼び出し側 |
| [applesauce](https://github.com/hzrd149/applesauce) | ライブラリ | `EventStore` | nostr-idb / SQLite | 差し替え可 |
| [welshman](https://github.com/coracle-social/welshman) | ライブラリ | `Repository` | 呼び出し側 | 差し替え可 |
| [nostter](https://github.com/SnowCait/nostter) | クライアント | rx-nostr + 自前 store | Dexie | Web Worker |
| [Jumble](https://github.com/CodyTseng/jumble) | クライアント | 自前（`ClientService`） | IndexedDB（20 ストア） | nostr-wasm |
| [noStrudel](https://github.com/hzrd149/nostrudel) | クライアント | applesauce | nostr-idb / SQLite | nostr-wasm |
| [Coracle](https://github.com/coracle-social/coracle) | クライアント | welshman | idb | welshman |
| [Damustr](https://app.damustr.com) | クライアント | 自前（全部） | 無し | noble（同期） |
| [Primal](https://github.com/PrimalHQ/primal-server) | クライアント | キャッシュサーバ | サーバ側 | サーバを信頼 |
| streets | クライアント | 自前（`EventStore`） | IndexedDB | noble（同期） |

Damustr については公開されているソースが見つからなかったため、配信されている JavaScript を読んで書いている。
Svelte 5 で書かれ、Nostr 部分は依存ライブラリを持たない自前実装で、暗号だけ noble を使っている。
Primal は他と性格が違い、自前のキャッシュサーバがリレー群からイベントを集めて保持し、クライアントはそのサーバ 1 台と話す。
以下の軸のほとんどが、Primal ではサーバ側の問題になる。

## 軸 1: WebSocket 接続数

Outbox（NIP-65）を採ると、1 つの論理クエリが著者ごとに別のリレーへ分かれる。
フォロー 500 人のタイムラインは、リレー 30 本への 30 本のクエリになりうる。
カラムが増えれば掛かるが、接続だけは URL 単位で共有できる。

**全ての実装が、URL ごとに WebSocket を 1 本にして共有している。**
違うのは、いつ開いていつ閉じるかと、上限を持つかどうかである。

| 実装 | 開くタイミング | 閉じるタイミング | 上限 |
|---|---|---|---|
| rx-nostr | `lazy` / `lazy-keep` / `aggressive` から選ぶ | 戦略次第 | 無し |
| applesauce | 購読が要求したとき | 参照が 0 になって `keepAlive` 経過後 | 無し |
| Jumble | `ensureRelay(url)` で必要時 | 明示的に閉じる | 無し |
| Damustr | `Map<url, 接続>` で必要時 | 明示的に閉じる | 無し |
| streets | `ConnectionPool` が必要時 | 明示的に閉じる | 30 本 |

applesauce の閉じ方は RxJS の書き方で表されている。
ソケットは `share({ resetOnRefCountZero: () => timer(keepAlive) })` で共有された 1 本の Observable であり、購読者が 0 になってから `keepAlive` の時間が経つと初めて切れる。
カラムを閉じてすぐ開き直しても、その間に接続が落ちない。

表の「無し」は、ソースを読んで見つけられなかったという意味であり、存在しないことを確かめたわけではない。
そのうえで、接続数の上限を持っていると読み取れたのは streets だけだった。
30 という数字を先に決め、著者をまだ被覆していないリレーから貪欲に選び、予算を超えて開けなかったリレーは `uncoveredAuthors` として数える。
他の実装は、リレーリストが大きい利用者では接続数が青天井になる。

再接続はどこも指数バックオフである。
Damustr は初回 2 秒で上限 60 秒、rx-nostr は初回 1 秒で最大 5 回、streets は初回 1 秒で上限 60 秒かつ回数制限を設けていない。

## 軸 2: subscription 数

1 本の WebSocket に何本の REQ を張れるかは、リレーが NIP-11 の `limitation.max_subscriptions` で宣言する。
多くのリレーは 20 から 50 の間である。
上限を超えると、リレーは古い購読を切るか新しい REQ を拒否する。

**この軸で最も踏み込んでいるのは NDK である。**
`filterFingerprint(filters, closeOnEose)` がフィルタの「キーの形」から指紋を作り、指紋が一致する購読だけを束ねる。
`since` と `until` は値まで指紋に含める（時間の制約が違うものを混ぜないため）。
`closeOnEose` の有無も `+` の接頭辞で分ける（すぐ閉じる購読と張りっぱなしの購読を混ぜないため）。
既定は `groupable: true`、`groupableDelay: 10`、`groupableDelayType: "at-most"` なので、コンポーネントが個別に呼んだ `subscribe` が 10ms 窓で勝手にまとまる。

そして `mergeFilters` は、**`limit` を持つフィルタを束ねない。**

```ts
// concatenate filters that have a limit
filters.filter((f) => !!f.limit).forEach((filterWithLimit) => result.push(filterWithLimit));
// only merge the filters that don't have a limit
filters = filters.filter((f) => !f.limit);
```

`limit: 30` の 2 本を `limit: 30` の 1 本に畳むと、どちらのカラムも 30 件を受け取れなくなる。
NDK はそれを避けて、`limit` 付きは別の REQ として送る。

他の実装の答えは次のとおり。

- **nostter** は `Nip11Registry.setDefault({ limitation: { max_subscriptions: 20 } })` を置き、リレーが宣言していなければ 20 とみなす。加えて、関連イベントの取得を長命な REQ 3 本に集約している（軸 3）。
- **welshman** の `makeLoader` は 30ms の batcher でリクエストを溜め、リレーごとに `unionFilters` して 1 本の REQ にする。
- **Jumble** は `(リレー集合, フィルタ)` をキーにタイムラインをキャッシュする。同じキーの購読が再び要求されたら、購読を作り直さずキャッシュを返し、`since = 最新 + 1` で差分だけ取りに行く。
- **Damustr** は束ねない。`.subscribe([{ kinds: ... }])` の呼び出しが 37 箇所あり、そのどれもが独立した REQ になる。1 本のソケットに多重化されるだけである。

Jumble のキーが `(リレー集合, フィルタ)` である点は見逃せない。
フィルタだけをキーにすると、同じフィルタで取得先だけ違うカラムが同じものとして扱われる。
Jumble はリレー集合をキーに含めているので、その取り違えが起きない。

## 軸 3: 関連イベントの N+1

タイムラインに 50 件のノートが並び、著者が 10 人いる。
各ノートには著者のプロフィール、リアクション数、返信数、引用元のノートが要る。
素直に書くとノート 1 件につき REQ が数本増え、50 件で数百本になる。

**掛け算がいちばん大きいのはここで、どの実装もここには明示的な仕組みを持っている。**

nostter の作りが最も整理されている。
関連イベントのための長命な REQ は 3 本だけである。

| REQ | 対象 |
|---|---|
| `metadataReq` | `kinds: [0]`、著者の pubkey |
| `referencesReq` | `ids`、`e` タグと `q` タグと本文中の note / nevent |
| `replaceableEventsReq` | `a` タグ（kind と pubkey、必要なら `#d`） |

どれも `bufferTime(1000, null, 10)` を通す。
1 秒経つか 10 回溜まるかのどちらか早い方でまとめ、rx-nostr の `batch()` がフィルタを 1 つに畳む。
溜める前に、すでに store にあるものは除外する。
配列が長くなりすぎないよう `chunk(pubkeys, 1000)` で切り、チャンクの合間に `await sleep(0)` で UI スレッドを譲る。

nostter にはもう 1 段ある。
`e` タグにリレーヒントが付いているとき、まず既定のリレーへ投げ、5 秒経ってもそのイベントが store に現れなければ、ヒント先のリレーへだけ投げ直す。
ヒントを最初から使わないのは、ヒント先が既定のリレー集合の外にあると接続が 1 本増えるからである。

他の実装の答え。

- **Jumble** は Facebook の `DataLoader` をそのまま使う。`batchScheduleFn: (cb) => setTimeout(cb, 50)` で 50ms 窓、`cacheMap` に Promise を入れるので同じ id は 1 回しか飛ばない。
- **NDK** は軸 2 のグルーピングがそのまま答えになる。個々のコンポーネントが `subscribe` を呼んでも 10ms 窓で束ねられるので、呼び出し側は N+1 を意識しなくてよい。
- **applesauce** は用途別のローダを揃えている（`address-loader`、`event-loader`、`reactions-loader`、`zaps-loader`、`tag-value-loader` など）。
- **Damustr** は著者をまとめて `{ kinds: [0], authors: [...], limit: authors.length }` を投げ、5 秒後に閉じる。ただしリレーごと、kind ごとに別の REQ になるので、リレー 5 本なら kind:0 と kind:10030 で 10 本になる。
- **streets** は 200ms 窓のコアレッサを kind:0 専用に持つ。50 件のノートに 10 人の著者が出る画面で、実際に出た REQ は 1 本だった。

Damustr には他に無い仕組みが 1 つある。
イベント取得のキャッシュが、**見つからなかったことも 10 秒だけ覚える。**
値が入っていれば無期限にヒット扱い、`null`（引いたが無かった）なら 10 秒で捨てて再取得する。
削除されたノートを引用しているノートが並んだときに、同じ REQ を無限に投げ続けないための一手である。

## 軸 4: 重複配信と署名検証

Outbox では同じイベントが複数のリレーから届く。
1 件ごとに schnorr 検証をすると、重複の分だけ無駄が出る。
検証は数十から数百マイクロ秒かかるので、50 件 × 5 リレーでは体感に届く。

答えは 2 つの層に分かれる。

**どこで検証するか。**

| 実装 | 検証の置き場 |
|---|---|
| nostter | Web Worker（rx-nostr の verification service） |
| Jumble / noStrudel | `nostr-wasm`（WASM 実装） |
| Damustr / streets | メインスレッドで同期 |

**重複をどう記録するか。**

nostter の `createTie` は `Map<eventId, Set<relayUrl>>` を 1 つ持ち、通過するパケットに `seenOn` と `isNew` を付ける。
welshman の `Tracker`、Jumble の `externalSeenOn`（上限 10,000 件）、applesauce の `EventStore`（同じイベントのインスタンスを 1 つに保つ）が同じ役割を果たす。

streets はここで一手加えている。
`EventStore.put` は、既知の id が再配送されたとき **id を再計算するだけで schnorr 検証を走らせない。**
id はイベント本文のハッシュなので、再計算が一致すれば内容が同じことは確定する。
既知の id を騙る偽造ペイロードはここで落ち、コストは JSON パースと Map 参照だけになる。

「どのリレーで見たか」を捨てないのは、単なる診断のためではない。
返信を投稿するときのリレーヒント、スレッドの祖先を引くときの取得先、`seenOn` の表示に使う。
重複配信は無駄ではなく、経路の情報でもある。

## 軸 5: 読み込み状態と失敗の区別

カラムが空のとき、まだ来ていないのか、本当に 0 件なのか、取りに行けなかったのかを区別したい。
EOSE は購読単位のイベントであって、カラム単位でも画面単位でもない。
Outbox では 1 カラムが N 本の REQ に割れるので、「全部の EOSE を待つ」と最も遅いリレーに引きずられる。

**そこで各実装は閾値とタイムアウトを入れている。**

| 実装 | 完了の判定 |
|---|---|
| Jumble | サブリクエストの半数が EOSE したら一度返し、全部揃ったら完了フラグを立てる。`eoseTimeout` は 10 秒 |
| welshman | リレー集合のうち `threshold` の割合が閉じたら解決。汎用の `load` は 0.5 とタイムアウト 3 秒、検索は 0.1 |
| NDK | 全 EOSE かクエリ充足で確定。揃わなければ EOSE 到達率に応じて縮む待ち時間で打ち切る |
| nostter | rx-nostr の `eoseTimeout` に 5 秒 |
| streets | 待っている全リレーが完了したら `settled`。到達不能なリレーは待ち対象から外す |

NDK の打ち切りは条件が細かい。
基準の待ち時間は 1 秒で、EOSE を返したリレーの割合だけ短くする。
作動するのは 2 本以上かつ 50% 以上が返してからで、直近 20ms 以内にイベントが届いていれば「まだ流れている」と見て延長する。

Jumble の返し方は 2 段階になっている。
半数が EOSE した時点で `onEvents(events, false)` を呼び、全部揃ったら `onEvents(events, true)` を呼ぶ。
UI は最初の呼び出しで中身を出し、2 回目でローディング表示を消せる。

失敗の伝え方は実装で差が大きい。
welshman は `onEose`、`onClosed(reason, url)`、`onDisconnect(url)`、`onInvalid`、`onFiltered`、`onDuplicate`、`onDeleted` を別々のコールバックに分けている。
NDK は `closed` イベントで `(relay, reason)` を渡す。
nostter は `createAllMessageObservable()` を `filterByType('CLOSED')` と `filterByType('NOTICE')` で濾してログに出す。
streets は `unreachableRelays` と `unroutableAuthors` と `uncoveredAuthors` を数として型に出す。

Damustr はここを持っていない。
`onEose: () => {}` が 17 箇所あり、タイムラインは EOSE と結び付いたローディング状態を持たない。
スレッドの読み込みだけは Promise で書かれていて、見つからなければ 1.5 秒待って 2 回まで再試行し、`loading` と `resolved` のフラグを立てる。

## 軸 6: メモリと描画件数

保持しているイベント数と、DOM に出している件数は別の問題である。
前者はメモリを、後者は描画時間を決める。

**nostter はこの 2 つを明示的に分けている。**

- `eventsStore`（受け取った全部の配列）と `eventIdSet`（重複判定）
- `eventsForView`（表示用、`$state.raw`）

`eventsForView` は `maxTimelineLength = 50` で切られ、`newer()` と `older()` がその窓を配列の上でずらす。
`reduce()` は `minTimelineLength = 25` まで戻す。
描画そのものは `virtua` で仮想化される。

Jumble はすべてのキャッシュに上限を定数で持っている。

```ts
const EVENT_CACHE_MAX_SIZE = 10_000
const REPLACEABLE_EVENT_CACHE_MAX_SIZE = 5_000
const PROFILE_CACHE_MAX_SIZE = 5_000
const SEEN_ON_CACHE_MAX_SIZE = 10_000
const TIMELINE_CACHE_MAX_SIZE = 200
const TIMELINE_MAX_REFS = 2_000
```

構造も踏み込んでいる。
タイムラインが持つのは `refs`（イベント id と `created_at` の組）だけで、本体は別の `eventCacheMap` にある。
タイムラインを 200 本キャッシュしてもイベント本体が 200 倍にならない。

Damustr は 2 つの仕組みを持つ。
配列を `length = 50` で切り詰める関数と、上限 200 件で古い順に捨てる Map である。
どちらも小さいが、上限があること自体は他の自前実装と同じ判断になっている。

applesauce は参照カウントで解いている。
`addClaim` と `removeClaim` があり、どのモデルからも claim されていないイベントを落とせる。
モデルを購読している間だけイベントが生き残る形なので、カラムを閉じれば自然に解放される。

streets はカラムあたり 200 件で切り、本体は共有の `EventStore` に置く。
どこからも参照されなくなったイベントを落とす仕組みはまだ無い。

## 軸 7: 永続化とコールドスタート

IndexedDB に何を置くかは、置かない判断も含めて実装ごとに大きく違う。

**nostter の方針が最も絞られている。**
Dexie に保存するのは、**フォローしている人の replaceable イベントだけ**である。
キーは `[kind + pubkey]` で最新の 1 件だけを持ち、フォローを外した人の分は `prune` で消す。
タイムラインのイベントは保存しない。

これは効く場所を選んだ判断である。
起動直後に必ず要るのはフォロー中の人のプロフィールで、その量はフォロー数で上限が決まっている。
タイムラインは保存しても次に開いたときには古くなっている。

Jumble は反対に、20 個の object store を使い分ける。
replaceable なイベントは kind ごとに専用のストア（プロフィール、リレーリスト、フォローリスト、ミュートリスト、ブックマークなど）を持ち、それぞれ最新の 1 件だけを保持する。
フィードのイベントは 1 つの `EVENTS` ストアにまとめる。
復帰時はキャッシュを先に画面へ返し、`since = 最新 + 1` にして差分だけ取りに行く。

noStrudel は `nostr-idb` と `applesauce-sqlite` の両方を持つ。
Coracle は `idb` を使う。
Damustr は永続キャッシュを持たない（配信されている JavaScript に `indexedDB` の参照が 1 つも無い）。
streets は起動時に IndexedDB から 1 回だけ非同期で水和し、以後の読み取りは同期にする。

別の解として、リレーとの差分同期がある。
`applesauce-relay` には `negentropy.ts` があり、NIP-77 の差分同期に対応している。
手元にある集合とリレーが持つ集合の差だけを転送できるので、原理的にはコールドスタートの転送量をいちばん減らせる。
対応しているリレーはまだ限られる。

## 軸をまたいで見えること

実装の型は 3 つに分かれる。

**サーバに肩代わりさせる。**
Primal はキャッシュサーバがリレー群からイベントを集めて保持し、クライアントはそのサーバ 1 台と話す。
接続数も購読数も N+1 も、クライアント側では消える。
投稿だけは利用者が選んだリレーへ直接送る。
代わりに、そのサーバが全部を見せているかどうかを信頼することになる。
イベントは署名されているので改竄はできないが、隠されたことには気付けない。

**ライブラリのデータ層に乗る。**
noStrudel は applesauce、Coracle は welshman、nostter は rx-nostr の上に自前の store を重ねる。
掛け算を断ち切る仕組みはライブラリ側にあり、クライアントは方針を選ぶ。
nostter が `max_subscriptions: 20` と `lazy-keep` と Web Worker 検証を設定 1 箇所で選んでいるのがその形である。

**全部自前で持つ。**
Jumble、Damustr、streets はデータ層を自分で書いている。
上限も窓の幅も自分で決めることになるので、その数字がそのまま設計の性格になる。

そして、実装を並べて最も差が出たのは**数字を決めているかどうか**だった。

| 実装 | 明示的な上限と窓 |
|---|---|
| Jumble | イベント 10,000、replaceable 5,000、プロフィール 5,000、seenOn 10,000、タイムライン 200 本、refs 2,000、バッチ 50ms、EOSE 10 秒 |
| nostter | 表示 25 から 50、フィルタ配列 1,000、`limit` 500、フィルタ 10 本、購読 20 本、バッファ 1 秒/10 件、EOSE 5 秒 |
| streets | 接続 30、カラム 200 件、コアレッサ 200ms、通知バッチ 16ms |
| Damustr | 表示 50、キャッシュ 200 件、`limit` 30、負のキャッシュ 10 秒 |
| NDK | グルーピング 10ms、EOSE 待ち 1 秒（到達率で短縮） |
| welshman | バッチ 30ms、閾値 0.5、タイムアウト 3 秒 |

上限を持たない実装が壊れているわけではない。
だが上限が無ければ、負荷が上がったときにどこが先に壊れるかを予測できない。
接続数の上限を見つけられたのが 1 つだけだったのは、この軸がまだ問題として認識されていないことの表れかもしれない。

---

## 参考

- [NIP-01 Basic protocol flow description](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [NIP-11 Relay Information Document](https://github.com/nostr-protocol/nips/blob/master/11.md)
- [NIP-65 Relay List Metadata](https://github.com/nostr-protocol/nips/blob/master/65.md)
- [NIP-77 Negentropy Syncing](https://github.com/nostr-protocol/nips/blob/master/77.md)
- [rx-nostr](https://github.com/penpenpng/rx-nostr)
- [nostr-dev-kit/ndk](https://github.com/nostr-dev-kit/ndk)
- [hzrd149/applesauce](https://github.com/hzrd149/applesauce)
- [coracle-social/welshman](https://github.com/coracle-social/welshman)
- [SnowCait/nostter](https://github.com/SnowCait/nostter)
- [CodyTseng/jumble](https://github.com/CodyTseng/jumble)
- [hzrd149/nostrudel](https://github.com/hzrd149/nostrudel)
- [coracle-social/coracle](https://github.com/coracle-social/coracle)
- [PrimalHQ/primal-caching-service](https://github.com/PrimalHQ/primal-caching-service)
