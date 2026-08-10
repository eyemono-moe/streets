# 永続化 — 設計

## 0. このスライスは何のためにあるか

実鍵での計測（2026-08-10）で、初回描画を支配しているのは **`warmUpRouting` の 3577 ms** だと分かった。schnorr 検証でも接続確立でもない。ウォームアップは 2 相あり、②（全フォロイーの `kind:10002` を引く）はフォロー数に比例する。

**この相をキャッシュから水和して消す。** 同時に、水和が成立するために必要な 3 つ（信用済み挿入・`EventStore` の内部化・`kind:5` の適用）を入れる。

前提知識は [CONTEXT.md](../../../CONTEXT.md)、決定は [docs/adr/](../../adr/)、スライスの記録は [read-layer-followups.md](../../design/read-layer-followups.md)。残タスクは [GitHub Issues](https://github.com/eyemono-moe/streets/issues)。

## 1. 範囲

**含む。** `EventPersistence` seam と IndexedDB / インメモリの 2 実装。`kind:10002` の永続化と起動時水和。信用済み挿入。`EventStore` を `createSection` の公開オプションから外す合成ルート。`kind:5` の永続化と水和時の適用。永続層の保持上限。ウォームアップの相ごとの計測。

**含まない。** `kind:1` などイベント本体の水和と、**セクションが起動時に store からメンバーシップをシードすること**（＝「前回のタイムラインが即座に出る」）—— これは次のスライス。メモリの破棄戦略（[#189](https://github.com/eyemono-moe/streets/issues/189)）。アカウント境界（[#190](https://github.com/eyemono-moe/streets/issues/190)）。デッキの NIP-78 保存。

## 2. フォローリストは水和しない

**これがこのスライスの中心的な判断である。**

`SortedEvents` は末尾を落とす（500 件上限）以外に**イベントを取り除く経路を持たない**。セクションのメンバーシップは配信で積むだけの追記専用である。したがって**古いフォローリストで購読を張ると、外したはずの著者の投稿を画面から消せない** —— セクションを作り直すしかない。

ウォームアップの 2 相は、コストも陳腐化の害も非対称である。

| 相 | 内容 | コスト | 陳腐化したときの害 |
|---|---|---|---|
| ① `kind:3` | インデクサ 4 本からフォローリスト | 1 往復 | **外した人が出る＝実害** |
| ② `kind:10002` | 全フォロイーのリレーリスト | フォロー数に比例 | 古いリレーに繋ぐだけ。新しい版が届けば直る |

**② だけを水和し、① は毎回取り直す。** フォローリストの正しさは今と同じまま、重い側だけが消える。[ADR-0018](../../adr/0018-indexeddb-event-cache.md) は「置換可能イベントは新しい版が届くまで古い版を表示する。許容する」と定めており、リレーリストはまさにその対象である。

**この形なら、後のスライスでイベント本体を水和しても外した人は出ない** —— セクションの購読フィルタは常に新しいフォローリストから作られるので、古い著者の投稿はそもそも要求されない。

## 3. 前提の検証を最初に行う

**`warmUpMs` は 3577 ms の合計値しかなく、①と②の内訳は測っていない。** ② が支配的でなければこの設計の効果は薄い。

`bootstrap.ts` の 2 相にそれぞれ `performance.now()` を挟み、`WarmUpResult` に `phase1Ms` / `phase2Ms` を足して開発者モードへ出す（`data-testid="warm-up-phases"`）。**これを最初のタスクにし、実鍵での数値を得てから残りを実装する。**

② が支配的でなかった場合にどうするかは、その数値を見てから決める。**推測で分岐を用意しない。**

## 4. `EventPersistence` seam

[ADR-0018](../../adr/0018-indexeddb-event-cache.md) が定めた seam。IndexedDB とインメモリの 2 実装を持つ（テストを IndexedDB なしで走らせるため、2 つ目は仮説ではなく実在する）。

```ts
// src/core/read/event-persistence.ts
export type PersistedEvent = { event: NostrEvent; seenRelays: RelayUrl[] };

export type EventPersistence = {
  /**
   * 起動時に 1 回だけ呼ぶ。水和対象と、適用すべき削除指示の対象 id を返す。
   * 失敗しても reject しない —— 空を返してアプリは通常経路で動く。
   */
  load(): Promise<{ events: PersistedEvent[]; deletedIds: readonly string[] }>;
  /** 書き込みは非同期。呼び出し側は待たない。 */
  save(entries: readonly PersistedEvent[]): void;
  /** `kind:5` が指した対象 id。保持期間の対象にしない（ADR-0019）。 */
  saveDeletions(ids: readonly string[]): void;
  dispose(): void;
};
```

**`load()` は reject しない。** IndexedDB はプライベートブラウジング・容量超過・ブラウザの設定で普通に失敗する。失敗はキャッシュが無いのと同じであり、アプリが起動しない理由にはならない。**この規約を型ではなくテストで固定する**（インメモリ実装は失敗しないので、失敗を模す実装を別に立てる）。

**書き込みの粒度。** `save` は呼ばれるたびに IndexedDB へ書かず、短い窓でまとめる（コアレッサと同じ形、`PERSIST_BATCH_MS = 1000`）。初回バーストで数百件が流れるため、1 件 1 トランザクションでは書き込みが描画を圧迫する。

## 5. 何を永続化し、何を水和するか

**このスライスは `kind:10002` だけを永続化・水和する。**

[ADR-0019](../../adr/0019-two-bucket-cache-policy.md) は参照データ（`kind:0` / `3` / `10002` / `10000` / `10030`）と流れるデータ（`kind:1` / `6` / `7`）の 2 バケットを定めているが、**読む側が居ないものを書かない。** バケットの一般形は、それを消費するスライス（イベント本体の水和）で入れる。

**`kind:0`（プロフィール）は同じ機構でほぼ無料に水和できる。** 実鍵では `profileBatch` の最大が 194 件で、起動直後に短縮 pubkey が並ぶ時間がそのぶん消える。陳腐化の害も無い（ADR-0018 が明示的に許容している範囲）。**合意した範囲外なので入れていないが、入れるなら永続化対象の kind を 1 つ足すだけである。**

**`kind:3` は永続化しない。** 2 節のとおり、水和しないものを書く理由が無い。

## 6. 信用済み挿入

`EventStore.put()` は挿入のたびに `verifyEvent`（id 再計算 + schnorr）を通す。実測は **0.498 ms/件**。1 件では無視できるが、**9470 件で 4.7 秒**になる。水和をこの経路に通すと、[ADR-0011](../../adr/0011-performance-budget.md) の「初回イベント表示 2 秒」が検証だけで埋まる。

**`put()` にフラグを足すのではなく、別のメソッドにする。**

```ts
/**
 * 永続層から読み戻したイベントを検証せずに入れる。
 *
 * 自分が一度検証して書いたものだけを受け取る前提であり、
 * **リレー由来の値をここへ通してはならない**。put() と別の入口にしてあるのは
 * その区別を呼び出し側の引数ではなくメソッドの選択に載せるため。
 */
hydrate(entries: readonly PersistedEvent[]): void;
```

理由は 3 つ。(a) リレー経路から誤って呼ばれる余地が無い。(b) 水和は本質的にバッチであり、1 件ずつの API は形が合わない。(c) 信頼境界が「同じドアの引数違い」ではなく「別のドア」になる。

## 7. `EventStore` の内部化と合成ルート

[ADR-0018](../../adr/0018-indexeddb-event-cache.md) は `EventStore` の seam 資格を取り消したが、実装は今も `createSection` の公開オプションとして露出しており、**共有するかどうかを呼び出し側が決められる**。水和が入れば store は読み取り層のシングルトンになるほかない。

合成ルートを 1 つ作り、`createSection` から `store` を外す。

```ts
// src/core/read/read-layer.ts
export type ReadLayerOptions = {
  connect: (url: RelayUrl) => RelayConnection;
  persistence: EventPersistence;
  fallbackRelays?: RelayUrl[];
  maxConnections?: number;
  scheduler?: Scheduler;
  random?: () => number;
};

export type ReadLayer = {
  /** 水和の完了。起動直後に 1 回 await する。失敗しない。 */
  ready: Promise<void>;
  manager: SubscriptionManager;
  routing: RoutingTable;
  events: EventRequests;
  profiles: ProfileRequests;
  /** `EventView` と診断表示のためだけに露出する。書き込み口は持たせない。 */
  readonly store: EventStore;
  dispose(): void;
};

export const createReadLayer = (options: ReadLayerOptions): ReadLayer;
```

`createSection` の `store` オプションは削除する。`SectionReader` 側の `store` オプションは**残す** —— テストが `PassThroughStore` を注入する内部の seam として機能しており、外に出すべきでないのは公開インターフェースのほうである。

**`ReadLayer.store` を読み取り専用として露出することについて。** `EventView` と `<Profile>` は store から同期的に引く必要があり、診断表示も `verifyMs` / `size` を読む。ここを隠すと `ReadLayer` に転送メソッドが並ぶだけで深くならない。**書き込み（`put` / `hydrate`）を呼ぶ経路がアプリ側に無いことをレビューで確認する**（型で防げないので、そこは規律に頼る）。

## 8. `kind:5` の適用

[ADR-0019](../../adr/0019-two-bucket-cache-policy.md) —— 削除指示を破棄すると、次回起動時に**ユーザーが消したはずの投稿が復活する**。置換可能イベントが古い版のまま出ること（許容する）とは性質が違う。

- `kind:5` が届いたら、その `e` タグの対象 id を `saveDeletions` へ渡す
- `load()` が返す `deletedIds` を、`hydrate` する前に除外する
- **削除指示は保持上限の対象にしない**（単調増加を受け入れる。ADR-0019 の Consequences がそう決めている）

**このスライスで `kind:5` を購読するわけではない。** `kind:10002` しか水和しないので、削除の対象になるイベントはまだ永続化されていない。**それでも機構を入れるのは、イベント本体の水和を入れるスライスが「削除指示の配線」を後から足す形にしないため** —— 後から足す形にすると、その一度きりの起動で削除済みの投稿が復活する。今は届いた `kind:5` を記録するだけで、実効は次のスライスから出る。

## 9. 永続層の保持上限

このスライスの対象は `kind:10002` だけなので、[ADR-0019](../../adr/0019-two-bucket-cache-policy.md) の「参照データ = 全保持、著者ごと最新 1 件」がそのまま上限になる。**著者ごとに最新 1 件だけを残す**（`created_at` が大きいほう。同値なら id の昇順で決める —— `compareEvents` と同じ全順序を使い、実装ごとに違う答えを出さない）。

流れるデータの 20,000 件上限は、それを永続化するスライスで入れる。

## 10. スキーマとバージョン

IndexedDB のデータベース名は `streets.v1`、オブジェクトストアは `events` と `deletions` の 2 つ。バージョンは 1 から始める。

**移行方針は「破棄して再取得」**（ADR-0019 の Consequences）。`onupgradeneeded` で既存ストアを消して作り直す。キャッシュは常に再構築可能なので、移行コードを書く価値が保持するデータの価値を上回らない。

**アカウントごとに分けない。** `kind:10002` は公開イベントであり、誰が読んでも同じものである。アカウント固有状態の分離（[#190](https://github.com/eyemono-moe/streets/issues/190)）はミュート・既読など解釈の側の話であり、公開イベント本体には及ばない。

## 11. エラー処理

| 起きること | 扱い |
|---|---|
| IndexedDB が使えない（プライベートブラウジング等） | `load()` が空を返す。アプリは通常経路（毎回ウォームアップ）で動く。**ユーザーには何も出さない** —— 行動できないので [ADR-0026](../../adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md) の診断値側 |
| 書き込みが失敗する（容量超過等） | 黙って捨てる。次回の起動が遅くなるだけで、動作は壊れない |
| 永続層のデータが壊れている | `isNostrEvent` で形を確かめ、通らないものを捨てる。**署名は検証しない**（6 節の前提）—— 形が壊れているのは自分の書き込みかブラウザの障害であり、そこまで疑うなら水和自体が成立しない |
| 水和したリレーリストが古く、そのリレーが消えている | 通常の到達不能として扱われる（`degradedRelays`）。新しい `kind:10002` が届けば直る |

## 12. テスト

**ユニット（vitest）**

- `EventPersistence` のインメモリ実装 —— `save` → `load` の往復、`saveDeletions` の往復、`dispose` 後の書き込みが無視されること
- `load()` が失敗しても reject せず空を返すこと（失敗を模す実装で）
- `EventStore.hydrate` —— 検証を通らない署名でも入ること、`verifyCount` が増えないこと、既にある id を上書きしないこと
- 参照データの保持上限 —— 同じ著者の `kind:10002` が 2 件あるとき新しいほうだけが残ること、`created_at` 同値のときの決定性
- `createReadLayer` —— `ready` が水和の完了で解決すること、`dispose` が全部の子を畳むこと
- 削除指示 —— `load` が返した `deletedIds` が `hydrate` から除外されること

**E2E（Playwright、ローカル docker リレー）**

- 1 回目のロードの後にリロードすると、`phase2Ms` が明確に小さくなること
- IndexedDB を消してからリロードすると元に戻ること

**IndexedDB 実装そのものの E2E。** ユニットテストは jsdom で `fake-indexeddb` を使うか、あるいは IndexedDB 実装だけを E2E に委ねるかを実装時に決める。**依存を増やさない側（E2E に委ねる）を既定とし、増やすなら理由を報告に書くこと。**

## 13. 実際に動かして初めて答えられる問い

1. **ウォームアップの ① と ② の内訳は何 ms か。** 3 節の計測。② が支配的でなければ、このスライスの前提そのものが崩れる
2. **2 回目以降の `warmUpMs` は何 ms になったか。** 実鍵で読む
3. **`kind:10002` の水和で、実際に何件が復元されるか。** フォロー数に対する割合。届いていなかった著者はキャッシュにも無い
4. **古いリレーリストで繋ぎに行って失敗する割合。** `degradedRelays` に出る。多ければ、参照データにも短い TTL が要るという材料になる
