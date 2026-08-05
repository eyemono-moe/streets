# 接続層の実地修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 縦断スライスの実鍵検証で実地観測された接続層の 3 つの欠陥を直す —— 伸びない指数バックオフ、恒久的に死んだリレーが枠を食いつぶす問題、接続を保持するためだけに REQ を悪用しているアンカー。

**Architecture:** 3 つとも `ConnectionPool` に集まるが、原因は別々である。(A) `attempts` のリセットが「`connect()` が返った」時点で起きているため、`RelayConnection` に `onOpen` の seam を足して「本当に開いた」時点に移す。(B) 失敗回数が `Pooled` に載っているためエントリが消えると一緒に消える。プール寿命の `#failures` へ移し、閾値を超えた URL を `degradedRelays` として公開して `selectRelays` の入力にする。復帰経路はクールダウンタイマー（サーキットブレーカの half-open 相当）で作る。(C) アンカーは「接続を握っておきたい」という要求を購読として表現したもの。`pool.hold()` という一級の API にして、ワイヤに REQ を出さない。

**Tech Stack:** TypeScript, Vitest, SolidJS（この計画は UI に触れない）

## Global Constraints

- **[ADR-0014](../../adr/0014-thin-relay-connection.md)**: `RelayConnection` は 1 リレーとだけ話す。同報もリレー選択も持たない。`onOpen` は `onClose` と対称な、そのソケット自身の状態通知に限る。
- **[ADR-0021](../../adr/0021-reconnection-policy.md)**: 初回 1 秒からの指数バックオフ、上限 60 秒、ジッタ `0.5〜1.5` 倍。**購読者が居る限り再接続を諦めない。** 本計画はこの方針を変更しない —— 「再接続を諦めるか」と「再選択の候補にするか」は別の問いであり、触るのは後者だけである。
- **[ADR-0011](../../adr/0011-performance-budget.md)**: 同時接続 30 本。**劣化を隠してはならない。** degraded による除外で著者が被覆できなくなった場合、その著者は `uncovered` として正直に報告されなければならない（黙って消してはならない）。
- **[ADR-0025](../../adr/0025-greedy-relay-selection-under-a-global-budget.md)**: `selectRelays` は純関数。`pinned` は予算を消費するが決して落とされない。
- **[ADR-0020](../../adr/0020-no-high-level-nostr-library.md)**: 高水準 Nostr ライブラリに依存しない。
- テストは**それが捕まえる変異を名指しする**こと。期待値は導出ではなく実行して確かめること。「呼ばれた回数が増えない」系の主張は、原因が別にあっても真になりうるので、直接の観測量（タイマー呼び出し回数、ワイヤに出た REQ の数）で書くこと。
- 既存テストを緑のまま保つこと。`FakeRelayConnection` の既定の挙動は変えない。

---

### Task 1: `RelayConnection` に `onOpen` の seam を足す

**Files:**
- Modify: `src/core/relay/relay-connection.ts`
- Modify: `src/core/relay/websocket-relay-connection.ts`
- Modify: `src/core/relay/fake-relay-connection.ts`
- Test: `src/core/relay/websocket-relay-connection.test.ts`, `src/core/relay/fake-relay-connection.test.ts`

**Interfaces:**
- Consumes: 既存の `RelayConnection` インターフェース
- Produces: `RelayConnection.onOpen(listener: () => void): () => void`、`FakeRelayConnection` の `{ autoOpen?: boolean }` 構築オプションと `open()` メソッド

**なぜ必要か:** `connectRelay` は `new WebSocket(url)` を作って即座に返る。ソケットが開いたかどうかは誰も見ていない。プール（Task 2）が「本当に繋がった」を知る手段が今は 1 つも無い。

- [ ] **Step 1: 失敗するテストを書く（WebSocketRelayConnection）**

`src/core/relay/websocket-relay-connection.test.ts` に追記する。既存テストが使っている偽ソケットのヘルパをそのまま使うこと（ファイル先頭を読んで名前を合わせる）。

```ts
describe("onOpen", () => {
  // 変異: socket.onopen から通知を外すと落ちる。
  it("fires when the socket opens", () => {
    const socket = createFakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const calls: string[] = [];
    connection.onOpen(() => calls.push("open"));

    expect(calls).toEqual([]); // まだ開いていない
    socket.onopen?.();
    expect(calls).toEqual(["open"]);
  });

  // 変異: 「登録時に既に開いていたら即座に呼ぶ」分岐を消すと落ちる。
  // プールは接続を作った後に listener を登録するので、この分岐が無いと
  // 速いソケットの open を取りこぼす。
  it("fires immediately when registered after the socket is already open", () => {
    const socket = createFakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    socket.onopen?.();

    const calls: string[] = [];
    connection.onOpen(() => calls.push("late"));
    expect(calls).toEqual(["late"]);
  });

  // 変異: 戻り値の解除関数を no-op にすると落ちる。
  it("returns an unsubscribe function", () => {
    const socket = createFakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const calls: string[] = [];
    const off = connection.onOpen(() => calls.push("a"));
    off();
    socket.onopen?.();
    expect(calls).toEqual([]);
  });

  // 変異: open 済みフラグを立てないと、死んだ後の遅い登録でも発火して
  // しまい、プールが死んだ接続の attempts をリセットする。
  it("does not fire for a listener registered after the socket died without opening", () => {
    const socket = createFakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    socket.onclose?.();

    const calls: string[] = [];
    connection.onOpen(() => calls.push("never"));
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm vitest run src/core/relay/websocket-relay-connection.test.ts`
Expected: FAIL — `connection.onOpen is not a function`

- [ ] **Step 3: `RelayConnection` に宣言を足す**

`src/core/relay/relay-connection.ts` の `onClose` の直前に置く:

```ts
  /**
   * ソケットが**実際に開いた**ことを通知する。`onClose` と対称。
   *
   * 接続の生成 (`new WebSocket(url)`) は即座に返り、その時点では開いて
   * いない。プールはこの通知が無いと「ソケットを作れた」と「繋がった」を
   * 区別できず、恒久的に到達不能なリレーに対しても再接続の指数バック
   * オフが 2⁰ から一度も伸びない (ADR-0021 との食い違い、2026-08-05 に
   * 実地観測)。
   *
   * 既に開いている接続に登録した場合はその場で呼ぶ (`onClose` と同じ
   * 規約)。一度も開かないまま死んだ接続に登録しても呼ばれない。
   * 戻り値は購読解除。
   */
  onOpen(listener: () => void): () => void;
```

- [ ] **Step 4: `WebSocketRelayConnection` に実装する**

フィールドを足す（`#closeListeners` の隣）:

```ts
  readonly #openListeners = new Set<() => void>();
  #opened = false;
```

既存の `socket.onopen` ハンドラ（`outbox` を流すところ）の**末尾**に通知を足す:

```ts
    socket.onopen = () => {
      const queued = this.#outbox.splice(0);
      for (const message of queued) socket.send(message);
      // キューを流し終えてから通知する — listener から publish された
      // メッセージが、既に取り出し済みのキューの後ろに紛れないように。
      this.#opened = true;
      for (const listener of [...this.#openListeners]) listener();
    };
```

`onClose` の実装の隣に:

```ts
  onOpen(listener: () => void): () => void {
    if (this.#opened) {
      listener();
      return () => {};
    }
    if (this.#closed) return () => {};
    this.#openListeners.add(listener);
    return () => {
      this.#openListeners.delete(listener);
    };
  }
```

ソケットが死ぬ経路（`#closed = true` を立てているところ、`onclose`/`onerror`/`close()` すべて）で `this.#openListeners.clear()` を呼ぶこと。開かないまま死んだ接続の listener が後から発火しないようにする。

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm vitest run src/core/relay/websocket-relay-connection.test.ts`
Expected: PASS（既存テストも全部）

- [ ] **Step 6: `FakeRelayConnection` のテストを書く**

`src/core/relay/fake-relay-connection.test.ts` に追記:

```ts
describe("onOpen", () => {
  // 変異: 既定を autoOpen: false にすると、既存のプールのテストが
  // 一斉に落ちる (どれも構築した瞬間から生きている前提)。
  it("is open from construction by default", () => {
    const connection = new FakeRelayConnection("wss://a");
    const calls: string[] = [];
    connection.onOpen(() => calls.push("open"));
    expect(calls).toEqual(["open"]);
  });

  // 変異: autoOpen: false を無視すると落ちる。恒久的に到達不能な
  // リレー (open が永久に来ない) を再現するために必要。
  it("stays unopened until open() when constructed with autoOpen: false", () => {
    const connection = new FakeRelayConnection("wss://a", { autoOpen: false });
    const calls: string[] = [];
    connection.onOpen(() => calls.push("open"));
    expect(calls).toEqual([]);

    connection.open();
    expect(calls).toEqual(["open"]);
  });

  // 変異: open() で opened フラグを立てないと落ちる。
  it("fires immediately for listeners registered after open()", () => {
    const connection = new FakeRelayConnection("wss://a", { autoOpen: false });
    connection.open();
    const calls: string[] = [];
    connection.onOpen(() => calls.push("late"));
    expect(calls).toEqual(["late"]);
  });
});
```

- [ ] **Step 7: 実行して失敗を確認**

Run: `pnpm vitest run src/core/relay/fake-relay-connection.test.ts`
Expected: FAIL

- [ ] **Step 8: `FakeRelayConnection` に実装する**

コンストラクタに省略可能な第 2 引数を足す。**既定は `autoOpen: true`** —— 既存の全テストがこの偽接続を「構築した瞬間から生きている」ものとして書かれているため。

```ts
export type FakeRelayConnectionOptions = {
  /** false にすると `open()` を呼ぶまで onOpen が発火しない。既定 true */
  autoOpen?: boolean;
};

export class FakeRelayConnection implements RelayConnection {
  readonly #openListeners = new Set<() => void>();
  #opened: boolean;

  constructor(
    readonly url: RelayUrl,
    options?: FakeRelayConnectionOptions,
  ) {
    this.#opened = options?.autoOpen ?? true;
  }

  /** 遅れて開いたことにする (autoOpen: false のときだけ意味がある) */
  open(): void {
    if (this.#opened || this.closed) return;
    this.#opened = true;
    for (const listener of [...this.#openListeners]) listener();
  }

  onOpen(listener: () => void): () => void {
    if (this.#opened) {
      listener();
      return () => {};
    }
    if (this.closed) return () => {};
    this.#openListeners.add(listener);
    return () => {
      this.#openListeners.delete(listener);
    };
  }
```

`die()` と `close()` の中で `this.#openListeners.clear()` を呼ぶこと。

- [ ] **Step 9: 全テストを実行**

Run: `pnpm vitest run && pnpm check`
Expected: PASS（`ConnectionPool` を含め既存テストが全部緑のまま）

- [ ] **Step 10: コミット**

```bash
git add src/core/relay
git commit -m "feat(relay): add an onOpen seam symmetric with onClose"
```

---

### Task 2: 失敗回数をプール寿命に移し、本当に開いた時だけリセットする

**Files:**
- Modify: `src/core/read/connection-pool.ts`
- Test: `src/core/read/connection-pool.test.ts`

**Interfaces:**
- Consumes: Task 1 の `RelayConnection.onOpen`、`FakeRelayConnection` の `{ autoOpen: false }` と `open()`
- Produces: `ConnectionPool` の `get degradedRelays(): readonly RelayUrl[]`、公開定数 `DEGRADED_AFTER_FAILURES = 4`、`DEGRADED_COOLDOWN_MS = 300_000`

**直す欠陥（2 つ、どちらも同じ 1 つのカウンタに起因する）:**

1. `#attachConnection` が `connect()` の直後に `pooled.attempts = 0` としている。`connectRelay` は `new WebSocket(url)` を作って即座に返るので、到達不能なリレーでも毎回「成功」扱いになり、**指数は 2⁰ から伸びない**。実測された症状は「約 3 秒間隔で永久に再接続し続ける」。
2. `attempts` が `Pooled` に載っているため、最後のエントリが閉じて `#drop` が走ると失敗の履歴ごと消える。Task 4 の degraded 判定がこの上に乗ると、**除外 → エントリ 0 → 履歴消滅 → 再選択 → 除外…と振動する。** カウンタはエントリの寿命より長く生きなければならない。

**設計:** `Pooled.attempts` を削除し、プールのフィールド `#failures: Map<RelayUrl, { count: number; timer: Handle }>` に置き換える。

- 増やすのは `#scheduleReconnect`（今 `attempts += 1` している場所）と、`#ensureConnection` / `#reconnect` の `connect()` が例外を投げた場合。
- 消すのは**実際に開いた時だけ** —— `#attachConnection` が登録する `onOpen` の中。
- **クールダウン:** 失敗を記録するたびにタイマーを張り直し、`DEGRADED_COOLDOWN_MS` 何も起きなければレコードごと消す。これが復帰経路である。除外された URL は誰も購読しなくなるので再接続も止まり、放っておくと永久に degraded のままになってしまう。クールダウンが明けると候補に戻り、まだ死んでいればまた 4 回失敗して degraded に戻る（サーキットブレーカの open → half-open）。**新しい時計の seam は足さないこと** —— 既存の `#scheduler.setTimeout` だけで書けるし、テストは `advance()` で検証できる。
- `retryNow()` の明示的なリセットは残す（人間が起こした操作なので、失敗履歴を捨ててよい）。`#failures` のレコードとタイマーも消すこと。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/connection-pool.test.ts` に新しい `describe` を足す。**このファイル既存のヘルパ（偽クロック、偽 connect の組み立て、`random` の固定）を読んで、命名と組み立て方を必ず合わせること。** ジッタは既存テストと同じやり方で固定する（`random: () => 0.5` なら係数はちょうど 1 倍）。

```ts
describe("backoff growth and degraded relays", () => {
  // 変異: #attachConnection に `attempts = 0` を戻すと、2 回目の遅延が
  // 1 回目と同じになって落ちる。これがまさに実地で観測された欠陥
  // (到達不能なリレーへ永久に 0.5〜1.5 秒間隔で再接続し続ける)。
  it("grows the delay when the socket never actually opens", () => {
    // autoOpen: false の接続を返す connect を使う = ソケットは作れるが
    // 決して開かない。実地の wss://nfrelay.app と同じ状況。
    // clock.scheduledDelays に積まれた遅延を直接読み、
    // 2 本目が 1 本目のちょうど 2 倍であることを主張する。
  });

  // 変異: onOpen ではなく connect() の戻りでリセットすると落ちる。
  it("resets the delay to the base once the socket really opens", () => {
    // 2 回失敗させて遅延が伸びたことを確認 → 次の接続で open() を呼ぶ
    // → 殺す → 次の遅延が base に戻っていること。
  });

  // 変異: #failures ではなく Pooled にカウンタを置くと落ちる。
  // Task 4 の振動を防いでいるのはこのテスト。
  it("remembers failures across a drop of the pool entry", () => {
    // 3 回失敗させる → 購読を close して entries を 0 にする (= #drop)
    // → 同じ URL を再度 subscribe して殺す → 遅延が base ではなく
    // 2³ 相当から続くこと。
  });

  // 変異: 閾値を >= から > にする、あるいは 4 を 5 にすると落ちる。
  it("reports a url as degraded only after DEGRADED_AFTER_FAILURES failures", () => {
    // 3 回失敗: degradedRelays は空
    // 4 回目: degradedRelays に含まれる
  });

  // 変異: onOpen でのレコード削除を消すと落ちる。
  it("clears degraded once the relay opens again", () => {});

  // 変異: クールダウンのタイマーを張らないと落ちる。これが唯一の
  // 復帰経路なので、無いと死んだリレーが永久に候補から外れたままになる。
  it("clears degraded after the cooldown elapses with no further failures", () => {
    // 4 回失敗 → degraded → 誰も購読していない状態にする
    // → clock.advance(DEGRADED_COOLDOWN_MS) → degradedRelays が空
  });

  // 変異: 失敗のたびにタイマーを張り直さないと落ちる (失敗し続けている
  // 間にクールダウンが明けてしまう)。
  it("postpones the cooldown on each new failure", () => {});
});
```

**書き終えたら、名指しした変異を実際に製品コードへ入れて各テストが落ちることを確かめること。** 落ちなければテストが弱い。

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm vitest run src/core/read/connection-pool.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

定数（`RECONNECT_MAX_MS` の隣）:

```ts
/**
 * この回数だけ連続で「開けなかった」URL を degraded とみなし、
 * リレー選択の候補から外す (ADR-0025 の入力)。正しい指数バックオフの
 * 下では 4 回はおよそ 1+2+4+8 = 15 秒ぶんの試行にあたる。
 */
export const DEGRADED_AFTER_FAILURES = 4;

/**
 * 最後の失敗からこれだけ何も起きなければ失敗履歴を捨て、候補に戻す。
 * degraded な URL は誰も購読しなくなり再接続も止まる (ADR-0021 の
 * 「諦めない」は購読者が居る間の話) ので、この経路が無いと永久に
 * 候補から外れたままになる。サーキットブレーカの half-open にあたる。
 */
export const DEGRADED_COOLDOWN_MS = 300_000;
```

`Pooled` から `attempts: number;` を削除する。プールにフィールドを足す:

```ts
  /**
   * URL → 連続で開けなかった回数。**`Pooled` ではなくプールが持つ。**
   * `#drop` でエントリが消えても失われてはならない — 消えると
   * 「degraded で除外 → 購読者ゼロ → 履歴消滅 → 再選択 → また除外」
   * という振動になる。
   */
  readonly #failures = new Map<
    RelayUrl,
    { count: number; timer: ReturnType<typeof setTimeout> }
  >();
```

メソッドを 2 つ:

```ts
  #noteFailure(url: RelayUrl): void {
    const existing = this.#failures.get(url);
    if (existing) this.#scheduler.clearTimeout(existing.timer);
    const count = (existing?.count ?? 0) + 1;
    // 失敗のたびにクールダウンを張り直す — 失敗し続けている最中に
    // 期限が来て degraded が解除されてしまわないように。
    const timer = this.#scheduler.setTimeout(() => {
      this.#failures.delete(url);
    }, DEGRADED_COOLDOWN_MS);
    this.#failures.set(url, { count, timer });
  }

  #clearFailures(url: RelayUrl): void {
    const existing = this.#failures.get(url);
    if (!existing) return;
    this.#scheduler.clearTimeout(existing.timer);
    this.#failures.delete(url);
  }
```

公開アクセサ（`reservedSize` の隣）:

```ts
  /**
   * 連続失敗が `DEGRADED_AFTER_FAILURES` 以上に達した URL。
   * `selectRelays` の `degraded` 入力になる (ADR-0025)。
   */
  get degradedRelays(): readonly RelayUrl[] {
    const urls: RelayUrl[] = [];
    for (const [url, { count }] of this.#failures) {
      if (count >= DEGRADED_AFTER_FAILURES) urls.push(url);
    }
    return urls;
  }
```

`#scheduleReconnect`: `RECONNECT_BASE_MS * 2 ** pooled.attempts` を `RECONNECT_BASE_MS * 2 ** (this.#failures.get(url)?.count ?? 0)` に、`pooled.attempts += 1;` を `this.#noteFailure(url);` に置き換える。**指数の計算は `#noteFailure` を呼ぶ前に行うこと**（1 回目の遅延が base のままになるように）。

`#ensureConnection` と `#reconnect` の `catch` 節に `this.#noteFailure(url);` を足す。ソケットを作ることさえできなかった場合も失敗である。

`#attachConnection`: `pooled.attempts = 0;` を消し、代わりに:

```ts
    pooled.offOpen = connection.onOpen(() => this.#clearFailures(url));
```

`Pooled` に `offOpen: (() => void) | null;` を足し、`#onConnectionDied` と `#drop` で `offClose` と同じように呼んで null に戻すこと。`#attachConnection` の冒頭で古い `offOpen` を解除してから張り直すこと（`offClose` と同じ扱い）。

`retryNow()`: `pooled.attempts = 0;` を `this.#clearFailures(url);` に置き換える。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/core/read/connection-pool.test.ts`
Expected: PASS

- [ ] **Step 5: 名指しした変異を実際に入れて落ちることを確認**

少なくとも 2 つは手で確かめること: (a) `#attachConnection` に `attempts` リセット相当（`this.#clearFailures(url)` を `onOpen` の外へ出す）を戻す → "grows the delay" が落ちること、(b) `#failures` を `Pooled` に戻す → "remembers failures across a drop" が落ちること。確認したら元に戻す。

- [ ] **Step 6: 全テストを実行してコミット**

Run: `pnpm vitest run && pnpm check`

```bash
git add src/core/read/connection-pool.ts src/core/read/connection-pool.test.ts
git commit -m "fix(read): grow the reconnect backoff only on a real socket open"
```

---

### Task 3: 接続の保持を `hold()` にし、アンカーの REQ 悪用をやめる

**Files:**
- Modify: `src/core/read/connection-pool.ts`
- Modify: `src/core/read/bootstrap.ts`
- Test: `src/core/read/connection-pool.test.ts`, `src/core/read/bootstrap.test.ts`

**Interfaces:**
- Consumes: Task 2 の `#failures` / `#noteFailure`（`hold()` も接続を作るので同じ経路を通る）
- Produces: `ConnectionPool.hold(url: RelayUrl, options?: SubscribeOptions): PooledHold | undefined`、`export type PooledHold = { release(): void }`

**直す欠陥:** `bootstrap.ts` はフェーズ①と②の間で接続が落ちないよう、各インデクサに「絶対にマッチしない」`{ ids: [NEVER_MATCHING_ID] }` の購読を張っている。これは**接続の寿命という要求を購読として表現したもの**で、代償が 2 つある。

1. 一部のリレーが `blocked: filters must specify at least one kind` を返して CLOSE する（実地観測、2026-08-05）。狙った保持効果がそもそも得られていない。
2. 実データを取らない REQ がワイヤに出て、アンカー宛に届いたイベントを数えるためだけの `anchorUnrequested` という会計が必要になっている。

**設計:** 「この接続を開けたままにしておけ」をプールの一級の能力にする。`hold()` は接続を確保して `Pooled` に保持カウントを立てるだけで、**`connection.subscribe()` を一切呼ばない**。

- `Pooled` に `holds: number` を足す。
- `#scheduleReconnect` / `#reconnect` の「誰も待っていない」ガード `entries.size === 0` を `entries.size === 0 && holds === 0` にする。hold だけの URL も再接続の対象である。
- `#drop` を呼ぶ条件（`entries.size === 0` の 3 箇所）も同様に hold を考慮する。
- `release()` は冪等（二重呼び出しでカウントが負にならないこと）。カウントが 0 になり、かつエントリも無ければ `#drop`。
- `size`（予算）の数え方は変えない —— hold は生きた接続を 1 本占有するので、今までどおり数えられる。
- `hold()` も `#ensureConnection` を通すので `{ reserved: true }` はそのまま効く。ブートストラップはこれまでどおり予算を迂回する。

- [ ] **Step 1: 失敗するテストを書く（プール）**

```ts
describe("hold", () => {
  // 変異: hold() を subscribe() で実装すると落ちる。これがこのタスクの
  // 中心的な主張 — 接続の保持はワイヤに何も出してはならない。
  it("opens the connection without sending any REQ", () => {
    // hold した後、その URL の FakeRelayConnection の subscriptions が
    // 長さ 0 であること。pool.size は 1 であること。
  });

  // 変異: #drop の条件に holds を足し忘れると落ちる。これがアンカーの
  // 存在理由そのもの (フェーズ間で接続を落とさない)。
  it("keeps the connection alive when the last subscription closes", () => {});

  // 変異: release() で #drop を呼ばないと落ちる。
  it("closes the connection when the last hold is released and no entries remain", () => {});

  // 変異: release() を冪等にしないとカウントが負になり、後の hold が
  // 効かなくなる。
  it("is idempotent on repeated release()", () => {});

  // 変異: #scheduleReconnect のガードに holds を足し忘れると落ちる。
  it("reconnects a url that has only a hold", () => {});

  // 変異: 予算チェックを飛ばすと落ちる。
  it("returns undefined when the budget is full and reserved is not set", () => {});
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm vitest run src/core/read/connection-pool.test.ts`
Expected: FAIL — `pool.hold is not a function`

- [ ] **Step 3: `hold()` を実装する**

```ts
export type PooledHold = { release(): void };
```

```ts
  /**
   * REQ を出さずに接続だけを確保する。**購読ではない。**
   *
   * ブートストラップのように「フェーズ①と②の間で接続を落としたくない」
   * という要求を、絶対にマッチしないフィルタの REQ で表現していたのを
   * 一級の能力に引き上げたもの (2026-08-05)。REQ による表現には、一部の
   * リレーが `blocked: filters must specify at least one kind` を返して
   * CLOSE するため保持効果そのものが得られない、という実地の問題があった。
   *
   * 予算 (ADR-0011) は `subscribe()` と同じに数える — hold は生きた
   * ソケットを 1 本占有するため。枠が無く `reserved` でもなければ
   * `undefined` を返す。
   */
  hold(url: RelayUrl, options?: SubscribeOptions): PooledHold | undefined {
    const pooled = this.#ensureConnection(url, options);
    if (!pooled) return undefined;

    pooled.holds += 1;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const current = this.#pool.get(url);
        if (!current) return;
        current.holds -= 1;
        if (current.holds === 0 && current.entries.size === 0) {
          this.#drop(url);
        }
      },
    };
  }
```

`Pooled` に `holds: number;` を足し、`#ensureConnection` の新規レコード生成で `holds: 0` を初期化する。`entries.size === 0` を条件にしている既存の 5 箇所（`#scheduleReconnect`、`#reconnect`、`#drop` を呼ぶ 3 箇所）を洗い出し、hold を考慮した形に直すこと。**`grep -n "entries.size === 0" src/core/read/connection-pool.ts` で全部拾ってから直すこと。**

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/core/read/connection-pool.test.ts`
Expected: PASS

- [ ] **Step 5: `bootstrap.ts` を `hold()` に載せ替える**

- `NEVER_MATCHING_ID` 定数と `createAnchorHandlers` を削除する。
- `anchors: Map<RelayUrl, PooledSubscription>` を `Map<RelayUrl, PooledHold>` にし、`pool.subscribe(url, [...], handlers, { reserved: true })` を `pool.hold(url, { reserved: true })` にする。
- `anchorUnrequested` を削除し、戻り値の合算（`unrequestedFollows + unrequestedRelayLists + anchorUnrequested`）から外す。**アンカーが REQ を出さなくなった以上、そこに届く「要求していないイベント」という概念自体が消える。**
- `finally` の `anchor.close()` を `anchor.release()` にする。
- 既存のコメント（「アンカーの filters は『絶対にマッチしない』ことだけが要件」の段落）を、`hold()` に置き換わった経緯を説明する形に書き換えること。接続を握り続ける理由の説明そのもの（フェーズ間の再接続を避ける）は正しいので残す。

- [ ] **Step 6: `bootstrap.test.ts` を直す**

このファイルにはアンカーの実装詳細に依存したテストが多数ある（「handlers[0] はアンカーのもの、handlers[1] がフェーズ①の本物」といった添字の前提が `subscriptions` の並びに埋まっている）。`hold()` は購読を作らないので、**添字が 1 つずつ前へ詰まる。** 一つずつ読んで直すこと。

削除すべきテスト 2 本（テスト対象の概念が消えたため）:
- `"counts events pushed at the anchor subscription toward unrequested"`
- `"does not carry the anchor count across warmUpRouting() calls"`

代わりに 1 本足す:

```ts
// 変異: hold() を subscribe() に戻すと落ちる。インデクサへ出る REQ は
// フェーズ①とフェーズ②の 2 本だけであり、接続を握るためだけの 3 本目が
// あってはならない (一部のリレーはそれを blocked で CLOSE する)。
it("sends no filter to an indexer beyond the two real phases", async () => {});
```

保持効果そのものを主張している既存テスト（「フェーズ②で接続を張り直さない」系）は概念として生きているので、`hold()` の下で成立するよう直して残すこと。

- [ ] **Step 7: 全テストを実行**

Run: `pnpm vitest run && pnpm check`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add src/core/read
git commit -m "refactor(read): hold bootstrap connections without abusing REQ"
```

---

### Task 4: degraded なリレーを選択から外す

**Files:**
- Modify: `src/core/read/relay-selector.ts`
- Modify: `src/core/read/subscription-manager.ts`
- Test: `src/core/read/relay-selector.test.ts`, `src/core/read/subscription-manager.test.ts`

**Interfaces:**
- Consumes: Task 2 の `ConnectionPool.degradedRelays`
- Produces: `SelectRelaysOptions` に `degraded?: readonly RelayUrl[]`

**直す欠陥:** `selectRelays` は「到達可能かどうか」という概念を持たない。`replan()` のたびに同じ死んだ URL を何度でも選び直し、その枠は誰にも使われない。実地では `.onion` アドレス（Tor 無しのブラウザからは構造的に到達不能）がこれを最も分かりやすく実演した。

**設計:** `degraded` の URL を候補集合から**完全に外す**。「最後の手段として残す」ことはしない —— 到達不能なリレーを著者に割り当てても被覆は 1 本も増えず、枠だけが埋まるからである。degraded なリレーしか宣言していない著者は `uncovered` に落ちる。**これは ADR-0011 の「劣化を隠さない」に適う** —— `uncoveredAuthors` として正直に数が上がり、UI に出る。

**ただし `pinned` は外さない。** `pinned` にはユーザーが明示指定したリレー・フォールバック・インデクサが入る。これらを選択器が黙って落とすと、ブートストラップ経路そのものが静かに壊れる。degraded な pinned は今までどおり選ばれ、プールが再接続を試み続ける。

- [ ] **Step 1: 失敗するテストを書く（純関数）**

`src/core/read/relay-selector.test.ts` に追記。**期待値は導出せず、実際に走らせて確かめること。**

```ts
describe("degraded relays", () => {
  // 変異: degraded を無視すると落ちる。実地で観測された欠陥そのもの
  // (死んだリレーが枠を食い、その著者は永久に暗転する)。
  it("prefers a reachable relay over a degraded one that covers the same author", () => {
    // 著者 A が [dead, alive] を宣言。degraded: [dead]。
    // picks に alive だけが入り、dead は入らないこと。
  });

  // 変異: degraded を「最後の手段として残す」実装にすると落ちる。
  // 到達不能なリレーを割り当てても被覆は増えないので、枠を空ける方が
  // 常に良い。
  it("leaves an author uncovered when every declared relay is degraded", () => {
    // 著者 B が [dead] だけを宣言 → uncovered に B が入り、
    // picks に dead は入らないこと。
  });

  // 変異: pinned にも degraded を適用すると落ちる。ブートストラップの
  // インデクサが選択器に黙って落とされ、経路ごと壊れる。
  it("still picks a pinned relay even when it is degraded", () => {});

  // 変異: degraded を必須にすると既存の呼び出しが全部落ちる。
  it("behaves exactly as before when degraded is omitted", () => {});
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `pnpm vitest run src/core/read/relay-selector.test.ts`
Expected: FAIL

- [ ] **Step 3: `selectRelays` に実装する**

`SelectRelaysOptions` に足す:

```ts
  /**
   * 連続して開けなかったリレー (`ConnectionPool.degradedRelays`)。
   * 候補から完全に外す — 到達不能なリレーを著者に割り当てても被覆は
   * 1 本も増えず、30 本の枠だけが埋まるため。ここに入った URL しか
   * 宣言していない著者は `uncovered` に落ちる (ADR-0011: 劣化は
   * 隠さず正直に報告する)。
   *
   * **`pinned` には適用しない** — 明示指定・フォールバック・インデクサ
   * を選択器が黙って落とすと経路そのものが静かに壊れる。
   */
  degraded?: readonly RelayUrl[];
```

`relayToAuthors` を組み立てるループで、`degraded` に含まれる URL を飛ばす。`pinned` の扱いは今のまま一切変えないこと。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/core/read/relay-selector.test.ts`
Expected: PASS

- [ ] **Step 5: `SubscriptionManager` から配線する**

`replan()`（`selectRelays` を呼んでいる箇所）で `degraded: this.#pool.degradedRelays` を渡す。マネージャがプールを持っているかを先に確認し、持っていなければ `selectRelays` を呼ぶ地点で読めるようにすること（新しいオプションや seam は足さないこと —— プールは既に注入されている）。

- [ ] **Step 6: 配線のテストを書く**

`src/core/read/subscription-manager.test.ts` に足す:

```ts
// 変異: replan() で degraded を渡し忘れると落ちる。純関数側が正しく
// なっても配線が無ければ実地の欠陥は直らない — このテストがその
// 唯一の防波堤。
it("excludes a degraded relay on the next replan", async () => {
  // autoOpen: false の接続しか返さない URL を用意し、
  // DEGRADED_AFTER_FAILURES 回ぶんのバックオフを advance() で進めて
  // degraded にしてから replan を起こし、その URL へ REQ が
  // 出なくなることを主張する。
});
```

- [ ] **Step 7: 全テストを実行**

Run: `pnpm vitest run && pnpm check`
Expected: PASS

- [ ] **Step 8: ドキュメントを更新する**

- `docs/adr/0021-reconnection-policy.md`: 「購読者が居る限り諦めない」と「再選択の候補から外す」が別の問いであることを追記し、`DEGRADED_AFTER_FAILURES` / `DEGRADED_COOLDOWN_MS` とクールダウンによる復帰経路を書く。
- `docs/adr/0025-greedy-relay-selection-under-a-global-budget.md`: `degraded` 入力と、`pinned` には適用しないことを追記する。
- `docs/design/read-layer-followups.md`: 「死んだままのリレーが枠を永久に食いつぶす」「指数バックオフが実際には指数になっていない」の 2 節を修正済みに畳み、`{"ids": [...]}` アンカーの節（あれば）も同様にする。**節を消さず、取り消し線つきの修正済み記録として残すこと**（このファイルの既存の慣習に合わせる）。

- [ ] **Step 9: コミット**

```bash
git add src docs
git commit -m "fix(read): drop degraded relays from selection instead of holding their slots"
```

---

## 検証（全タスク完了後）

実鍵での確認は人間にしか出せない。以下を依頼すること:

1. `pnpm dev` → `/v1-preview` でログインし、コンソールを 1 分間観察する。
2. **バックオフ:** `wss://relay.yozora.world` などへの WebSocket エラーが、これまでの「約 3 秒間隔で永久に」から、間隔が伸びていく形に変わっていること。
3. **degraded:** 1 分ほど経つと、到達不能な 3 本へのエラーが止まること（degraded として選択から外れる）。`.onion` が最も分かりやすい。
4. **アンカー:** nostr-devtools に `{"ids": ["000…0"]}` のサブスクリプションが**一切現れない**こと。
5. `connections` / `peakConnections` / `unreachableRelays` / `uncoveredAuthors` の値を報告してもらう。`uncoveredAuthors` は degraded 除外のぶん**増えるのが正しい**（劣化を隠さない）。
