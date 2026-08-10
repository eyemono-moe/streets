# キャッシュポリシーと永続化 — 設計

## 0. このスライスは何のためにあるか

実鍵での計測（2026-08-10）で、初回描画を支配しているのは **`warmUpRouting` の 3577 ms** だと分かった。schnorr 検証（0.498 ms/件）でも接続確立でもない。

ただし個別に「この kind はキャッシュから読む／読まない」と決めていくと、kind が増えるたびに同じ議論をやり直すことになる。**このスライスが作るのは判断ではなく機構である** —— kind ごとに「いつ取り直すか」「取り直す間、古い値を使ってよいか」「永続層に何を残すか」を設定として持ち、初期値は暫定として置いて実際に使いながら詰める。

前提知識は [CONTEXT.md](../../../CONTEXT.md)、決定は [docs/adr/](../../adr/)、スライスの記録は [read-layer-followups.md](../../design/read-layer-followups.md)。残タスクは [GitHub Issues](https://github.com/eyemono-moe/streets/issues)。

## 1. 範囲

**含む。** kind ごとのキャッシュポリシーと、それを参照する 3 箇所の置き換え。イベントごとの最終取得時刻。明示的な無効化。`EventPersistence` seam と IndexedDB / インメモリの 2 実装。信用済み挿入。`EventStore` を `createSection` の公開オプションから外す合成ルート。`kind:5` の永続化。ウォームアップの相ごとの計測。

**含まない。** セクションが起動時に store からメンバーシップをシードすること（＝「前回のタイムラインが即座に出る」）。メモリの破棄戦略（[#189](https://github.com/eyemono-moe/streets/issues/189)）。アカウント境界（[#190](https://github.com/eyemono-moe/streets/issues/190)）。デッキの NIP-78 保存。**ポリシーの初期値の最適化** —— 暫定値を置き、使いながら詰める。

## 2. 軸は 3 つある

TanStack Query の `staleTime` / `gcTime` に相当するものを kind ごとに持つ。ただし 2 軸では足りない。

| 軸 | 意味 |
|---|---|
| `staleMs` | 最終取得からこれを過ぎたら取り直す |
| `serveWhileRevalidating` | 取り直している間、古い値を使ってよいか |
| `retention` | 永続層に何をどれだけ残すか |

**2 つ目が要る理由。** `staleMs: 0`（常に取り直す）と「取り直している間に古い値を使わない」は別の主張である。フォローリストで実害が出るのは後者を守らなかったときで、`staleMs` だけでは表現できない。

具体的には —— `SortedEvents` は末尾を落とす（500 件上限）以外に**イベントを取り除く経路を持たない**。セクションのメンバーシップは配信で積むだけの追記専用である。したがって**古いフォローリストで購読を張ると、外したはずの著者の投稿を画面から消せない**。`kind:3` は `serveWhileRevalidating: false` でなければならない。

**不変な kind は 3 軸を持たない。** `kind:1` / `6` / `7` は古くならない —— あるか無いかだけである。`staleMs` と `serveWhileRevalidating` は意味を持たず、効くのは `retention` だけ。[ADR-0019](../../adr/0019-two-bucket-cache-policy.md) の 2 バケットと同じ線だが、分ける理由は保持ポリシーの違いではなく**可変性の違い**である。

## 3. 最終取得時刻を持つ

`created_at` は**著者が書いた時刻**であって、**こちらが取得した時刻**ではない。2 年前に書かれた `kind:0` を 1 分前に取得したなら、取得時刻では新鮮、`created_at` では古い。**`staleMs` を判定するには取得時刻が要る。**

`StoredEvent` に `fetchedAt: number`（ミリ秒エポック）を足す。

- `put()` —— 現在時刻を入れる
- `hydrate()` —— **永続層に保存されていた値を復元する。** ここで現在時刻を入れると、水和のたびに全部が新鮮になり `staleMs` が永久に発火しない
- `invalidate()` —— 0 にする（次の参照で必ず取り直される）

**時刻は `Scheduler` から取る。** `Scheduler` に `now(): number` を足し、`defaultScheduler` が `Date.now` を供給する。読み取り層がタイマーを注入している理由（テストが時間を決定的に進める）は、鮮度判定にもそのまま当てはまる —— こちらは表示値ではなく**分岐に使う**ので、なおさら決定的である必要がある。`createFakeClock` は既に仮想時刻を持っているのでそのまま返せる。

## 4. ポリシー

```ts
// src/core/read/cache-policy.ts
export type Retention =
  | { type: "latest-per-author" }
  | { type: "capped"; max: number }
  | { type: "none" };

export type CachePolicy = {
  /** 不変な kind では意味を持たない（`Number.POSITIVE_INFINITY` を置く）。 */
  staleMs: number;
  serveWhileRevalidating: boolean;
  retention: Retention;
};

export const policyFor = (kind: number): CachePolicy;
export const isStale = (policy: CachePolicy, fetchedAt: number, now: number): boolean;
```

初期値（**暫定。使いながら詰める**）:

| kind | `staleMs` | `serveWhileRevalidating` | `retention` |
|---|---|---|---|
| 3（フォローリスト） | 0 | **false** | `none` |
| 10002（リレーリスト） | 7 日 | true | `latest-per-author` |
| 0（プロフィール） | 1 日 | true | `latest-per-author` |
| その他（不変） | ∞ | true | `none` |

**`kind:3` の `retention: none`。** `serveWhileRevalidating: false` なら永続層から読み出しても使わないので、書く理由が無い。

**その他の kind の `retention: none`。** イベント本体（`kind:1` など）の永続化は、それを水和するスライスで `capped` に変える。**読む側が居ないものを書かない。**

**`kind:10002` の 7 日は根拠のある値ではない。** リレーリストの変更頻度を測っていないので、まず長めに置いて 13 節の問いで詰める。

## 5. ポリシーを参照する 3 箇所

現在、この 3 箇所が「取るか取らないか」をその場で決め打っている。

| 箇所 | 現在 | 変更後 |
|---|---|---|
| `profile-requests.request()` | `latestReplaceable(0, pubkey)` があれば取らない | あって**かつ新鮮なら**取らない |
| `event-requests.request()` | `store.get(id)` があれば取らない | **変更なし**（不変なので `staleMs: ∞` が正しい） |
| `warmUpRouting` 相② | 全フォロイーの `kind:10002` を常に取る | **新鮮なものを除いた著者だけ**取る |

**相①（`kind:3`）は変更しない。** `staleMs: 0` かつ `serveWhileRevalidating: false` は「毎回取り、取り終わるまで進まない」であり、今の実装がまさにそれである。

**相②がこのスライスの効果そのもの。** 初回は全員ぶん取り、2 回目以降は 7 日以内に取ったぶんを飛ばす。

**`serveWhileRevalidating: true` の実装は「何もしない」でよい。** 古い値は既に store にあり、取り直しは `request()` が投げる。取得が終われば新しい版が store を置き換え、`<Profile>` は購読経由で再描画される。**`false` のときだけ待つ経路が要る**が、それは相①の既存実装である。

## 6. 明示的な無効化

`staleMs` を待たずに取り直させる。フォロー操作の直後が最初の用途になる。

```ts
// EventStore
invalidate(kind: number, pubkey: string): void;
```

置換可能イベントの `fetchedAt` を 0 にする。次にポリシーを参照する箇所が必ず取り直す。

**このスライスではフォロー操作の UI が無いので、呼び出し元はまだ無い。** それでも入れるのは、フォロー操作を作る人が「無効化の口が無い」ことに気づいてから設計し直すのを避けるため。**テストで固定し、UI から繋ぐのはその機能のスライス。**

## 7. `EventPersistence` seam

[ADR-0018](../../adr/0018-indexeddb-event-cache.md) が定めた seam。IndexedDB とインメモリの 2 実装を持つ（テストを IndexedDB なしで走らせるため、2 つ目は仮説ではなく実在する）。

```ts
// src/core/read/event-persistence.ts
export type PersistedEvent = {
  event: NostrEvent;
  seenRelays: RelayUrl[];
  fetchedAt: number;
};

export type EventPersistence = {
  /**
   * 起動時に 1 回だけ。失敗しても reject しない —— 空を返し、
   * アプリは通常経路（毎回ウォームアップ）で動く。
   */
  load(): Promise<{ events: PersistedEvent[]; deletedIds: readonly string[] }>;
  save(entries: readonly PersistedEvent[]): void;
  /** `kind:5` が指した対象 id。保持期間の対象にしない（ADR-0019）。 */
  saveDeletions(ids: readonly string[]): void;
  dispose(): void;
};
```

**`load()` は reject しない。** IndexedDB はプライベートブラウジング・容量超過・ブラウザ設定で普通に失敗する。失敗はキャッシュが無いのと同じであり、アプリが起動しない理由にはならない。**この規約はテストで固定する** —— インメモリ実装は失敗しないので、失敗を模す 3 つ目の実装をテスト内に置く。

**書き込みはまとめる。** `save` は呼ばれるたびに IndexedDB へ書かず、`PERSIST_BATCH_MS = 1000` の窓でまとめる（コアレッサと同じ形）。初回バーストで数百件が流れるため、1 件 1 トランザクションでは書き込みが描画を圧迫する。

**何を `save` するかはポリシーが決める。** `retention: none` の kind は渡さない。

## 8. 信用済み挿入

`put()` は挿入のたびに `verifyEvent` を通す。実測 **0.498 ms/件**、**9470 件で 4.7 秒**。水和をこの経路に通すと [ADR-0011](../../adr/0011-performance-budget.md) の「初回イベント表示 2 秒」が検証だけで埋まる。

**`put()` にフラグを足すのではなく、別のメソッドにする。**

```ts
/**
 * 永続層から読み戻したものを検証せずに入れる。
 * **リレー由来の値をここへ通してはならない。**
 */
hydrate(entries: readonly PersistedEvent[]): void;
```

(a) リレー経路から誤って呼ばれる余地が無い。(b) 水和は本質的にバッチであり 1 件ずつの API は形が合わない。(c) 信頼境界が「同じドアの引数違い」ではなく「別のドア」になる。

`hydrate` は `fetchedAt` を引数の値から復元し、既にある id を上書きしない。

## 9. `EventStore` の内部化と合成ルート

[ADR-0018](../../adr/0018-indexeddb-event-cache.md) は `EventStore` の seam 資格を取り消したが、実装は今も `createSection` の公開オプションとして露出しており、共有するかどうかを呼び出し側が決められる。水和が入れば store は読み取り層のシングルトンになるほかない。

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
  /** 同期読み取りと診断のためだけ。書き込み口をアプリ側から呼ばない。 */
  readonly store: EventStore;
  dispose(): void;
};

export const createReadLayer = (options: ReadLayerOptions): ReadLayer;
```

`createSection` の `store` オプションは削除する。`SectionReader` 側の `store` オプションは**残す** —— テストが `PassThroughStore` を注入する内部の seam として機能しており、外に出すべきでないのは公開インターフェースのほうである。

**`store` を露出することについて。** `EventView` と `<Profile>` は同期的に引く必要があり、診断表示も `verifyMs` / `size` を読む。隠すと `ReadLayer` に転送メソッドが並ぶだけで深くならない。**書き込み（`put` / `hydrate` / `invalidate`）をアプリ側から呼ぶ経路が無いことはレビューで確認する** —— 型では防げない。

## 10. `kind:5` の適用

[ADR-0019](../../adr/0019-two-bucket-cache-policy.md) —— 削除指示を破棄すると、次回起動時に**ユーザーが消したはずの投稿が復活する**。置換可能イベントが古い版のまま出ること（許容する）とは性質が違う。

- `kind:5` が届いたら、その `e` タグの対象 id を `saveDeletions` へ渡す
- `load()` が返す `deletedIds` を `hydrate` から除外する
- **削除指示は `retention` の対象にしない**（単調増加を受け入れる）

**このスライスでは実効が出ない** —— 水和するのは `kind:10002` だけで、削除の対象になるイベントはまだ永続化されない。**それでも機構を入れるのは、イベント本体の水和を入れるスライスが削除の配線を後から足す形にしないため。** 後から足すと、その一度きりの起動で削除済みの投稿が復活する。

## 11. 前提の検証を最初に行う

**`warmUpMs` は 3577 ms の合計値しかなく、①と②の内訳を測っていない。** ② が支配的でなければこのスライスの効果は薄い。

`bootstrap.ts` の 2 相にそれぞれ `performance.now()` を挟み、`WarmUpResult` に `phase1Ms` / `phase2Ms` を足して開発者モードへ出す（`data-testid="warm-up-phases"`）。**これを最初のタスクにし、実鍵での数値を得てから残りを実装する。**

② が支配的でなかった場合にどうするかは、その数値を見てから決める。**推測で分岐を用意しない。**

## 12. スキーマとエラー処理

IndexedDB のデータベース名は `streets.v1`、オブジェクトストアは `events`（key: イベント id）と `deletions`（key: 対象 id）。バージョンは 1 から。

**移行方針は「破棄して再取得」**（ADR-0019 の Consequences）。`onupgradeneeded` で既存ストアを消して作り直す。キャッシュは常に再構築可能であり、移行コードを書く価値が保持するデータの価値を上回らない。

**アカウントごとに分けない。** `kind:0` / `10002` は公開イベントであり、誰が読んでも同じものである。アカウント固有状態の分離（[#190](https://github.com/eyemono-moe/streets/issues/190)）はミュート・既読など解釈の側の話で、公開イベント本体には及ばない。

| 起きること | 扱い |
|---|---|
| IndexedDB が使えない | `load()` が空を返す。通常経路で動く。**ユーザーには何も出さない**（行動できないので [ADR-0026](../../adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md) の診断値側） |
| 書き込みが失敗する | 黙って捨てる。次回の起動が遅くなるだけ |
| 永続層のデータが壊れている | `isNostrEvent` で形を確かめ、通らないものを捨てる。**署名は検証しない**（8 節の前提） |
| `fetchedAt` が壊れている / 無い | 0 として扱う（必ず取り直す）。**現在時刻を入れない** —— 壊れた値を新鮮とみなすことになる |
| 水和したリレーリストが古く、そのリレーが消えている | 通常の到達不能（`degradedRelays`）。新しい `kind:10002` が届けば直る |

## 13. テスト

**ユニット（vitest）**

- `isStale` / `policyFor` —— 境界（ちょうど `staleMs`）、不変な kind、未知の kind
- `fetchedAt` —— `put` が現在時刻を入れること、`hydrate` が**引数の値を復元すること**（現在時刻を入れないこと）、`invalidate` が 0 にすること
- `profile-requests` —— 新鮮なら要求しない / 古ければ要求する / `store` に無ければ要求する
- `warmUpRouting` 相② —— 新鮮な `kind:10002` を持つ著者を除くこと、全員新鮮なら相②が REQ を一切出さないこと
- `EventPersistence` インメモリ —— `save` → `load` の往復、`saveDeletions` の往復、`dispose` 後の書き込みが無視されること
- `load()` が失敗しても reject せず空を返すこと（失敗を模す実装で）
- `EventStore.hydrate` —— 検証を通らない署名でも入ること、`verifyCount` が増えないこと、既にある id を上書きしないこと、`deletedIds` が除外されること
- `retention` —— `latest-per-author` が同一著者の古いほうを落とすこと、`created_at` 同値のときの決定性（`compareEvents` と同じ全順序）
- `createReadLayer` —— `ready` が水和完了で解決すること、`dispose` が全部の子を畳むこと

**E2E（Playwright、ローカル docker リレー）**

- 1 回目のロードの後にリロードすると `phase2Ms` が明確に小さくなること
- IndexedDB を消してからリロードすると元に戻ること

**IndexedDB 実装そのもののテスト。** jsdom には IndexedDB が無い。`fake-indexeddb` を足すか、IndexedDB 実装だけを E2E に委ねるかを実装時に決める。**依存を増やさない側（E2E に委ねる）を既定とし、増やすなら理由を報告に書くこと。**

## 14. 実際に動かして初めて答えられる問い

1. **ウォームアップの①と②の内訳は何 ms か。** 11 節の計測。② が支配的でなければ、このスライスの前提そのものが崩れる
2. **2 回目以降の `warmUpMs` は何 ms になったか。**
3. **`kind:10002` の水和で実際に何件が復元されるか。** フォロー数に対する割合。届いていなかった著者はキャッシュにも無い
4. **`staleMs` の初期値は妥当か。** リレーリスト 7 日・プロフィール 1 日は根拠のない暫定値である。古いリレーリストで繋ぎに行って失敗する割合（`degradedRelays`）が高ければ短くする
5. **`serveWhileRevalidating: false` が `kind:3` 以外にも要るか。** 今は 1 つしか無く、一般化が正しかったかどうかは 2 つ目が現れて初めて分かる
