# 読み取り層 — 繰延事項

第1スライス（単一リレーのセクション読み取り）と第2スライス（Outbox ルーティングと購読マネージャ）のレビューで実在すると判定されたが、そのスライスでは直さなかったもの。次の計画に着手する前にここを読むこと。

用語は [CONTEXT.md](../../CONTEXT.md)、決定は [docs/adr/](../adr/)、全体像は [architecture.md](./architecture.md)。

**採番についての注記。** この文書には「後続 #」で始まる参照が 2 系列混在している。**番号だけを見て同じものだと判断しないこと。**

| 系列 | どこに出るか | #4 が指すもの |
|---|---|---|
| この文書が独自に振った古い採番 | `EventStore` が公開オプションになっている節、および [ADR-0016](../adr/0016-routing-bootstrap.md) の Consequences | **永続化**（IndexedDB 水和・`EventStore` の内部化） |
| [ADR-0023](../adr/0023-centralized-subscription-manager.md)「実装の段階」が定める採番 | REQ マージの節と「解消済み」の各項 | **ローカルフィルタ照合**（#1 Outbox ルーティング、#3 接続プール、#5 REQ マージ） |

どちらも実在する採番であり、片方だけを訂正すると別の文書と食い違う。そのため両方をそのまま残し、この表で区別する。

この注記の初版は該当箇所を行番号で指していたが、**注記自身を挿入したことで全部 2 行ずれた**（2026-08-02 訂正）。散文中の行番号は編集のたびに腐るので、以後この文書では行番号ではなく節の内容で参照すること。

## 次の計画で直すべきもの

### `EventStore` が呼び出し側から渡される公開オプションになっている

[ADR-0018](../adr/0018-indexeddb-event-cache.md) は `EventStore` の seam 資格を明示的に取り消し（`EventStore は seam ではなく読み取り層の内部に降ろす`）、代わりに `EventPersistence` を seam とした。しかし現状は `SectionReader` と `createSection` の両方でオプションとして露出しており、**共有するかどうかを呼び出し側が決められる**。

第1スライスの Critical はまさにここから生まれた（共有 store で `put` が `"duplicate"` を返す経路）。IndexedDB 水和が入れば store は読み取り層のシングルトンになるほかない。

**着手時期は永続化の計画（後続 #4）の冒頭。** 当初は「呼び出し箇所が増える前に早く直すべき」としていたが、これは誤りだった。訂正の根拠は2つ。

1. **呼び出し箇所は #4 までは増えない。** `createSection` の呼び出しが増えるのはデッキとカラムを作る後続 #7 であり、これは永続化 #4 より後。#4 の時点でも呼び出し箇所は現在と同じ 1 つ（デバッグルートのみ）のままで、移行コストは今も #4 でも変わらない。
2. **今やると合成ルートを盲目的に設計することになる。** 読み取り層の合成ルートは最終的に `EventStore` に加えてルーティング表（#1）・接続プール（#3）・`EventPersistence`（#4）を一緒に抱える。中身が 1 つしか分かっていない段階で容器の形を決めると、残り 3 つを積んだ後に作り直すことになる。

なお `SectionReader` 側のオプションは残してよい。テストが `PassThroughStore` を注入する内部の seam として機能しており、外に出すべきでないのは `createSection` の公開インターフェースのほう。

**同じ計画で決める必要があること: 水和経路の検証をどうするか。** `put()` は挿入のたびに schnorr 検証する。IndexedDB のキャッシュを起動時に `put()` で流し込むと、キャッシュ全件を再検証することになり、[ADR-0011](../adr/0011-performance-budget.md) の「初回イベント表示 2 秒」がそれだけで埋まる。信用済み挿入の経路を足すかどうかは `put()` のシグネチャの話であり、永続化 #4 で決着させる。

### ~~`seenRelays` の帰属が検証されていない~~ — 2026-08-01 修正済み

`event-store.ts` の `"duplicate"` 経路が、ペイロードを照合する前に `seenRelays` へリレーを記録していた。悪意あるリレーは既知の ID を送るだけで、自分が配信していないイベントの提供者として記録された。

Outbox（後続 #1）が `seenRelays` をリレーヒントとして読み始める直前に修正した。`"duplicate"` 経路の push を `isNostrEvent(event) && computeEventId(unsigned) === event.id` で門番する。イベント ID は署名対象フィールドの sha256 であるため、**ID の再計算がそのままペイロードの照合になる**。schnorr を伴わないので、重複ごとの検証コスト（下記「直さないと決めたもの」で却下した方式）は発生しない。

`put` の戻り値は照合が失敗しても `"duplicate"` のまま。`SectionReader` は「`"rejected"` 以外＝ store がその ID を持っている」に依拠しており、ここで `"rejected"` を返すと既に保持している正規のイベントをセクションが取りこぼす。

### `reserved`（ブートストラップの予算迂回）が ADR-0025 の記述と食い違っている（接続プールの最終ブランチレビュー finding 9a）

[ADR-0025](../adr/0025-greedy-relay-selection-under-a-global-budget.md) と[設計仕様](../superpowers/specs/2026-08-01-connection-pool-design.md:104)は、ブートストラップのインデクサ（`BOOTSTRAP_INDEXERS`、4 本）を `pinned`（予算を消費するが決して落とされない）として扱うと書いていた。実装（`bootstrap.ts` / `ConnectionPool.subscribe()` の `{ reserved: true }`）はそうなっていない — インデクサは `selectRelays` の `pinned` に一切渡らず、`ConnectionPool.subscribe()` の予算チェック（`size >= maxConnections`）そのものを丸ごと迂回する**バイパス**である。ADR-0025 の該当段落は誤りとして訂正した（下記）。

**帰結は 2 つ。**

1. **ピーク同時接続数は `30 + |indexers|` = 34 になりうる。** Outbox の 30 本がすでに埋まった状態でウォームアップが始まると、インデクサ用の 4 本が予算チェックを迂回してそのまま上に乗る。**今日は到達しない** — デバッグルートがウォームアップ完了までセクションの開始そのものを遅らせているため、ウォームアップ開始時点で Outbox 側が 30 本を使い切っていることがない。ただし[設計仕様](../superpowers/specs/2026-08-01-connection-pool-design.md:111)が名指ししているとおり、未知の著者に遭遇して再ウォームアップする経路が入れば重なりうる。次の計画がこの経路を作るなら、34 という数を先に踏まえること。
2. **`pinned`（選択器の予算優先権）と `reserved`（プールの予算迂回）という、意味の違う 2 つの仕組みが同じ「30 接続」という数字について別々に主張している。** 1 つの数値に統一されていない。

**裁定（このスライスでは実装しない — 統合スライスがこのコードにどのみち触れるため）**: ドキュメントを実装に合わせて訂正し、数値を露出するところまでで止める。具体的には (a) 上記のとおり ADR-0025 の `pinned` 段落を訂正、(b) `ConnectionPool` に `reservedSize` アクセサを追加して「今バイパス経由で何本使われているか」を読めるようにする、(c) この 34 ピークの逸脱を到達条件つきでここに記録する（上記）。予算の再構成（`reserved` を `pinned` に統合する、あるいはその逆）は次の計画が 1 つの数値に対して行うこと。

### 死んだままのリレーが枠を永久に食いつぶす（接続プールの最終ブランチレビュー finding 9b）

`#onConnectionDied` はソケットの枠を解放するだけで、マネージャ側の状態には一切触らない: URL は `entry.opened` に残り続け、`currentSet`（粘着性）にも残り続け、`filtersEqual` は毎回このリレーをスキップする。`selectRelays` はそもそも「到達可能かどうか」という概念を持たないので、`replan()` のたびに同じ死んだ URL を何度でも選び直す。**リレーが本当に恒久停止した場合、そのリレーが担当していた著者は永久に暗転し、空いたはずの枠は誰にも使われない。**

これは「隠れた劣化」ではない — `unreachableRelays` として正直に報告され続けるので ADR-0011 の禁止事項には触れない（劣化そのものは起きているが、隠れてはいない）。[ADR-0021](../adr/0021-reconnection-policy.md) が「死亡・復帰は再選択の契機にしない」と意図的に決めたのは、瞬断のたびに churn を起こさないためであり、それ自体は瞬断に対して正しい判断である。ただしこの判断は恒久喪失には対処していない。

**次の計画への提案**: `selectRelays` に `degraded`（連続再接続失敗が N 回を超えた URL の集合）という入力を足し、貪欲選択のステップがその URL の枠を他へ回せるようにする。プール自身はそれでも `degraded` な URL への再接続を諦めずに回し続けてよい（ADR-0021 の「永久に諦めない」とは矛盾しない — 「選び直しの対象にするかどうか」と「再接続をやめるかどうか」は別の問い）。**このスライスでは実装しない。**

### 指数バックオフが実際には指数になっていない（e2e の docker 依存を外す作業中に発見、2026-08-02）

[ADR-0021](../adr/0021-reconnection-policy.md) は「初回 1 秒からの指数バックオフ、上限 60 秒」と決めており、`connection-pool.ts` の `#scheduleReconnect` はその通りに `RECONNECT_BASE_MS * 2 ** attempts` を計算する。ところが `#reconnect` は `this.#options.connect(url)` が返った直後に `pooled.attempts = 0` としている。**`connectRelay` は `new WebSocket(url)` を構築して即座に返る** — ソケットが開いたかどうかは一切見ていない（`websocket-relay-connection.ts:201`）。したがって恒久的に到達不能なリレーに対しても `connect()` は毎回「成功」し、`attempts` は毎回 0 に戻る。

**帰結: 指数は 2⁰ から伸びず、再接続は永久に 0.5〜1.5 秒間隔で回り続ける。** 30 本のリレーが同時に落ちた場合、ADR-0021 が防ごうとしていた「復帰時のバースト」ではなく「切断中ずっと毎秒 30 本のソケット構築が走り続ける」という、より高頻度な負荷になる。ジッタは効いているので同期はしないが、頻度そのものが下がらない。

隠れた劣化ではない（`unreachableRelays` は正直に立ち続ける）ので ADR-0011 の禁止事項には触れないが、ADR-0021 の記述と実装が食い違っている。

**次の計画への提案**: `attempts` のリセットを `connect()` の戻りではなく**実際に接続が開いた時点**（`RelayConnection` 側の open 通知、あるいは最初の EOSE / メッセージ受信）に移す。今は `RelayConnection` に open の seam が無いので、`onClose` と対になる通知を足すか、`#reconnect` でのリセットをやめて `onEose` 到達時にプール側で 0 に戻す形にする。**このスライスでは実装しない**（e2e の flake 修正の副産物として見つけたもので、修正は再接続方針そのものの変更にあたる）。

## 直さないと決めたもの（理由つき）

### `EventStore.put` で検証を重複判定より前に移すこと

Critical を塞ぐ別解だが、重複のたびに schnorr 検証が走る。Outbox では同一イベントが複数リレーから届くため、500 件 × 3 リレーで約 1,500 回の追加検証となり、[ADR-0011](../adr/0011-performance-budget.md) の「初回イベント表示 2 秒」を削る。**採用しない。**

### `websocket-relay-connection.ts` の `subId` / `eventId` の `typeof` ガード 4 箇所

タスクレビューは「`Map<string, _>` のキー意味論により到達不能なデッドコード」と判定したが、**ブランチ全体レビューがこれを覆した**。`Array.isArray(message)` が `message` を `any[]` に絞るため、これらのガードは信用できないリレーと `NostrEvent` の間に存在する唯一の検証である。**削除しないこと。**

## 小さいもの

| 箇所 | 内容 |
|---|---|
| `nip19.ts` | `LIMIT = 5000` は範囲外の TLV（`nevent`/`naddr`）を先取りした定数。無害、NIP-19 の計画でそのまま使う |
| `section-reader.ts` | `stop()` が `#items` / `#ids` を保持する。`createSection` からは到達しないが、公開メソッドとして意味が未文書。終局的と明記するか状態をクリアする |
| `section-reader.ts` | `start()` 内で `openRelay` が例外を投げた場合の経路がない。既に購読したリレーが漏れる。URL ごとに包んで `unreachable` にするほうが ADR-0011 に忠実 |
| `section-reader.ts` | `source.relays` の重複 URL が二重購読になり `unreachableRelays` を二重計上する |
| `section-reader.ts` | `#items` に store の内部オブジェクトを入れている。消費者が `items[0].content` を書き換えると全セクションの store が壊れる。水和が入る時点で `Object.freeze` かコピーを検討 |
| `websocket-relay-connection.ts` | ソケットが開く前に購読を閉じると無駄な `REQ` + `CLOSE` が飛ぶ。`RelaySubscription.close()` は `#isClosed()` で守られておらず、CLOSING 窓で flush されない `CLOSE` を積む。いずれも自己解消し有界 |
| `websocket-relay-connection.ts` | `Array.isArray(message)` が `any[]` に絞り、フィールドの静的型付けが失われる。`readonly unknown[]` 注釈で回復する |
| `relay-info.ts` | 失敗を一切キャッシュしないため、NIP-11 を持たないリレーへ毎回 fetch する。恒久的な焼き付きを避けた結果であり、対処するなら失敗側に短い TTL |
| `relay-info.ts` | `supported_nips` は 1 要素でも非数値なら全体を捨てる。実在するリレーには `"1"` のような文字列要素を出すものがあり、その場合 `supportsNip` が一律 false になる。要素単位のフィルタのほうが良い |
| `relay-info.ts` | `get()` の両分岐で clone-`.then()` が重複。`structuredClone` のほうが素直 |
| `relay-info.ts` | `fetchImpl.bind(globalThis)` は既定の native `fetch` には必要だが、注入された実装まで束縛し直すのは過剰。`constructor(fetchImpl = fetch.bind(globalThis))` にして保存時は束縛しないほうが正しい |
| `v1-section.tsx` | `DEFAULT_RELAY` がハードコードで `STREETS_E2E_RELAY_URL` を見ない。`e2e/fixtures/seed.ts` は見るため、上書きした環境で e2e が落ちる |
| `section-reader.ts` | `countUnroutableAuthors` を `status` の読み取りごとに再計算する。リレーが 0 件のときだけ通る経路なので現状は無料 |
| `routing-table.ts` | 参照のたびに store 検索と `parseRelayList`（Map 構築＋全タグ走査）を丸ごとやり直し、3 件を残して捨てる。`planQuery` は著者ごとに呼ぶため、500 人 × セクション数 × 再計画のたびに走る。導出元イベントの `id` をキーにメモ化すれば ADR-0016 の「導出・TTL なし」を壊さずに済む |
| `relay-url.ts` | パーセントエンコードされたパスセグメントを正規化しない（`%2f` と `%2F` が別 URL になる）。userinfo もそのまま保持する。既定ポート・大文字スキーム・IPv6 は正しいがテストがない |
| `query-plan.ts` | 1 つのフィルタ内の重複著者を除去しない。`Map` の反復順序も表明していない |
| `subscription-manager.ts` | `onEose` / `onClosed` の close 後抑制にテストがない（`onEvent` のみ）。1 プラン内の重複 URL と空プランも未テスト。明示リレー経路で `fallbackRelays` を使わないのに計算している |
| `bootstrap.ts` | `clearTimeout` / `getTimerCount` の表明がない。インデクサ 2 つが矛盾する `kind:3` を返すケース、不正な `p` タグの端から端までのケースも未テスト |
| `src/core/solid/provider.test.tsx`, `use-event-feed.test.tsx`, `use-event-relations.test.tsx`, `use-event.test.tsx`, `use-profile.test.tsx`, `use-social-read.test.tsx`, `src/routes/debug/v1-core.test.tsx` | 最終ブランチレビュー finding 6 で `tsconfig.test.json` を配線した際に発覚した、これらのスライスとは無関係な既存の型エラー 22 件。古いモックが `NostrCoreQueryClient` / `QueryRegistry` / `RxNostr` の現行の型（`getSnapshot` など新しい必須メンバーが増えている）に追随できていないのと、`rx-nostr` の `createRxNostr()` が引数必須になったのに呼び出し側が追随していないもの。vitest は型検査をしない（esbuild で transform するだけ）ので、これまで `pnpm typecheck` が `*.test.ts(x)` を丸ごと除外していたことで誰も気づいていなかった。レビューの指示（「まとめて直さず報告せよ」）に従い、`tsconfig.test.json` の `exclude` でこの 7 ファイルだけを外して `pnpm typecheck` を緑に保っている — 直したらそのファイルを `exclude` から外すこと |
| `connection-pool.ts` | `#reconnect()` の `for (const entry of pooled.entries)` が `entry.handlers.onClosed(...)` を素で呼んでおり、1 つのセクションのコールバックが投げると残りのセクションが張り直しを受け取れない。最終レビューの Finding 4 が `#replanOnce` / `SectionReader.#notify()` で塞いだのと同じ形だが、この経路は差分に含まれていなかった |
| CI | 再入ガードと反復上限が同時に壊れると、`subscription-manager.test.ts` の収束テストが真の同期無限ループを再現する。JS の単一スレッド上では vitest のテスト単位タイムアウトが割り込めない。`.github/workflows/ci.yaml` の `test` ジョブに `timeout-minutes` が無いため、その場合 CI はプラットフォーム既定（数時間）までハングする。1 行の保険を入れる価値がある |

## 後続 #3（接続プール）で扱うと決まったもの

### 同一リレー向けの REQ マージ

NIP-01 は 1 つの `REQ` に複数フィルタを載せることを認めており（`01.md:118,147`、複数フィルタは OR）、同一リレーへ向かう複数カラムのフィルタを 1 購読にまとめられる。**購読数はカラム数に比例しない。**

代償は 2 つ。**EOSE は購読単位なので**（`01.md:157`）まとめると [ADR-0015](../adr/0015-section-status-excludes-renderer-fetches.md) の `phase` をセクションごとに解決できなくなる。また**同じ `subscription_id` への REQ は置換なので**（`01.md:137`）、1 カラムを閉じるとグループ全体が張り直しになり、他のカラムが初回クエリを再配信される。

両立させる形: **初回取得中はカラムごとに購読を分け**（EOSE の粒度が要る、上限超過分はキューイング）、**settled 後は 1 本にまとめて張り替える**（EOSE はもう要らない）。定常状態の購読数はリレーあたり約 1 本に落ちる。

これにより `max_subscriptions` はリレーの除外基準ではなく、**初回取得の並列度を決めるスケジューリングの入力**になる。実測では 8 〜 300 と大きく開きがある。詳細は [research/2026-08-01-nip65-relay-selection.md](../research/2026-08-01-nip65-relay-selection.md) 5.4 節。

**後続 #5 へ回った（2026-08-02）。** この節の見出しどおり当初は接続プール（後続 #3）で扱う想定だったが、[ローカルフィルタ照合のスライス](../superpowers/specs/2026-08-02-local-filter-matching-design.md) 0 節が「再照合はマージの付随作業ではなく前提条件である」と判定して切り出した結果、マージ自体は後続 #5 に回った。**本スライス（後続 #4）が用意したのはその前提条件のほうである。** マージすると 1 つの `subscription_id` に複数セクションのフィルタが相乗りするが、`EVENT` メッセージは `subscription_id` しか持たないため、届いたイベントをどのセクションへ配るか決める手段はフィルタ照合しかない —— マージは照合の上にしか乗らない。その照合器を `src/core/read/filter-match.ts` として用意し、`SubscriptionManager` / `bootstrap.ts` に配線した（下記「解消済み」）。

## 解消済み

- **性能 — 1 イベントごとの全ソートと全再描画** — [section-reader-performance のスライス](../superpowers/specs/2026-08-02-section-reader-performance-design.md)（後続 #6、[ADR-0023](../adr/0023-centralized-subscription-manager.md)「実装の段階」参照）で解消。`section-reader.ts` の `#onEvent` が1件ごとに配列を2回ソートし3回コピーしていたのをやめ、保持順を `SortedEvents`（`src/core/read/sorted-events.ts`）に一本化した。保持順は `compareEvents`（`created_at` 降順、同値は `id` 昇順）で決まる全順序で固定し、挿入は二分探索、上限超過時は末尾を1件 `pop` するだけで済む。`id` 集合も配列と同じ場所に持つため、追い出しのたびに全件を舐め直す必要も無くなった。通知は `Scheduler` 経由でバッチする（`NOTIFY_BATCH_MS = 16`、60fpsの1フレーム）— 最初の変化でタイマーを1本張り、以後の変化は既存のタイマーに相乗りする（デバウンスではない。デバウンスだとイベントが途切れない限り永久に発火しない）。`items` と `status` は同期的に正しいまま保たれ、遅れるのは通知だけである（[ADR-0015](../adr/0015-section-status-excludes-renderer-fetches.md) に追記済み）。バッチの結果、`start()` 中の中間状態を観測者に見せないためだけに存在していた `#starting` フラグは到達不能になり削除した。計測は `scripts/research/measure-section-reader-burst.mjs` / [docs/research/2026-08-02-section-reader-burst.md](../research/2026-08-02-section-reader-burst.md) に記録した — 比較回数（2,000件で旧実装の約157倍高速）は決定的だが壁時計は環境依存で揺れ、**これは回帰を防ぐガードではない**。E2E は `e2e/section-cap.spec.ts` が測る（下記「満たしていない要件」）。

  **この節が書いていた対処案「`#notify` をマイクロタスクで合流させ」は誤りだった。** NIP-01 のリレーは `["EVENT", subid, event]` を**1イベント1メッセージ**で送り、ブラウザは WebSocket メッセージごとに別のタスクを回す。メッセージ N で積んだマイクロタスクは N+1 が届く前に flush されるため、500イベント = 500タスク = **合流は起きず通知は500回のまま**になる。マイクロタスクが合流できるのは「1メッセージ内で同期的に発生した複数の通知」だけで、実際の配信パターンはそうなっていない。メッセージをまたいで合流するにはマクロタスク境界が要り、それが `Scheduler.setTimeout` によるバッチである。
- **ルーティング表の永続化**（ADR-0016 が「新しい永続化要件」としていたもの）— 2026-08-01 に撤回。`EventStore` 内の `kind:10002` から導出する形にしたため、専用の保存先も TTL も不要になった。永続化は ADR-0019 の「参照データ」バケットが `kind:10002` を保持すれば自動的に得られる。
- **生きているセクションを張り直す手段が存在しない** — 接続プールのスライスで解消、ただし引き金は後続 #4（ローカルフィルタ照合）で変わった。再計画そのものの機構（`SubscriptionManager.replan()` が `#runReplan()` を回し、変化したエントリにだけ `onPlanChanged` を配る per-section diff、フィルタが変わったリレーへの `SectionDelivery.onRelayRestarted(relay)` 通知）は今も生きていて、正しく動く。`SectionReader` は `onRelayRestarted` を受けて complete/unreachable を両方リセットするので、黙って `settled` を主張し続けることはない。接続自体は張り直さない（同一プール接続で close + subscribe）ので ADR-0016 の「解決後に張り直す」が指す再購読と、接続の張り直し（コスト）を混同していない。30 接続上限のもとで「今は開けないリレーを後で開く」経路も、`onRelayUnreachable` / `onRelayRestarted` の組み合わせでセクションへ伝わるようになった。**ただし `kind:10002` の到着を検知して自動でこれを起動する経路は無い。** 当初はここに `SubscriptionManager` が `kind:10002` の到着をデバウンスして再計画する経路があったが、後続 #4（[ローカルフィルタ照合のスライス](../superpowers/specs/2026-08-02-local-filter-matching-design.md) 6 節）がその引き金（`#scheduleReplan` / `#replanTimer` / `#isDemandedAuthor` / `replanDebounceMs`）を削除した——`matchesAnyFilter` により `kind:10002` はセクションが要求していない限りそもそも store へ届かず、再計画の材料にならないため。生きているのは公開 `replan()` と `scheduler` オプションのみで、**今この機構を動かすのは明示的な `replan()` 呼び出しだけ**である。水和や再ウォームアップなど「ルーティングを変えうる入口」を実装する側が、その入口から `replan()` を呼ぶ責任を持つ——呼ばなければ、この節が「解消済み」と書いている張り直し能力は配線されないまま眠り続ける。同じ訂正は [architecture.md](./architecture.md) 8節にも入れてある。
- **`RelayConnection` に接続単位のライフサイクル通知がない** — 接続プールのスライスで解消。`RelayConnection` seam（ADR-0014）に `onClose(listener: () => void): () => void` を追加した。購読単位の `onClosed` とは別に、ソケットそのものの死を通知する。`ConnectionPool` はこれで「ソケットの死」と「レート制限による個別 CLOSED」を区別できるようになり、死んだ接続を即座に予算とレジストリから外して次の `subscribe()` で新しいソケットを開く。再接続（ADR-0021）もこの通知を起点に組まれている。
- **接続数はフォロー人数に比例して無制限に増える** — 接続プールのスライスで解消。`ConnectionPool` が唯一の接続開設点になり（ADR-0023）、`MAX_CONNECTIONS = 30`（ADR-0011）をルーティング済み・明示指定・fallback・ブートストラップの全経路で強制する。著者ごとの先頭 N 本方式は `selectRelays` による貪欲被覆選択（ADR-0025）へ置き換わった。予算超過で被覆できない著者は `incomplete.uncoveredAuthors` として黙らず報告する。`e2e/connection-budget.spec.ts` が「予算を超えて開かない」「被覆が最大化される」「落とした著者を報告する」を測る。
- **リレーが配信したイベントをフィルタに再照合していない** — [ローカルフィルタ照合のスライス](../superpowers/specs/2026-08-02-local-filter-matching-design.md)（後続 #4）で解消。`SubscriptionManager.#handlersFor` が組み立てる `onEvent` は `store.put` より前に `matchesAnyFilter`（`src/core/read/filter-match.ts`）で判定し、`bootstrap.ts` の `collect()` にも同じ判定を入れて専用経路のブートストラップ取得も同じ信頼境界に揃えた。捨てた件数は `SubscriptionManager.unrequestedEventsByRelay`（リレーごと、単調増加）と `WarmUpResult.unrequested` に現れ、`/debug/v1-section` の `data-testid="unrequested"` / `"unrequested-relays"` から読める。`e2e/relay-lies.spec.ts` が `page.routeWebSocket`（`relay-recovery.spec.ts` で確立した手法）で悪意あるリレーを再現し、閲覧者がフォローしていない著者の正当な署名付きイベントを注入したうえで、そのイベントが `items` に出ないこと・カウンタが動くこと・正当なイベントは従来どおり届くことを主張する。副作用として、[ADR-0016](../adr/0016-routing-bootstrap.md) の「解決後に張り直す」を閉じていた `kind:10002` 到着による再プランの引き金が削除された（記録は ADR-0016 側）。
- **`tsconfig.e2e.json` がルートのビルドグラフに載っておらず、`pnpm typecheck` が `e2e/` を検査しない** — 最終ブランチレビュー finding 6 で解消。`tsconfig.json` の `references` に `tsconfig.e2e.json` と（新設の）`tsconfig.test.json` を追加した。予告どおり `e2e/v1-section.spec.ts` / `connection-budget.spec.ts` / `relay-recovery.spec.ts` の相対 import に `.js` 拡張子を足す機械的な修正が必要だった（TS2835、`NodeNext` の規約）。`tsconfig.test.json` は `*.test.ts(x)` も同じコンパイラオプションで検査する新しいプロジェクトで、`connection-pool.test.ts` のタイマーハンドル `number` バグ（standalone `tsc` でしか捕まらなかった、というコメントが同ファイルに残っている）と同じ種類のバグを今後 CI で検出できるようにする。この配線自体が「これまで気づかれていなかった既存の型エラー」を 7 ファイル分表面化させた — 詳細は上の「小さいもの」表、対応方針はレビューの指示どおり報告のみ（`tsconfig.test.json` の `exclude` で除外）。

## 満たしていない要件

[ADR-0011](../adr/0011-performance-budget.md) は性能予算が **E2E で測定可能でなければならない**と定めている（`測定できない予算は要件ではなく願望である`）。7 指標のうち **30 接続上限に続いて 500 件上限**が E2E で測れるようになり、測定済みは 2 つになった（[architecture.md](./architecture.md) 10節）。残る 5 指標は未測定。

- **30 接続上限** — 解消済み。`e2e/connection-budget.spec.ts` が予算超過なし・貪欲被覆・落とした著者の報告を測る。実ソケットが死んで実リレーが復帰することは `e2e/relay-recovery.spec.ts` で測る（再接続そのものは 30 接続上限とは別の ADR-0021 だが、同じ接続プールのスライスで測定可能になった）。
- **500 件上限** — 解消済み。`e2e/section-cap.spec.ts` が 600 件（`MAX_ITEMS_PER_SECTION + 100`）を seed し（`e2e/fixtures/seed-cap.ts`）、`phase: settled` に達した時点で `/debug/v1-section` の `items` がちょうど 500 で止まることを主張する。
- 残る 5 指標（カラム数、初回表示 2 秒、操作反映 100ms、メモリ）はいずれも未測定。
