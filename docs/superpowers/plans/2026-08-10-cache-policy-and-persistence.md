# キャッシュポリシーと永続化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kind ごとに「いつ取り直すか」「取り直す間に古い値を使ってよいか」「永続層に何を残すか」を設定として持ち、`kind:10002` を IndexedDB へ永続化してウォームアップの重い相を消す。

**Architecture:** 判断を kind ごとに固定するのではなく `CachePolicy` の表にする。鮮度判定には `fetchedAt`（取得時刻）が要り、時刻は `Scheduler.now()` から取る。永続層は `EventPersistence` seam（IndexedDB / インメモリ）。水和は検証を通さない別の入口 `EventStore.hydrate()`。

**Tech Stack:** TypeScript / SolidJS / Vitest / Playwright / IndexedDB。

**仕様:** [docs/superpowers/specs/2026-08-10-event-persistence-design.md](../specs/2026-08-10-event-persistence-design.md)。**タスクの記述と仕様が食い違ったら仕様が正。**

## Global Constraints

- **完了の判定は `pnpm vitest run && pnpm typecheck && pnpm check` の 3 つすべて。**
  `pnpm check` は Biome と読み取り層の依存チェックだけで、**型検査を含まない**。
  Vitest は esbuild で変換するため型エラーを一切見ない。
- **すべてのテストは、捕まえる変異をコメントで名指しし、実際にその変異を入れて
  落ちることを確認してから報告すること。** 加えて**その変異が名指ししたテストを
  落とすこと**まで確かめる。落とすテストが違ったら、コメントを実態に合わせる。
  変異検証の前に**製品コードをバックアップし、`git checkout` で戻さない**
  （未コミットの実装ごと消える）。
- **コメントには非自明な WHY だけを書く**（`CONTEXT.md` の「書き方」節）。
  WHAT・変更履歴（「〜を追加した」「旧実装では」「レビューで」）・タスク ID の
  参照は書かない。経緯を残したければ ADR へ。**既存コメントの一括書き換えは
  しない** —— 触ったファイルで直す。
- **`Date.now()` / `performance.now()` を鮮度判定に直接使わない。** 分岐に使う
  時刻は `Scheduler.now()` から取る。表示専用の計測値（`verifyMs` など）は
  この限りではない。
- 作業ブランチは `v1`。旧実装（v0 側）は無視してよい。
- `data-testid` は既存のものを変えない。

---

### Task 1: ウォームアップの相ごとの計測

**Files:**
- Modify: `src/core/read/bootstrap.ts`
- Modify: `src/core/read/bootstrap.test.ts`
- Modify: `src/routes/v1.tsx`
- Modify: `e2e/v1.spec.ts`

**Interfaces:**
- Produces: `WarmUpResult` に `phase1Ms: number` / `phase2Ms: number` を足す

**このタスクだけを先に完了させ、実鍵の数値を人間から受け取ってから Task 2 以降へ進む。**
仕様 11 節のとおり、**相② が支配的でなければこのスライスの前提そのものが崩れる。**

- [ ] **Step 1: 失敗するテストを書く**

`bootstrap.test.ts` に足す。既存のテストのセットアップ（偽リレー、`collect` を
通す形）をそのまま踏襲すること。

主張と、それぞれが捕まえる変異:

| 主張 | 捕まえる変異 |
|---|---|
| `phase1Ms` / `phase2Ms` がどちらも 0 以上で返る | フィールドを足すが値を入れない |
| 相①の間だけ時間が進んだとき、`phase1Ms` にだけ乗る | 2 相を 1 つのタイマーで測る（内訳が出ない） |

**時間の進め方は、既存の `bootstrap.test.ts` が `collect` の解決をどう制御して
いるかに合わせること。** 実時間に依存させない。`performance.now()` を直接
使う実装をテストから制御できない場合は、**計測だけ `Scheduler.now()` を使う形に
してもよい**（Task 2 で `now()` を足すので、順序を入れ替えて Task 2 を先に
やる判断もありうる —— その場合は報告に理由を書くこと）。

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/bootstrap.test.ts`

- [ ] **Step 3: 実装する**

`warmUpRouting` の 2 相（`collect` の呼び出しは `bootstrap.ts` に 2 箇所ある。
1 つ目が `kind:3`、2 つ目が `kind:10002`）をそれぞれ挟む。

- [ ] **Step 4: 開発者モードへ出す**

`src/routes/v1.tsx` の診断表示に `data-testid="warm-up-phases"` を足す
（`warm-up-ms` の隣）。表示は `phase1: N ms / phase2: N ms`。

- [ ] **Step 5: e2e**

既存の「開発者モードのゲート」テストに `warm-up-phases` を足す
（無効なら DOM に無い / 有効なら見える）。

- [ ] **Step 6: 3 つのゲートと変異検証、コミット**

```bash
git add -A
git commit -m "feat(read): measure the two warm-up phases separately"
```

**このタスクの完了後、実鍵での数値を人間に依頼すること。**

---

### Task 2: `Scheduler.now()` と `fetchedAt`

**Files:**
- Modify: `src/core/read/connection-pool.ts`（`Scheduler` / `defaultScheduler`）
- Modify: `src/core/read/fake-clock.ts`
- Modify: `src/core/read/event-store.ts`
- Modify: `src/core/read/event-store.test.ts`
- Modify: 既存のテスト内 `FakeClock`（`connection-pool.test.ts` にローカル版がある）

**Interfaces:**
- Produces:
  - `Scheduler` に `now(): number`
  - `StoredEvent` に `fetchedAt: number`
  - `EventStore` に `fetchedAt(id: string): number | undefined`、
    `replaceableFetchedAt(kind: number, pubkey: string): number | undefined`、
    `invalidate(kind: number, pubkey: string): void`
  - `EventStoreOptions = { scheduler?: Scheduler }`（`EventStore` の
    コンストラクタが時刻源を受ける）

- [ ] **Step 1: `Scheduler.now()` を足す**

```ts
export type Scheduler = {
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  /**
   * 現在時刻 (ミリ秒エポック)。鮮度判定は分岐に使うので、タイマーと同じく
   * 注入できなければテストが時間を決められない。
   */
  now: () => number;
};
```

`defaultScheduler` は `Date.now`。`createFakeClock`（`fake-clock.ts`）は既に
`now` という**ローカル変数**を持っているので、名前の衝突に注意して `now()` を
返すこと。`connection-pool.test.ts` のローカル `FakeClock` にも足す。

**`Scheduler` を実装している箇所を全部洗い出すこと** —— `grep -rn "Scheduler"` で
確認し、型エラーが 0 になるまで直す。

- [ ] **Step 2: `fetchedAt` のテストを書く**

```ts
  it("put は取得時刻を入れる", () => {
    // 捕まえる変異: fetchedAt を event.created_at にする。created_at は
    // 著者が書いた時刻であって取得時刻ではない —— 2 年前の kind:0 を
    // 今取得しても「2 年前に取得した」ことになり、常に stale と判定される
    const clock = createFakeClock();
    clock.advance(5_000);
    const store = new EventStore({ scheduler: clock });
    store.put(sign("x"), "wss://relay/");
    expect(store.fetchedAt(sign("x").id)).toBe(5_000);
  });

  it("invalidate は取得時刻を 0 にする", () => {
    // 捕まえる変異: invalidate がイベントごと消す。消すと「持っていない」に
    // なり、serveWhileRevalidating: true の kind で古い値を出せなくなる
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
    const profile = sign("p", { kind: 0 });
    store.put(profile, "wss://relay/");
    store.invalidate(0, profile.pubkey);
    expect(store.replaceableFetchedAt(0, profile.pubkey)).toBe(0);
    // イベント自体は残る
    expect(store.latestReplaceable(0, profile.pubkey)).toBeDefined();
  });
```

`sign` は `event-store.test.ts` の既存ヘルパー。`kind` を上書きできるように
なっているか確認し、なっていなければ足すこと。

- [ ] **Step 3: 実装する**

`StoredEvent` に `fetchedAt` を足し、`put()` で `this.#scheduler.now()` を入れる。
`EventStore` のコンストラクタに `options?: { scheduler?: Scheduler }` を足し、
既定は `defaultScheduler`。

**`EventStore` を `new EventStore()` で作っている箇所は引数なしのまま動くこと**
（既定引数）。`src/routes/v1.tsx` と `src/routes/debug/v1-section.tsx` が該当。

- [ ] **Step 4: 3 つのゲートと変異検証、コミット**

```bash
git commit -m "feat(read): record when each event was fetched"
```

---

### Task 3: キャッシュポリシー（純関数）

**Files:**
- Create: `src/core/read/cache-policy.ts`
- Create: `src/core/read/cache-policy.test.ts`

**Interfaces:**
- Produces: 仕様 4 節の `Retention` / `CachePolicy` / `policyFor` / `isStale`

**純関数だけ。他のどのファイルにも触らない。**

- [ ] **Step 1: 失敗するテストを書く**

| 主張 | 捕まえる変異 |
|---|---|
| `policyFor(3)` が `staleMs: 0` / `serveWhileRevalidating: false` / `retention: none` | `kind:3` を既定側に落とす（フォローリストが古いまま使われる） |
| `policyFor(10002)` / `policyFor(0)` が表のとおり | 表の値を取り違える |
| 未知の kind が既定（`staleMs: ∞` / `serve: true` / `retention: none`）になる | 未知で例外を投げる（新しい kind が来るたびに落ちる） |
| `isStale` が `now - fetchedAt === staleMs` ちょうどで **false**（まだ新鮮） | 境界を `>=` にする |
| `isStale` が `staleMs: 0` のとき常に true | 0 を「無期限」と取り違える |
| `isStale` が `staleMs: ∞` のとき常に false | ∞ の比較を誤る |
| `fetchedAt: 0`（無効化済み）が常に stale | 0 を「未設定」として特別扱いする |

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/cache-policy.test.ts`
Expected: FAIL —— モジュールが存在しない。

- [ ] **Step 3: 実装する**

仕様 4 節の表をそのまま定数にする。**初期値が暫定であることをコメントに書く**
（根拠のある値ではなく、使いながら詰めるもの）。

- [ ] **Step 4: 3 つのゲートと変異検証、コミット**

```bash
git commit -m "feat(read): decide cache freshness and retention per kind"
```

---

### Task 4: `EventPersistence` seam・インメモリ実装・`hydrate`

**Files:**
- Create: `src/core/read/event-persistence.ts`（型 + インメモリ実装）
- Create: `src/core/read/event-persistence.test.ts`
- Modify: `src/core/read/event-store.ts`（`hydrate`）
- Modify: `src/core/read/event-store.test.ts`

**Interfaces:**
- Produces: 仕様 7 節の `PersistedEvent` / `EventPersistence`、
  `createMemoryPersistence(): EventPersistence`、
  `EventStore.hydrate(entries, options?: { deletedIds?: readonly string[] })`

- [ ] **Step 1: インメモリ実装のテストを書く**

| 主張 | 捕まえる変異 |
|---|---|
| `save` した内容が `load` で戻る（`fetchedAt` も含めて） | `fetchedAt` を保存しない（水和後に鮮度が分からない） |
| `saveDeletions` した id が `load` の `deletedIds` に出る | 削除指示を保存しない（削除済みの投稿が復活する） |
| `dispose` 後の `save` が無視される | ガードを省く |
| **`load` が失敗しても reject せず空を返す** | 例外を投げる（起動が止まる） |

最後の 1 つは、失敗を模す 3 つ目の実装をテスト内に立てて確かめる
（インメモリ実装は失敗しない）。

- [ ] **Step 2: `EventStore.hydrate` のテストを書く**

| 主張 | 捕まえる変異 |
|---|---|
| 署名が壊れていても入る | `hydrate` の中で `verifyEvent` を呼ぶ（水和が 4.7 秒かかる） |
| `verifyCount` が増えない | 同上 |
| **`fetchedAt` は引数の値になる（現在時刻ではない）** | 現在時刻を入れる（**水和のたびに全部が新鮮になり `staleMs` が永久に発火しない**） |
| 既にある id を上書きしない | 無条件に上書きする（リレーから来た新しい版をキャッシュが巻き戻す） |
| `deletedIds` に含まれる id が入らない | 除外を省く（削除済みの投稿が復活する） |
| 形が壊れているもの（`isNostrEvent` を通らない）が入らない | 形の検査を省く |

- [ ] **Step 3: 実装する**

`hydrate` は仕様 8 節のとおり。**`put` と別のメソッドである理由をコメントに
書くこと**（リレー由来の値が誤って通る余地を無くす）。

- [ ] **Step 4: 3 つのゲートと変異検証、コミット**

```bash
git commit -m "feat(read): add the persistence seam and an unverified hydrate path"
```

---

### Task 5: IndexedDB 実装

**Files:**
- Create: `src/core/read/indexeddb-persistence.ts`
- Modify: `src/core/read/event-persistence.test.ts` または新規テスト

**Interfaces:**
- Consumes: Task 4 の `EventPersistence` / `PersistedEvent`、Task 3 の `Retention`
- Produces: `createIndexedDbPersistence(options?): EventPersistence`

- [ ] **Step 1: テスト戦略を決めて報告に書く**

jsdom には IndexedDB が無い。**`fake-indexeddb` を足すか、この実装だけを E2E に
委ねるかを決める。既定は「依存を増やさない側（E2E に委ねる）」** —— 増やすなら
理由を報告に書くこと。

E2E に委ねる場合でも、**`retention` の適用（どのエントリを書くか / 落とすか）は
純関数として切り出し、ユニットテストで固定すること。** IndexedDB を使わずに
確かめられる部分を IndexedDB の中に埋めない。

- [ ] **Step 2: 実装する**

仕様 12 節のとおり。DB 名 `streets.v1`、ストアは `events`（key: イベント id）と
`deletions`（key: 対象 id）、バージョン 1。`onupgradeneeded` は既存ストアを消して
作り直す（移行コードは書かない）。

書き込みは `PERSIST_BATCH_MS = 1000` の窓でまとめる（コアレッサと同じ形、
`Scheduler` を注入する）。

**`retention` の適用:**
- `latest-per-author` —— 同一 `(kind, pubkey)` は `created_at` が大きいほう 1 件。
  同値なら `compareEvents`（`sorted-events.ts`）と同じ全順序で決める
- `none` —— そもそも書かない
- `capped` —— このスライスでは対象の kind が無い。**実装しない**

- [ ] **Step 3: 3 つのゲートと変異検証、コミット**

```bash
git commit -m "feat(read): persist events to IndexedDB"
```

---

### Task 6: ポリシーを参照する 3 箇所

**Files:**
- Modify: `src/core/read/profile-requests.ts` とテスト
- Modify: `src/core/read/bootstrap.ts` とテスト
- （`event-requests.ts` は**変更しない** —— 不変な kind なので現在の判定が正しい）

**Interfaces:**
- Consumes: Task 2 の `EventStore.replaceableFetchedAt`、Task 3 の
  `policyFor` / `isStale`

- [ ] **Step 1: `profile-requests` のテストを書く**

| 主張 | 捕まえる変異 |
|---|---|
| store に無ければ要求する | 既存の挙動（回帰確認） |
| store にあって新鮮なら要求しない | 鮮度を見ずに常に要求する（毎回 194 件を取り直す） |
| store にあっても古ければ要求する | 鮮度を見ずに要求しない（**プロフィールが永久に更新されない**） |

`createProfileRequests` は `scheduler` を既に受けるので、`clock.advance` で
時間を進められる。**`EventStore` にも同じ `scheduler` を渡すこと** —— 別の
時計を使うと鮮度が噛み合わない。

- [ ] **Step 2: `warmUpRouting` 相②のテストを書く**

| 主張 | 捕まえる変異 |
|---|---|
| 新鮮な `kind:10002` を持つ著者が相②の `authors` に入らない | 鮮度を見ずに全員取る（このスライスの効果が消える） |
| 全員新鮮なら相②が `collect` を呼ばない | 空の `authors` で REQ を投げる |
| 古い著者だけが入る | 全員除外する（リレーリストが永久に更新されない） |

- [ ] **Step 3: 実装する**

**相①（`kind:3`）には触らない。** `staleMs: 0` かつ
`serveWhileRevalidating: false` は「毎回取り、取り終わるまで進まない」であり、
今の実装がそのままそれである。

- [ ] **Step 4: 3 つのゲートと変異検証、コミット**

```bash
git commit -m "feat(read): skip fetches whose cached value is still fresh"
```

---

### Task 7: 合成ルートと配線

**Files:**
- Create: `src/core/read/read-layer.ts`
- Create: `src/core/read/read-layer.test.ts`
- Modify: `src/core/solid/create-section.ts`（`store` オプションを削除）
- Modify: `src/routes/v1.tsx`
- Modify: `src/routes/v1/DeckColumn.tsx`
- Modify: `src/routes/debug/v1-section.tsx`
- Modify: `e2e/v1.spec.ts`

**Interfaces:**
- Produces: 仕様 9 節の `ReadLayerOptions` / `ReadLayer` / `createReadLayer`

- [ ] **Step 1: `createReadLayer` のテストを書く**

| 主張 | 捕まえる変異 |
|---|---|
| `ready` が水和の完了で解決する | 水和を待たずに解決する（起動直後の取得が鮮度を見誤る） |
| `load()` が失敗しても `ready` が解決する | reject を伝播させる（起動が止まる） |
| `dispose()` が manager / coalescers / persistence を全部畳む | どれか 1 つを忘れる（`clock.pendingCount` で直接数える） |

- [ ] **Step 2: 実装する**

`createSection` の `store` オプションを削除する。`SectionReader` 側の `store`
オプションは**残す**（テストが `PassThroughStore` を注入する内部の seam）。

- [ ] **Step 3: `/v1` と `/debug/v1-section` を配線する**

`/v1` は `createReadLayer({ connect: connectRelay, persistence: createIndexedDbPersistence() })`。
`/debug/v1-section` は**インメモリ実装**を渡す（デバッグルートが IndexedDB の
状態に依存すると、E2E の再現性が落ちる）。

**`ready` を待つ場所。** ログイン前でも水和は始められる（`kind:10002` は
アカウントに依らない）。`warmUpRouting` を呼ぶ前に `await ready` すること
—— 待たないと相②が「キャッシュはまだ無い」と判断して全員ぶん取ってしまう。

- [ ] **Step 4: e2e**

- 1 回目のロードの後にリロードすると `phase2Ms` が明確に小さくなること
- IndexedDB を消してからリロードすると元に戻ること
  （`page.evaluate` で `indexedDB.deleteDatabase("streets.v1")`）

**この e2e はローカル docker リレーのシード（3 人）に対するもので、
`phase2Ms` の差は小さい。差が測れなければ、その旨を報告に書き、
主張を「2 回目に `collect` が呼ばれない」に置き換えてよい。**

- [ ] **Step 5: 3 つのゲートと e2e、変異検証、コミット**

```bash
git commit -m "feat(read): own the store in a composition root and hydrate on start"
```

---

### Task 8: 記録

**Files:**
- Modify: `docs/adr/0018-indexeddb-event-cache.md`
- Modify: `docs/adr/0019-two-bucket-cache-policy.md`
- Modify: `docs/design/read-layer-followups.md`

**製品コードは変更しない。**

- [ ] **Step 1: ADR-0018 / ADR-0019 に実装の段階を足す**

ADR-0018: `EventPersistence` seam が実装されたこと、`EventStore` が合成ルートの
内部に降りたこと、信用済み挿入が別メソッドになったこと。

ADR-0019: **2 バケットが `CachePolicy.retention` として一般化されたこと。**
分ける理由が「保持ポリシーの違い」から「可変性の違い」に変わったことを書く
（不変な kind に staleness は無い）。`capped` はまだ実装していないことも。

- [ ] **Step 2: 仕様 14 節の 5 問に答える**

`docs/design/read-layer-followups.md` に新しい節を作る。**問 1（相の内訳）は
Task 1 の実鍵計測で答えが出ているはず。**問 2〜5 は実鍵での再確認が要るので、
未取得なら「未取得」と書き、何を読めば分かるかを書く。**推測を書かない。**

- [ ] **Step 3: 繰延事項を Issue にする**

Task 1〜7 の報告ファイルを読み、直さなかったものを **GitHub Issue として作る**
（`docs/design/read-layer-followups.md` はもうバックログではない）。ラベルは
領域 + 優先度、着手前にデザインが要るものは `design-needed`。

- [ ] **Step 4: 3 つのゲート、コミット**

```bash
git commit -m "docs: record what the persistence slice built and what it did not answer"
```

---

## 検証

Task 1 の完了時点で一度止まり、**実鍵での相ごとの内訳**を人間に依頼すること。
② が支配的でなければ、このスライスの前提が崩れるので設計からやり直す。

全タスク完了後に依頼すること:

1. `pnpm dev` → `/v1` でログインし、開発者モードを有効にする
2. **`warm-up-phases` を読む。** 1 回目と、リロード後の 2 回目
3. `first-render-ms` が改善したか
4. **フォローを 1 人外して、リロードせずに / リロードして、その人の投稿が
   出続けないか。** `kind:3` を `serveWhileRevalidating: false` にした理由が
   実地で守られているかの確認
