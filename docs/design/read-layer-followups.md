# 読み取り層 — 繰延事項

第1スライス（単一リレーのセクション読み取り）と第2スライス（Outbox ルーティングと購読マネージャ）のレビューで実在すると判定されたが、そのスライスでは直さなかったもの。次の計画に着手する前にここを読むこと。

用語は [CONTEXT.md](../../CONTEXT.md)、決定は [docs/adr/](../adr/)、全体像は [architecture.md](./architecture.md)。

## 次の計画で直すべきもの

### 性能 — 1 イベントごとの全ソートと全再描画

`section-reader.ts` の `#onEvent` はイベント 1 件ごとに配列を 2 回ソートし（上限判定用に降順、次いで表示順）、3 回コピーする。`items` ゲッターは読むたびにコピーし、`status` ゲッターは読むたびに 2 本の配列を filter する。`#notify` はイベントごとに同期発火し、`createSection` が 2 つのシグナルを更新して `<For>` が最大 500 件を突き合わせる。

上限に達した状態で EOSE のバーストが 500 件来ると、1 セクションあたり 500×500 の比較と 500 回の全件差分になる。[ADR-0011](../adr/0011-performance-budget.md) の予算はまさにこの掛け算（カラム数 × Outbox のリレー数 × レンダラの needs）を見越して設けたものであり、**上に 3 層積む前が最も安く直せる**。

対処: `#notify` をマイクロタスクで合流させ、ソート＋スライスではなく二分探索による挿入にする。

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

### 生きているセクションを張り直す手段が存在しない

[ADR-0016](../adr/0016-routing-bootstrap.md) は「**未解決の著者は既定リレーへ暫定的に送信し、解決後に張り直す**」と定めている。**後半が実装されていない。**

`SectionReader.start()` は `planQuery` を 1 回だけ呼び、その結果を `#relays` に固定する。あとから `kind:10002` が `EventStore` に届いてルーティング表が変わっても、既に走っているセクションは fallback リレーを見続ける。デバッグルートがこれを露呈させていないのは、`warmUp.loading` が終わるまでセクションを開始しないから — つまり**読み取り層の穴をビューの都合で塞いでいる**状態であり、カラムが増えれば成立しない。

同じ穴が [ADR-0011](../adr/0011-performance-budget.md) の 30 接続上限にも効く。上限のもとでマネージャは「今は開けないリレーを後で開く」必要があるが、セクションに「待つ相手が 1 つ増えた」と伝える経路がない。`onRelayComplete` / `onRelayUnreachable` は `#relayState` の作成時生成により未知のリレーでも受け付けるものの、**後から開いてまだ完了していないリレーは `allSettled` から見えない**ため、セクションが早すぎる `settled` を報告する。

対処はどちらも同じ形になる: `SectionDelivery` に `onRelayAdded(relay)` を足すか、`SectionHandle.relays` をスナップショットではなくアクセサにする。**これは後続 #3（接続プール）の最初の設計課題であって、実装の細部ではない。**

なお [ADR-0023](../adr/0023-centralized-subscription-manager.md) の「マージはマネージャ内部の方針であって構造ではない」という約束は、`createSection` の `{ items, status, loadMore }` については維持されている。維持されていないのは `SectionReader` との境界のほう。

### `RelayConnection` に接続単位のライフサイクル通知がない

`SubscriptionManager` の `#pool` は `refCount` が 0 になったときしかエントリを消さない。ソケットが自然死した場合、`WebSocketRelayConnection` は保持している全ハンドラに `onClosed` を投げてハンドラを捨てるが、**接続は死んだまま `refCount > 0` で pool に残る**。次に同じ URL を `#acquire` したセクションはその死体を渡され、`subscribe()` が即座に `onClosed` を返すため、リロードするまで永久に `unreachable` のカラムになる。

根本原因は 1 段下にある。`RelayConnection` seam（[ADR-0014](../adr/0014-thin-relay-connection-deep-read-layer.md)）は**購読単位の `onClosed` しか持たず、接続の死とレート制限による個別 CLOSED をプールが区別できない**。

再接続（[ADR-0021](../adr/0021-reconnection-policy.md)）もこの通知なしには組めない。**seam に `readonly closed: boolean` を足すか `onStateChange` を足すかは ADR-0014 の変更であり、後続 #3 の冒頭で決めること。**

### 接続数はフォロー人数に比例して無制限に増える

`planQuery` は全著者の write リレーの和集合につき 1 バケットを出し、`SubscriptionManager.subscribe` はそれを同期的に全て `#acquire` する。著者ごとの本数制限は廃止され、**接続先はいま、フォローしている著者が `kind:10002` で宣言した数そのまま**である。実測では ~1300 人規模のフォローに対して 378〜1251 の異なる write リレーが宣言されている（[docs/research/2026-08-01-outbox-connection-budget.md](../research/2026-08-01-outbox-connection-budget.md)）。

[ADR-0011](../adr/0011-performance-budget.md) の 30 接続上限がまさにこれの対処であり、第2スライスでは意図的に範囲外とした。ただし**現時点の実装には上限が一切ない**ことを明記しておく。デバッグルートが無事なのはフォローが 2 人だからにすぎず、`createSection` の呼び出し元が増えた瞬間に効く。

### リレーが配信したイベントをフィルタに再照合していない

`SubscriptionManager` は購読に届いたものをそのまま格納・配信し、`SectionReader` はそれをリストに載せる。署名検証は**偽造**を防ぐが**混入**は防がない。ある著者の write リレーは、そのリレーを見ているセクションへ、フォローしていない人の正当な署名付きイベントや別 kind のイベントを押し込める。

第2スライス以前からそうだったが、Outbox がこの面積を実質的に広げた。**セクションが話しかけるリレー集合を決めるのが、自分ではなくフォローしている著者になった**ためである。

[ADR-0023](../adr/0023-centralized-subscription-manager.md) は既にローカル再マッチを必要な作業として挙げているが、これは購読マージの帰結ではなく**リレーの配信を信用していることの帰結**である。ADR 側にもその旨を追記した。

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

## 後続 #3（接続プール）で扱うと決まったもの

### 同一リレー向けの REQ マージ

NIP-01 は 1 つの `REQ` に複数フィルタを載せることを認めており（`01.md:118,147`、複数フィルタは OR）、同一リレーへ向かう複数カラムのフィルタを 1 購読にまとめられる。**購読数はカラム数に比例しない。**

代償は 2 つ。**EOSE は購読単位なので**（`01.md:157`）まとめると [ADR-0015](../adr/0015-section-status-excludes-renderer-fetches.md) の `phase` をセクションごとに解決できなくなる。また**同じ `subscription_id` への REQ は置換なので**（`01.md:137`）、1 カラムを閉じるとグループ全体が張り直しになり、他のカラムが初回クエリを再配信される。

両立させる形: **初回取得中はカラムごとに購読を分け**（EOSE の粒度が要る、上限超過分はキューイング）、**settled 後は 1 本にまとめて張り替える**（EOSE はもう要らない）。定常状態の購読数はリレーあたり約 1 本に落ちる。

これにより `max_subscriptions` はリレーの除外基準ではなく、**初回取得の並列度を決めるスケジューリングの入力**になる。実測では 8 〜 300 と大きく開きがある。詳細は [research/2026-08-01-nip65-relay-selection.md](../research/2026-08-01-nip65-relay-selection.md) 5.4 節。

## 解消済み

- **ルーティング表の永続化**（ADR-0016 が「新しい永続化要件」としていたもの）— 2026-08-01 に撤回。`EventStore` 内の `kind:10002` から導出する形にしたため、専用の保存先も TTL も不要になった。永続化は ADR-0019 の「参照データ」バケットが `kind:10002` を保持すれば自動的に得られる。

## 満たしていない要件

[ADR-0011](../adr/0011-performance-budget.md) は性能予算が **E2E で測定可能でなければならない**と定めている（`測定できない予算は要件ではなく願望である`）。現時点で E2E が測っている予算はない。

- **500 件上限** — ユニットテストのみ。デバッグルートに対する E2E で `items ≤ 500` を主張するのは小さい追加であり、今すぐ入れられる。
- **30 接続上限** — 接続プールの計画を待つのが妥当。
- 残る 5 指標（カラム数、初回表示 2 秒、操作反映 100ms、メモリ）はいずれも未測定。
