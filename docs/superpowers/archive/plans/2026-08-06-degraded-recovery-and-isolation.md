# degraded からの復帰経路と、隔離されていないコールバック 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接続層スライス（2026-08-05）が「除外の側」だけで閉じた degraded の配線を、「復帰の側」でも閉じる。あわせて、そのスライスのレビューが park した接続プールの 2 件（隔離されていない `onClosed`、変異を捕まえないゾンビタイマーのテスト）を片付ける。

**Architecture:** 直前のスライスは `ConnectionPool.onDegraded()` → `SubscriptionManager.#scheduleDegradedReplan()` という配線を足して「degraded になった URL を選択から外す」を自動化した。その通知は**degraded へ入る瞬間にしか発火しない**ので、クールダウン満了・ソケットの再オープン・`retryNow()` によって `degradedRelays` から URL が消えても、無関係な `replan()` が起きるまで候補に戻らない。この計画は通知を「degraded 集合の**出入り両方**」に広げ（`onDegraded` → `onDegradedChanged`）、既存のバッチ窓（`DEGRADED_REPLAN_BATCH_MS` = 200ms）にそのまま相乗りさせる。新しい機構は増やさない。

**Tech Stack:** TypeScript / SolidJS / Vitest。変更は `src/core/read/connection-pool.ts` と `src/core/read/subscription-manager.ts` の 2 ファイルとそのテスト、および ADR / followups。

## Global Constraints

- **完了の判定は `pnpm vitest run && pnpm typecheck && pnpm check` の 3 つすべて。**
  `pnpm check` は Biome と読み取り層の依存チェックだけで、**型検査を含まない**
  （型検査は `pnpm typecheck` = `tsc -b`）。Vitest は esbuild で変換するため型
  エラーを一切見ない。3 つ全部が緑になるまで DONE と報告してはいけない。
- **すべてのテストは、捕まえる変異をコメントで名指しし、実際にその変異を製品
  コードへ入れて `pnpm vitest run` が落ちることを確認してから報告すること。**
  期待値を頭の中で導出しただけのテストは、この計画では未完成とみなす。落ちる
  ことを確認したら変異は必ず戻すこと。
- 作業ブランチは `v1`。`main` へは触らない。旧実装（`src/core/read` 以外の
  古い読み取り経路）は無視してよい。
- コメントとドキュメントは日本語。既存ファイルの記述密度に合わせる —— 「なぜ
  そうしたか」を書き、「何をしたか」は書かない。
- 読み取り層は DOM も Node のグローバルも直接掴まない。タイマーは必ず
  `Scheduler` 経由（`connection-pool.ts` の `defaultScheduler`）。
- `docs/design/read-layer-followups.md` の既存の節は**削除しない**。解決したら
  見出しに取り消し線を引き、解決の記述を追記する形にする。

---

### Task 1: `ConnectionPool` — degraded 集合からの離脱も通知する

**Files:**
- Modify: `src/core/read/connection-pool.ts`
- Modify: `src/core/read/subscription-manager.ts`（呼び出し側のリネーム追従のみ）
- Test: `src/core/read/connection-pool.test.ts`

**Interfaces:**
- Consumes: 既存の `#failures`（`{ count, hard, timer }`）、`DEGRADED_AFTER_FAILURES`、`DEGRADED_COOLDOWN_MS`。
- Produces: `ConnectionPool.onDegradedChanged(listener: (url: RelayUrl) => void): () => void`
  —— **`onDegraded` はこの名前に改名する（旧名は残さない）。** ある URL が
  `degradedRelays` に**入った瞬間**と**出た瞬間**の両方で発火する。
  `degradedListenerCount` の意味は変わらない。

**背景（このタスクが直す欠陥）**

`degradedRelays` から URL が消える経路は 3 つある: (a) クールダウン満了
（`#noteFailure` が張るタイマー）、(b) ソケットが実際に開いた
（`#attachConnection` が登録する `onOpen` → `#clearFailures`）、(c) `retryNow()`。
どれも `SubscriptionManager` に一切通知しないので、`selectRelays` の `degraded`
入力からは消えているのに、誰も選び直さない限りその URL は候補外のまま残る。

除外の側は 2026-08-06 の最終レビュー（Important 1）で同じ形の欠陥として見つかり、
`onDegraded` + バッチ replan で閉じた。**復帰の側は、その修正の鏡像として残った隙間
である**（`docs/design/read-layer-followups.md` の「小さいもの」に記録済み）。

- [ ] **Step 1: 失敗する テストを書く（クールダウン満了で通知が出ること）**

`src/core/read/connection-pool.test.ts` の `describe("backoff growth and degraded relays", ...)`
の中、既存の `it("clears degraded after the cooldown elapses with no further failures", ...)`
の直後に足す。ドライブ手順は同じ `describe` 内の既存テストからそのまま踏襲する。

```ts
  // Mutation: revert the cooldown timer's callback in `#noteFailure` to a
  // bare `this.#failures.delete(url)` (its shape before this task). The URL
  // still leaves `degradedRelays`, so the existing cooldown test stays
  // green -- only this one notices that nobody was told, which is exactly
  // how the gap survived the last slice.
  it("notifies when a url leaves the degraded set after the cooldown", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const changed: RelayUrl[] = [];
    pool.onDegradedChanged((url) => changed.push(url));
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // 4th failure -> degraded
    expect(changed).toEqual(["wss://one/"]); // the entry crossing

    sub?.close(); // nobody is waiting; only the cooldown can clear it now

    clock.advance(DEGRADED_COOLDOWN_MS);
    expect(pool.degradedRelays).toEqual([]);
    expect(changed).toEqual(["wss://one/", "wss://one/"]); // and the exit
  });

  // Mutation: drop the notification from `#clearFailures` (keep the delete).
  // A relay that proves it can open again would silently stay excluded from
  // selection until an unrelated replan happened to run.
  it("notifies when a degraded url's socket actually opens", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const changed: RelayUrl[] = [];
    pool.onDegradedChanged((url) => changed.push(url));
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // 4th failure -> degraded

    clock.advance(8000); // the 5th reconnect attempt creates a socket
    connections.get("wss://one/")?.open(); // this time it really opens

    expect(pool.degradedRelays).toEqual([]);
    expect(changed).toEqual(["wss://one/", "wss://one/"]);
  });

  // Mutation: notify unconditionally in `#clearFailures` (i.e. drop the
  // `hard >= DEGRADED_AFTER_FAILURES` guard). Then every ordinary blip --
  // one failure followed by a successful open -- would fire a replan, which
  // is precisely the churn ADR-0021 refuses to create.
  it("does not notify when a url that never degraded loses its history", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const changed: RelayUrl[] = [];
    pool.onDegradedChanged((url) => changed.push(url));
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die(); // a single failure: not degraded
    clock.advance(1000);
    connections.get("wss://one/")?.open(); // and it comes straight back

    expect(pool.degradedRelays).toEqual([]);
    expect(changed).toEqual([]);
  });

  // Mutation: route `dispose()`'s failure-history teardown through
  // `#clearFailures` instead of clearing the map directly. Disposal is not
  // a recovery -- there is no pool left to re-plan for, and the manager has
  // already unsubscribed, so a notification here can only reach a listener
  // that outlived its owner.
  it("does not notify on dispose()", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const changed: RelayUrl[] = [];
    pool.onDegradedChanged((url) => changed.push(url));
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // 4th failure -> degraded
    expect(changed).toEqual(["wss://one/"]);

    pool.dispose();
    expect(changed).toEqual(["wss://one/"]); // no exit notification
  });
```

既存の 3 つの `onDegraded(...)` 呼び出し（同ファイル内、`describe("onDegraded", ...)`
相当の箇所）も `onDegradedChanged` に改名する。`RelayUrl` は既にこのファイルで
import 済み。

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/connection-pool.test.ts`
Expected: FAIL —— `pool.onDegradedChanged is not a function`。

- [ ] **Step 3: 実装する**

`src/core/read/connection-pool.ts` に 4 箇所。

(a) `onDegraded` を `onDegradedChanged` に改名し、doc コメントを「入る瞬間」から
「degraded 集合への出入り両方」に書き換える。ADR-0021 と矛盾しない理由（ブリップ
では起こらない閾値越えであること、1 URL につきクールダウンごとに高々 1 往復で
あること）はそのまま残し、**離脱側も同じ理由で churn にならない**ことを書き足す。

(b) 通知の発火を 1 箇所に集める private メソッドを足す:

```ts
  /**
   * `degradedRelays` の membership が変わった URL を購読者へ知らせる。
   * **入る側 (`#noteFailure`) と出る側 (`#clearFailures`) の両方から呼ぶ** ——
   * 出る側が無かったために、クールダウンが明けて候補に戻せるようになった
   * リレーが、無関係な `replan()` が起きるまで候補外のまま残っていた
   * (接続層スライスの積み残し、`docs/design/read-layer-followups.md`)。
   *
   * 集合をコピーしてから回すのは、listener が購読解除を呼んだ場合に
   * 反復中の Set を変更しないため (`onDegradedChanged` の解除関数は
   * `#degradedListeners.delete` を呼ぶ)。
   */
  #notifyDegradedChanged(url: RelayUrl): void {
    for (const listener of [...this.#degradedListeners]) listener(url);
  }
```

`#noteFailure` の末尾の for ループはこのメソッド呼び出しに置き換える。

(c) `#clearFailures` を、消す前の `hard` を見て通知するように変える:

```ts
  /**
   * `url` の失敗履歴を消す。呼ばれるのは実際に開いた時 (`#attachConnection`
   * が登録する `onOpen`)、人間が起こした `retryNow()`、そしてクールダウンの
   * 満了 (`#noteFailure` が張るタイマー) の 3 箇所。
   *
   * 消す前に degraded だったなら、その URL は今この瞬間に degraded 集合から
   * 出たことになるので購読者へ通知する —— `selectRelays` の `degraded` 入力
   * から消えただけでは何も起きない (ADR-0021)。**通知しないと、復帰した
   * リレーは次に無関係な `replan()` が走るまで候補に戻らない。**
   */
  #clearFailures(url: RelayUrl): void {
    const existing = this.#failures.get(url);
    if (!existing) return;
    this.#scheduler.clearTimeout(existing.timer);
    this.#failures.delete(url);
    if (existing.hard >= DEGRADED_AFTER_FAILURES) {
      this.#notifyDegradedChanged(url);
    }
  }
```

(d) 履歴を消す残り 2 箇所をこのメソッドへ寄せる。

`#noteFailure` のクールダウンタイマー:

```ts
    const timer = this.#scheduler.setTimeout(() => {
      // `#failures.delete` を直に呼ばない —— クールダウン満了は degraded
      // 集合からの離脱そのものであり、通知経路を通らない削除を作ると、
      // まさにこのタスクが塞いでいる隙間が別の場所に再発する。
      // 発火済みのタイマーに対して `#clearFailures` が `clearTimeout` を
      // 呼び直すが、これは無害 (実タイマーでは no-op、偽クロックでは
      // 既に消えた id の delete)。
      this.#clearFailures(url);
    }, DEGRADED_COOLDOWN_MS);
```

`retryNow()` の末尾の一括クリア:

```ts
    // `#failures.clear()` を直に呼ばない —— degraded だった URL は今ここで
    // 集合から出るので、購読者に知らせないと手動再試行が「バックオフだけ
    // 消して選択には反映されない」半端な操作になる。キーはスナップショット
    // を取ってから回す (`#clearFailures` が反復対象の Map を変更する)。
    for (const url of [...this.#failures.keys()]) this.#clearFailures(url);
```

`dispose()` の一括クリアは**そのまま直接消す**（通知しない）。理由をコメントに足す:

```ts
    // dispose() は復帰ではない。ここを `#clearFailures` に寄せると、
    // 自分より長生きした listener にだけ届く通知を作ることになる
    // (`SubscriptionManager.dispose()` は #offDegraded を先に呼んでから
    // pool.dispose() する)。意図的に直接消す。
```

`degradedListenerCount` の doc コメント中の `onDegraded()` という参照も新しい名前に直す。

- [ ] **Step 4: 呼び出し側を追従させる**

`src/core/read/subscription-manager.ts`:
- コンストラクタの `this.#pool.onDegraded(...)` を `onDegradedChanged(...)` に。
- `#offDegraded` フィールド名はそのままでよい（購読解除であることは変わらない）が、
  doc コメント中の `pool.onDegraded()` という参照はすべて新しい名前に直す。
- `DEGRADED_REPLAN_BATCH_MS` と `#scheduleDegradedReplan` の doc コメントを、
  「degraded への遷移」から「degraded 集合の出入り」に書き換える。バッチが復帰側
  でも同じ理由で効くこと（ネットワーク復帰時に 30 本が相次いで degraded を抜ける）
  を書く。
- `replan()` の doc コメント中の同様の参照も直す。

`src/core/read/subscription-manager.test.ts` にも `onDegraded` を名指しした
コメントがある。名前を直すこと（挙動の記述が「遷移」に限定されている箇所は
「出入り」に直す）。

- [ ] **Step 5: 3 つのゲートを走らせる**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Expected: 全部 PASS。

- [ ] **Step 6: 名指しした変異を実際に入れて、テストが落ちることを確認する**

Step 1 の 4 つのテストそれぞれについて、コメントが名指しする変異を製品コードへ
入れ、`pnpm exec vitest run src/core/read/connection-pool.test.ts` が**そのテスト
だけ**落ちることを確認する。確認できたら変異を戻す。落ちなかったテストは、
テストのほうが間違っているので直すこと。結果は報告ファイルに 4 件とも書く。

- [ ] **Step 7: コミット**

```bash
git add src/core/read/connection-pool.ts src/core/read/connection-pool.test.ts src/core/read/subscription-manager.ts src/core/read/subscription-manager.test.ts
git commit -m "fix(read): notify on leaving the degraded set, not just entering it"
```

---

### Task 2: `SubscriptionManager.retryNow()` が再選択を起こす

**Files:**
- Modify: `src/core/read/subscription-manager.ts`
- Test: `src/core/read/subscription-manager.test.ts`

**Interfaces:**
- Consumes: Task 1 の `ConnectionPool.onDegradedChanged`、既存の `#runReplan()`、
  `#degradedReplanTimer`、`DEGRADED_REPLAN_BATCH_MS`。
- Produces: シグネチャの変更なし（`retryNow(): void` のまま）。

**背景（このタスクが直す欠陥）**

`retryNow()` は `pool.retryNow()` へ委譲するだけで、再選択を起こさない。選択から
外され `#drop` まで済んだ degraded なリレーには `Pooled` レコードがもう無いので、
プール側の再接続ループは何もできず、失敗履歴を消した効果は次の無関係な `replan()`
まで現れない（`docs/design/read-layer-followups.md` の「小さいもの」に記録済み）。

Task 1 によって `pool.retryNow()` は degraded だった URL について通知を出すように
なるので、**バッチ窓（200ms）経由で replan は起きるようになる**。それでもここで
明示的に replan するのは 2 つの理由による: (1) `retryNow()` は人間が起こした操作で
あり、「今すぐ試す」という意味論に 200ms の窓を挟む理由が無い。(2) 依存の向きが
逆になる —— 「手動再試行が効くのは、たまたま degraded な URL が 1 本以上あって
通知が出たから」では、degraded が 0 本のとき（バックオフ待ちのリレーはあるが
まだ 4 回失敗していない、という普通の状態）に何も起きない。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/subscription-manager.test.ts` の degraded 関連の `describe` の中、
`it("replans automatically when a relay crosses into degraded", ...)` 相当のテスト
（`wss://dead/` を 4 回殺して `plans` を見るもの）の直後に足す。ヘルパー
（`pubkeyFor` / `relayListFor` / `createFakeClock`）はすべてこのファイルに既にある。

```ts
  // Mutation: revert `retryNow()` to a bare `this.#pool.retryNow()`. The
  // degraded URL's failure history is cleared either way, so
  // `degradedRelays` goes empty and the pool looks healthy -- but nothing
  // re-selects, so the relay stays out of every section's plan. Note the
  // assertions run with NO clock.advance(): once Task 1 notifies on the way
  // out of the degraded set, advancing the clock would replan through the
  // batch window and hide the defect entirely.
  it("retryNow() re-selects a degraded relay synchronously, and leaves no second replan queued", () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const clock = createFakeClock();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url, { autoOpen: false });
        connections.set(url, relay);
        return relay;
      },
      fallbackRelays: [],
      scheduler: clock,
      random: () => 0.5,
    });

    const author = pubkeyFor(44_010);
    store.put(relayListFor(author, ["wss://dead/"]), "wss://indexer/");

    const plans: SectionPlan[] = [];
    manager.subscribe([{ kinds: [1], authors: [author] }], undefined, {
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: () => {},
      onPlanChanged: (plan) => plans.push(plan),
      onRelayRestarted: () => {},
    });

    connections.get("wss://dead/")?.die(); // failure 1
    clock.advance(1000);
    connections.get("wss://dead/")?.die(); // failure 2
    clock.advance(2000);
    connections.get("wss://dead/")?.die(); // failure 3
    clock.advance(4000);
    connections.get("wss://dead/")?.die(); // failure 4 -> degraded
    clock.advance(DEGRADED_REPLAN_BATCH_MS); // the exclusion replan

    expect(plans).toHaveLength(1);
    expect(plans[0].relays).toEqual([]); // dropped from the plan
    expect(plans[0].uncoveredAuthors).toBe(1);

    // The human hits "retry now". The pooled record for wss://dead/ is
    // already gone (the replan above dropped its last subscriber), so
    // `ConnectionPool.retryNow()`'s loop over live records cannot reach it
    // at all -- clearing the failure history is all the pool can do. Only a
    // re-selection can put the relay back in the plan.
    manager.retryNow();

    expect(manager.pool.degradedRelays).toEqual([]);
    expect(plans).toHaveLength(2);
    expect(plans[1].relays).toEqual(["wss://dead/"]);
    expect(plans[1].uncoveredAuthors).toBe(0);

    // Mutation: drop the pending-batch teardown from `retryNow()`. Task 1's
    // notification arms the batch timer on the way through
    // `pool.retryNow()`; leaving it armed costs a second, redundant replan
    // 200ms after every manual retry. Nothing else is scheduled at this
    // point (the reconnect timer died with the dropped record, the cooldown
    // timer was just cleared), so the count is exact.
    expect(clock.pendingCount).toBe(0);
  });
```

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/subscription-manager.test.ts`
Expected: FAIL（主張 1 が落ちる）。

- [ ] **Step 3: 実装する**

```ts
  /**
   * 手動再試行 (ADR-0021)。プールへ委譲したうえで、**必ず再選択も起こす。**
   *
   * 委譲だけでは足りない: degraded になって選択から外れた URL は購読者が
   * 居なくなり `#drop` で `Pooled` レコードごと消えているので、プール側の
   * `retryNow()` のループ (生きているレコードだけを回る) には最初から
   * 届かない。プールができるのは失敗履歴を消すことだけで、その URL を
   * 実際に開き直すには誰かが選び直さなければならない。
   *
   * Task 1 の `onDegradedChanged` はこの履歴削除でも発火するので、放っておいて
   * もバッチ窓 (`DEGRADED_REPLAN_BATCH_MS`) の後に replan は起きる。それでも
   * ここで同期的に呼ぶのは、`retryNow()` が人間の「今すぐ試す」であることと、
   * degraded が 1 本も無い状態 (バックオフ待ちはあるが 4 回には達していない)
   * でこの通知が一切出ないことの 2 つによる。
   *
   * 上で replan 済みなので、保留中のバッチタイマーは畳む —— 残すと手動再試行
   * 1 回につき 200ms 差で replan が 2 回走る。
   */
  retryNow(): void {
    this.#pool.retryNow();
    this.#runReplan();
    if (this.#degradedReplanTimer !== null) {
      this.#scheduler.clearTimeout(this.#degradedReplanTimer);
      this.#degradedReplanTimer = null;
    }
  }
```

- [ ] **Step 4: 3 つのゲートを走らせる**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Expected: 全部 PASS。

- [ ] **Step 5: 名指しした変異を実際に入れて、テストが落ちることを確認する**

Step 1 の 2 つの主張それぞれについて確認し、結果を報告ファイルに書く。

- [ ] **Step 6: コミット**

```bash
git add src/core/read/subscription-manager.ts src/core/read/subscription-manager.test.ts
git commit -m "fix(read): make retryNow() re-select, not just clear the backoff"
```

---

### Task 3: 1 セクションの `onClosed` が投げても、残りのエントリの張り直しを止めない

**Files:**
- Modify: `src/core/read/connection-pool.ts`（`#attachConnection` のみ）
- Test: `src/core/read/connection-pool.test.ts`

**Interfaces:**
- Consumes: なし（既存の `#attachConnection` の内部のみ）。
- Produces: 公開インターフェースの変更なし。

**背景（このタスクが直す欠陥）**

`#attachConnection` の末尾のループは、エントリごとに `connection.subscribe()` を
呼び、失敗したエントリについて `entry.handlers.onClosed("relay unavailable")` を
**素で**呼んでいる。`handlers` は任意の消費者コード（`SectionReader` 経由の
セクション）である。1 つが投げると例外はループの外へ出て、**まだ処理していない
残りのエントリは REQ を張り直してもらえないまま**、しかもソケットは生きている
ので `#onConnectionDied` も二度と起きず、そのカラムはページの寿命が尽きるまで
沈黙する（ADR-0011 が禁じる「隠れた劣化」）。

これは縦断スライスの最終レビュー finding 4 が `#replanOnce` /
`SectionReader.#notify()` で塞いだのと**同じ形**で、当時この経路は差分に含まれて
いなかったため残った（`docs/design/read-layer-followups.md` の「小さいもの」）。

隔離の作法は既存の 2 箇所（`SubscriptionManager.#deliver`、
`SectionReader.#notify`）に合わせる: `try`/`catch` で握り、`console.error` に
「隔離した」ことを書いて落とす。専用の報告チャネルは無い。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/connection-pool.test.ts` に足す。`subscribeFailing` オプション
（`createPool` に既にある: その URL の `connection.subscribe()` が投げる）を使うと、
`#attachConnection` の catch 節を確実に通せる。

```ts
  // Mutation: remove the try/catch around `entry.handlers.onClosed(...)` in
  // `#attachConnection`. The first entry's throwing handler then escapes the
  // loop, so the second entry never gets its own `onClosed` -- and on a
  // revival where only *some* entries fail to re-subscribe, the survivors
  // never get their REQ back either. Same shape as the vertical slice's
  // final-review finding 4 (`#replanOnce` / `SectionReader.#notify`).
  it("isolates a throwing onClosed so the remaining entries are still served", () => {
    const { pool, connections } = createPool({
      subscribeFailing: ["wss://one/"],
    });

    const seen: string[] = [];
    pool.subscribe("wss://one/", [{ kinds: [1] }], {
      ...noopHandlers(),
      onClosed: () => {
        seen.push("first");
        throw new Error("consumer blew up");
      },
    });
    pool.subscribe("wss://one/", [{ kinds: [2] }], {
      ...noopHandlers(),
      onClosed: () => {
        seen.push("second");
      },
    });

    // Kill the socket so the reconnect path re-runs `#attachConnection`
    // over *both* entries in one loop -- that loop is what the isolation
    // protects. (The initial `subscribe()` calls above deliver their own
    // `onClosed` synchronously and independently, one per call.)
    seen.length = 0;
    connections.get("wss://one/")?.die();
    pool.retryNow();

    expect(seen).toEqual(["first", "second"]);
  });
```

`console.error` がテスト出力を汚す場合は `vi.spyOn(console, "error")` で黙らせて
よい（このリポジトリの他のテストに前例があればそれに合わせる）。ただし
**「隔離した」ことの主張は `seen` の中身で行うこと** —— `console.error` が呼ばれた
ことを主張するテストは、報告経路を実装に固定してしまう。

`subscribeFailing` を使ったときの初回 `subscribe()` の挙動、および `die()` →
`retryNow()` で `#attachConnection` を再度通せるかは、実装を読んで確認すること。
`retryNow()` が使えない形になっていたら、代わりにバックオフのタイマーを
`clock.advance()` で進めて再接続を発火させる（`createPool` の `random: () => 0.5`
で遅延は決定的になる）。**このテストが `#attachConnection` のループを 2 エントリで
通ることを、実際に確認してから先へ進むこと。**

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/connection-pool.test.ts`
Expected: FAIL —— `seen` が `["first"]` で止まる（例外がループの外へ出る）。

- [ ] **Step 3: 実装する**

`#attachConnection` の末尾のループ:

```ts
    for (const entry of pooled.entries) {
      try {
        entry.subscription = connection.subscribe(
          entry.filters,
          entry.handlers,
        );
      } catch {
        entry.subscription = null;
        // 呼び出し先は任意の消費者コード (セクション) であり、ここは複数
        // エントリを 1 つのループで処理している。無防備に呼ぶと、1 つの
        // セクションのコールバックが投げただけで、まだ張り直していない
        // 残りのエントリが REQ 無しのまま取り残される —— ソケットは生きて
        // いるので `#onConnectionDied` も二度と起きず、そのカラムはページの
        // 寿命が尽きるまで沈黙する (ADR-0011 が禁じる隠れた劣化)。
        // `SubscriptionManager.#deliver` / `SectionReader.#notify` と同じ
        // 作法: 専用の報告チャネルは無いので console.error に落とす。主目的
        // は隔離であって報告ではない。
        try {
          entry.handlers.onClosed("relay unavailable");
        } catch (error) {
          console.error(
            "ConnectionPool: an onClosed handler threw while re-attaching; isolating it so the remaining entries keep their subscriptions.",
            error,
          );
        }
      }
    }
```

- [ ] **Step 4: 3 つのゲートを走らせる**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Expected: 全部 PASS。

- [ ] **Step 5: 名指しした変異を実際に入れて、テストが落ちることを確認する**

結果を報告ファイルに書く。

- [ ] **Step 6: コミット**

```bash
git add src/core/read/connection-pool.ts src/core/read/connection-pool.test.ts
git commit -m "fix(read): isolate a throwing onClosed during re-attachment"
```

---

### Task 4: ゾンビタイマーのテストを作り直し、ドキュメントを実態に合わせる

**Files:**
- Modify: `src/core/read/connection-pool.test.ts`（既存テスト 1 件の書き換え）
- Modify: `docs/adr/0021-reconnection-policy.md`
- Modify: `docs/adr/0025-greedy-relay-selection-under-a-global-budget.md`
- Modify: `docs/design/read-layer-followups.md`

**Interfaces:**
- Consumes: Task 1〜3 の成果すべて。製品コードは**変更しない**。

**背景**

`it("does not leave a zombie reconnect timer that later undoes the revival's bookkeeping", ...)`
（`connection-pool.test.ts`）は、名指ししている変異を捕まえない。縦断スライスの
最終レビューが `#attachConnection` のタイマークリア処理を削除して走らせたところ
**通ってしまった** —— `connectCalls` が増えないことしか見ておらず、`#reconnect()`
の `pooled.connection` ガードによってタイマーの有無に関わらず真になるため。
**製品コードは正しい**（直読と、もう 1 つのテストの変異検出で確認済み）。

道具は同じファイルに既にある: `clock.clearTimeoutCallCount` は「`connectCalls` が
増えないことはタイマーが消えた証明にならない、スケジューラ自身の呼び出し回数を
直接数えるしかない」という理由で以前の修正ラウンドが追加したもので、このテストは
それを使っていない。

- [ ] **Step 1: テストを書き換える**

`connectCalls` の主張は残したまま、**タイマーが実際に `clearTimeout` された**
ことを直接数える主張を足す。

```ts
  it("does not leave a zombie reconnect timer that later undoes the revival's bookkeeping", async () => {
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0.5,
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();

    // The death armed a backoff timer. Count clears from here: the only
    // thing that may clear a timer between this point and the assertion is
    // `#attachConnection` cancelling that pending backoff on revival.
    const clearsBeforeRevival = clock.clearTimeoutCallCount;

    await pool.publish("wss://one/", fakeEvent("a"));
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);

    // Mutation: delete the `pooled.timer` teardown at the top of
    // `#attachConnection`. The old version of this test only advanced the
    // clock and asserted `connectCalls` stayed flat -- which holds either
    // way, because `#reconnect()`'s `pooled.connection` guard makes the
    // leaked timer a no-op. Counting the scheduler's own calls is the only
    // direct evidence that the timer was cancelled rather than merely
    // rendered harmless (final review of the vertical slice; the same
    // reasoning that added `clearTimeoutCallCount` in the first place).
    //
    // publish() also arms and clears its own PUBLISH_TIMEOUT_MS timer, so
    // the revival's cancellation is not the only clear in this window --
    // assert on the exact total, which pins both.
    expect(clock.clearTimeoutCallCount).toBe(clearsBeforeRevival + 2);

    // And the original assertion: no stale timer ever fires a reconnect.
    clock.advance(60_000);
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);
  });
```

**`+ 2` は仮の数である。** 実際にこの窓で `clearTimeout` が何回呼ばれるかを、
テストを走らせて確認し、正しい数に直すこと（`publish()` の成功経路は
`PUBLISH_TIMEOUT_MS` のタイマーを 1 本張って 1 本消す）。**数を導出で決めない。**
確認したうえで、その数の内訳をコメントに書くこと。

- [ ] **Step 2: 変異を入れて、書き換えたテストが落ちることを確認する**

`#attachConnection` の先頭の

```ts
    if (pooled.timer !== null) {
      this.#scheduler.clearTimeout(pooled.timer);
      pooled.timer = null;
    }
```

を削除して `pnpm exec vitest run src/core/read/connection-pool.test.ts` を走らせる。
**このテストが落ちること**を確認する（旧版は通ってしまっていた）。確認したら戻す。
結果は報告ファイルに書く。

- [ ] **Step 3: ADR-0021 を更新する**

`docs/adr/0021-reconnection-policy.md` の「『諦めない』と『再選択の候補から外す』は
別の問い（Task 4 追記）」節:

- `ConnectionPool.onDegraded(listener)` を名指ししている段落を
  `onDegradedChanged(listener)` に直し、「到達した瞬間だけ通知する」を
  「degraded 集合に入る瞬間と出る瞬間の両方で通知する」に直す。
- 最後の段落の **「この『戻り』には専用の起動経路が無い」以降を書き換える。**
  現在この段落は復帰側の隙間を「残っている」と記録しているが、この計画で閉じた。
  クールダウン満了・`onOpen`・`retryNow()` の 3 経路すべてが通知を出すこと、
  復帰側の通知も同じバッチ窓に相乗りすること、そして**復帰側も churn を作らない
  理由**（degraded を抜けるには degraded に入っている必要があり、それ自体が
  `DEGRADED_AFTER_FAILURES` 回の連続失敗を要する）を書く。
- 「手動再試行」の行（決定の表）と、実装の箇条書きの `retryNow()` の項に、
  **`SubscriptionManager.retryNow()` は再選択も起こす**ことを足す。「プールへ
  そのまま委譲する」という記述は Task 2 で偽になるので必ず直す。

- [ ] **Step 4: ADR-0025 を更新する**

`docs/adr/0025-greedy-relay-selection-under-a-global-budget.md` の
`onDegraded()` を名指ししている箇所を新しい名前に直し、通知が出入り両方である
ことを 1 文で足す。

- [ ] **Step 5: followups を更新する**

`docs/design/read-layer-followups.md`:

- 「小さいもの」の表から**行を削除しない。** 該当する 3 行（`subscription-manager.ts`
  の degraded 復帰、`subscription-manager.ts` の `retryNow()`、
  `connection-pool.test.ts` のゾンビタイマー、`connection-pool.ts` の
  `#reconnect()` の素の `onClosed`）の内容を、取り消し線と「2026-08-06 修正済み」
  の追記に書き換える。何をどう直したかを 1〜2 文で書く。
- 「死んだままのリレーが枠を永久に食いつぶす」節の末尾（Important 1 の訂正段落の
  後）に、**復帰側も同じ配線で閉じた**ことを追記する。除外側と復帰側が同じ
  `onDegradedChanged` + 同じバッチ窓の上に乗ったこと、そして
  「同じ形の隙間が復帰の側に残っている」という既存の記述はもう成り立たない
  ことを明記する（既存の文は消さず、追記で訂正する）。
- `#ensureConnection()` の空 `Pooled` レコードの行について: **実装を読んで、
  この記述が今も正しいか確かめること。** `publish()` は `entries.size === 0 &&
  holds === 0` のとき `#drop(url)` を呼んでいる。もし既に解決しているなら、
  その行も取り消し線にして「いつどのタスクで解決したか」を書く。まだ残っている
  経路があるなら、その経路を具体的に書き直す。**どちらであるかを実装から判定し、
  報告ファイルに根拠を書くこと。**

- [ ] **Step 6: 3 つのゲートを走らせる**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Expected: 全部 PASS。

- [ ] **Step 7: コミット**

```bash
git add src/core/read/connection-pool.test.ts docs/
git commit -m "test(read): make the zombie-timer test catch its own mutation

docs: record the degraded recovery wiring in ADR-0021/0025 and followups"
```

---

## 検証

自動テストで閉じられる範囲はタスク内で閉じている。このスライスは実鍵での確認を
**必要としない** —— 直しているのはいずれも既存の自動テストで観測可能な経路であり、
前回のスライスのように「実装から導いた予測」に依存していない。

ただし前回の実鍵確認と同じ手順をもう一度踏むなら、次の 1 点だけ新しく見える:
`/v1-preview` を開いたまま数分放置し、到達不能なリレーが degraded になった後
`DEGRADED_COOLDOWN_MS`（5 分）を跨ぐと、そのリレーが自動的に候補へ戻り、
（依然として到達不能なら）また失敗して degraded に戻る、という 5 分周期の
サイクルが観測できるはずである。これは意図した挙動である —— 恒久的に到達不能な
リレーを永久に切り捨てるより、5 分に 1 回だけ試し直すほうが ADR-0021 の
「永久に諦めない」に忠実であり、頻度としても十分に低い。
