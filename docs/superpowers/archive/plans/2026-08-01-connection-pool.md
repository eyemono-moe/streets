# 接続プール実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アプリ全体で開くリレー接続を 30 本の予算内で貪欲に選び、死んだら追い出して再接続し、選び直した結果を生きているセクションへ届けられるようにする。

**Architecture:** リレー選択を純関数 `selectRelays`（冗長度つき貪欲集合被覆）として切り出し、`SubscriptionManager` は全セクションの著者需要を集めてそれを呼ぶ。接続の所有・予算・生死・再接続は `ConnectionPool` が持ち、`RelayConnection` には接続単位の `onClose` を足す。計画の変化は `SectionDelivery.onPlanChanged` でセクションへ届く。

**Tech Stack:** TypeScript / SolidJS / Vitest / Playwright / pnpm。Nostr の高水準ライブラリには依存しない（ADR-0020）。

**設計の出所:** [docs/superpowers/archive/specs/2026-08-01-connection-pool-design.md](../specs/2026-08-01-connection-pool-design.md)。判断の根拠になった実測は [docs/research/2026-08-01-outbox-connection-budget.md](../../../research/2026-08-01-outbox-connection-budget.md)。

## Global Constraints

- **読み取り層（`src/core/read/`, `src/core/relay/`）は Nostr ライブラリを import しない。** `@noble/curves` / `@noble/hashes` / `@scure/base` のみ（ADR-0020）。`pnpm check` が `scripts/check-read-layer-deps.mjs` で機械的に検査する。
- **DOM API を読み取り層に持ち込まない。** `window` / `document` / `navigator` を参照しない。`online` やタブ可視化の配線はアプリ側で行い、読み取り層は `retryNow()` を公開するだけ。
- **暗号は一行も自作しない**（ADR-0020）。
- **劣化を黙って隠さない**（ADR-0011）。取得できなかったものは必ず `SectionStatus.incomplete` に出す。
- **`src/core/{transport,query,repository,view,store}`、`src/core/solid/{provider,use-*}`、`src/core/nostr/replaceable.ts`、`src/routes/debug/v1-core.tsx` は旧実装。触らない。**
- **`e2e/console-warning.spec.ts` は旧実装由来で失敗する。** base コミットでも同じく失敗することを確認済み。直そうとしないこと。
- 検証コマンド: `pnpm exec vitest run` / `pnpm e2e` / `pnpm typecheck` / `pnpm check` / `pnpm fix`
- 予算の既定値: **同時接続 30 本、著者あたりの冗長度 2**（ADR-0011 と接続プール仕様）

## この計画に含めないもの

含めないことは欠陥ではない。**指摘されても実装しないこと。**

| | どこで |
|---|---|
| REQ マージ、`max_subscriptions` の尊重 | 後続 #3 の 2 枚目 |
| ローカル再マッチ（リレーが押し込んだイベントを載せない） | 後続 #3 の 2 枚目 |
| ページネーション、per-relay カーソル | 後続 #3 の 3 枚目 |
| レンダラの `needs` と波状解決 | 後続 #2 |
| IndexedDB 水和、`EventStore` の内部化 | 後続 #4 |
| 手動再試行の UI | 後続 #7 |
| NIP-42 (AUTH) | どの計画にも入っていない |

## ファイル構成

| ファイル | 責務 |
|---|---|
| `src/core/relay/relay-connection.ts` | seam。`onClose` を足す |
| `src/core/relay/websocket-relay-connection.ts` | `onClose` の実装 |
| `src/core/relay/fake-relay-connection.ts` | `onClose` と `die()` の実装 |
| `src/core/read/relay-selector.ts` | **新規。** 貪欲被覆による選択（純関数） |
| `src/core/read/connection-pool.ts` | **新規。** 接続の所有・予算・生死・再接続・購読レジストリ |
| `src/core/read/query-plan.ts` | 割り当てからフィルタを組むだけに縮める |
| `src/core/read/routing-table.ts` | 宣言された write リレーを全部返す |
| `src/core/read/default-relays.ts` | `MAX_RELAYS_PER_AUTHOR` を消し、予算定数を置く |
| `src/core/read/subscription-manager.ts` | セクションレジストリ・大域需要・選び直しの配布 |
| `src/core/read/section-reader.ts` | `onPlanChanged` による張り直し |
| `src/core/read/source.ts` | `SectionStatus.incomplete.uncoveredAuthors` |
| `src/core/read/bootstrap.ts` | インデクサ接続をプール経由にする |

---

### Task 1: `RelayConnection` に接続単位の `onClose` を足す

**なぜ:** プールは「リレーがレート制限でこの `REQ` を CLOSED した」と「ソケットが死んだ」を区別できない。区別できないため、死んだ接続が `refCount > 0` のままプールに残り続け、次にその URL を掴んだセクションが死体を渡されてリロードするまで `unreachable` になる。**これは現在生きているバグである。**

**Files:**
- Modify: `src/core/relay/relay-connection.ts`
- Modify: `src/core/relay/websocket-relay-connection.ts:53-65`（`fail()` の中）
- Modify: `src/core/relay/fake-relay-connection.ts`
- Test: `src/core/relay/websocket-relay-connection.test.ts`, `src/core/relay/fake-relay-connection.test.ts`
- Modify: `docs/adr/0014-thin-relay-connection-deep-read-layer.md`

**Interfaces:**
- Produces: `RelayConnection.onClose(listener: () => void): () => void` — 戻り値は購読解除関数。`FakeRelayConnection.die(): void` — ソケットの自然死を再現する（`close()` は明示的な終了、`die()` は外的要因による死）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/relay/websocket-relay-connection.test.ts` に追記。既存のテストがソケットの fake をどう作っているかを先に読み、その作り方に合わせること。

```ts
it("notifies onClose listeners once when the socket dies", () => {
  const socket = createFakeSocket();
  const connection = new WebSocketRelayConnection("wss://one/", socket);
  const calls: string[] = [];
  connection.onClose(() => calls.push("a"));
  connection.onClose(() => calls.push("b"));

  socket.onclose?.();
  socket.onerror?.(); // 2 度目は通知しない

  expect(calls).toEqual(["a", "b"]);
});

it("stops notifying a listener that unsubscribed", () => {
  const socket = createFakeSocket();
  const connection = new WebSocketRelayConnection("wss://one/", socket);
  const calls: string[] = [];
  const off = connection.onClose(() => calls.push("a"));
  off();

  socket.onclose?.();

  expect(calls).toEqual([]);
});

it("notifies a listener registered after the socket already died", () => {
  const socket = createFakeSocket();
  const connection = new WebSocketRelayConnection("wss://one/", socket);
  socket.onclose?.();

  const calls: string[] = [];
  connection.onClose(() => calls.push("late"));

  // 既に死んでいる接続に登録したリスナは、その場で呼ばれなければ
  // プールが永久に「生きている」と誤認する
  expect(calls).toEqual(["late"]);
});
```

`src/core/relay/fake-relay-connection.test.ts` に追記:

```ts
it("die() notifies onClose and closes every subscription", () => {
  const connection = new FakeRelayConnection("wss://one/");
  const closed: string[] = [];
  connection.onClose(() => closed.push("pool"));
  connection.subscribe([{ kinds: [1] }], {
    onEvent: () => {},
    onEose: () => {},
    onClosed: (reason) => closed.push(`sub:${reason}`),
  });

  connection.die();

  expect(closed).toEqual(["sub:socket closed", "pool"]);
  expect(connection.closed).toBe(true);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/relay/websocket-relay-connection.test.ts src/core/relay/fake-relay-connection.test.ts`
Expected: FAIL — `connection.onClose is not a function` / `connection.die is not a function`

- [ ] **Step 3: seam に足す**

`src/core/relay/relay-connection.ts` の `RelayConnection` に追加:

```ts
export interface RelayConnection {
  readonly url: RelayUrl;
  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription;
  publish(event: NostrEvent): Promise<void>;
  close(): void;
  /**
   * ソケットが死んだことを通知する。**購読単位の `onClosed` とは別物。**
   * プールはこれが無いと「レート制限による個別 CLOSED」と「ソケットの死」を
   * 区別できず、死んだ接続を掴み続ける (ADR-0014)。
   *
   * 既に死んでいる接続に登録した場合はその場で呼ぶ。戻り値は購読解除。
   */
  onClose(listener: () => void): () => void;
}
```

- [ ] **Step 4: `WebSocketRelayConnection` に実装する**

`#closeListeners = new Set<() => void>()` をフィールドに足し、`fail()`（53-65 行目）の中で `#closed = true` の直後に全リスナを呼んでから `#closeListeners.clear()` する。`onClose(listener)` は `#isClosed()` なら即座に `listener()` を呼んで `() => {}` を返し、そうでなければ Set に足して削除関数を返す。

**注意:** `fail()` は `onclose` と `onerror` の両方に配線されており、先頭の `if (this.#closed) return;` で二重発火を防いでいる。この構造を壊さないこと。

- [ ] **Step 5: `FakeRelayConnection` に実装する**

`onClose` は同じ形（`closed` が true なら即座に呼ぶ）。`die()` は `close()` と違い「外的要因による死」を再現する:

```ts
die(): void {
  if (this.closed) return;
  this.closed = true;
  for (const sub of this.subscriptions) {
    if (sub.closed) continue;
    sub.closed = true;
    sub.handlers.onClosed("socket closed");
  }
  for (const listener of this.#closeListeners) listener();
  this.#closeListeners.clear();
}
```

既存の `close()` は購読に `onClosed` を配らない（明示的な終了なので呼び出し側は既に知っている）。**その違いを保つこと。** ただし `close()` でも `onClose` リスナには通知する（プールから見れば接続が無くなったことに変わりはない）。

- [ ] **Step 6: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/relay/`
Expected: PASS

- [ ] **Step 7: ADR-0014 を改訂する**

`docs/adr/0014-thin-relay-connection-deep-read-layer.md` に節を足す。書く内容は「なぜ購読単位の `onClosed` では足りないか」（上の**なぜ**の段落）と、「これはアダプタの薄さを壊さない — アダプタは自分のソケットの状態を報告するだけで方針を持たない」こと。

- [ ] **Step 8: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "feat(relay): add a connection-level onClose signal to the seam"
```

---

### Task 2: `RoutingTable` が宣言された write リレーを全部返す

**なぜ:** `MAX_RELAYS_PER_AUTHOR = 3` は各著者のリストを先頭 3 本で切ってから全体を選ぶので、**集合被覆が必要とする情報をまさに捨てている。** [実測](../../../research/2026-08-01-outbox-connection-budget.md)では、同じ被験者・予算 30 本・冗長度 1 で、切り捨てありは 95〜98%、外すと 99〜100% だった。制限は著者ごとではなく大域の予算として持つ。

**Files:**
- Modify: `src/core/read/default-relays.ts:23-29`
- Modify: `src/core/read/routing-table.ts:33-40`
- Test: `src/core/read/routing-table.test.ts`
- Modify: `docs/adr/0016-routing-bootstrap.md`

**Interfaces:**
- Produces: `MAX_CONNECTIONS = 30`、`RELAY_REDUNDANCY = 2`（`src/core/read/default-relays.ts`）。`MAX_RELAYS_PER_AUTHOR` は**削除する**。
- `RoutingTable.writeRelaysFor(pubkey)` / `readRelaysFor(pubkey)` の戻り値から件数上限が消える。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/routing-table.test.ts` に追記。既存の「3 本に切る」ことを主張しているテストがあれば、それを削除するのではなく**この新しい主張へ書き換える**こと。

```ts
it("returns every declared write relay without truncating", () => {
  const store = new EventStore();
  store.put(
    relayList(1, [
      ["r", "wss://one/", "write"],
      ["r", "wss://two/", "write"],
      ["r", "wss://three/", "write"],
      ["r", "wss://four/", "write"],
      ["r", "wss://five/", "write"],
    ]),
    "wss://seed/",
  );
  const routing = new RoutingTable(store);

  // 予算は大域セレクタが持つ。ここは事実だけを返す
  expect(routing.writeRelaysFor(pubkeyFor(1))).toEqual([
    "wss://one/",
    "wss://two/",
    "wss://three/",
    "wss://four/",
    "wss://five/",
  ]);
});
```

`relayList` と pubkey の作り方は既存のテストヘルパに合わせること（ファイル冒頭に `keyFor` / `relayList` がある）。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/routing-table.test.ts`
Expected: FAIL — 3 件しか返らない

- [ ] **Step 3: 切り捨てを外し、予算定数を置く**

`src/core/read/routing-table.ts` の `#relaysFor` から `.slice(0, MAX_RELAYS_PER_AUTHOR)` と `default-relays` からの import を削除する。

`src/core/read/default-relays.ts` の `MAX_RELAYS_PER_AUTHOR`（23-29 行目）を丸ごと置き換える:

```ts
/**
 * アプリ全体で同時に開く WebSocket の上限 (ADR-0011)。
 *
 * 著者ごとの本数ではなく**大域の予算**である。実測ではフォロー 1300 人規模で
 * 378〜1251 本の write リレーが宣言されており、素朴に全部へ繋ぐことはできない。
 * 一方で貪欲に選べば 30 本で冗長度 2 を 96〜98% 達成できる
 * (docs/research/2026-08-01-outbox-connection-budget.md)。
 */
export const MAX_CONNECTIONS = 30;

/**
 * 1 著者あたり何本のリレーから取るか。
 *
 * 1 本にすると、そのリレーがイベントを取りこぼした時点でその著者が
 * タイムラインから消え、しかも消えたことを検出できない (リレーは生きている
 * ので unreachableRelays にも計上されない)。2 本にする代償は 30 本での被覆が
 * 99〜100% から 96〜98% に下がることと、重複配信が増えること。
 */
export const RELAY_REDUNDANCY = 2;
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run && pnpm typecheck`
Expected: PASS。`MAX_RELAYS_PER_AUTHOR` の参照が他に残っていれば typecheck が落ちるので、その場で消す。

- [ ] **Step 5: ADR-0016 を改訂する**

`docs/adr/0016-routing-bootstrap.md` に、著者ごとの本数制限を大域予算へ移したこと、およびその根拠（実測値）を書く。実測ドキュメントへリンクする。

- [ ] **Step 6: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "refactor(read): let RoutingTable report every declared write relay"
```

---

### Task 3: `selectRelays` — 冗長度つき貪欲集合被覆

**なぜ:** 30 接続上限は「足りないときの調停」ではなく「良い 30 本を選ぶ」被覆問題である。方針を全部この純関数に閉じ込める。

**Files:**
- Create: `src/core/read/relay-selector.ts`
- Test: `src/core/read/relay-selector.test.ts`
- Create: `docs/adr/0025-greedy-relay-selection-under-a-global-budget.md`

**Interfaces:**
- Consumes: `RelayUrl`（`src/core/relay/relay-connection`）、`MAX_CONNECTIONS` / `RELAY_REDUNDANCY`（Task 2、`src/core/read/default-relays`）
- Produces:
```ts
export type Selection = {
  readonly picks: readonly RelayUrl[];
  readonly assignment: ReadonlyMap<string, readonly RelayUrl[]>;
  readonly uncovered: readonly string[];
};
export const selectRelays: (options: {
  demand: ReadonlyMap<string, readonly RelayUrl[]>;
  pinned: readonly RelayUrl[];
  current: readonly RelayUrl[];
  budget: number;
  redundancy: number;
}) => Selection;
```

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/relay-selector.test.ts` を新規作成:

```ts
import { describe, expect, it } from "vitest";
import { selectRelays } from "./relay-selector";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

const base = { pinned: [], current: [], budget: 10, redundancy: 1 } as const;

describe("selectRelays", () => {
  it("prefers the relay that covers the most authors", () => {
    const selection = selectRelays({
      ...base,
      demand: new Map([
        [A, ["wss://hub/", "wss://a-only/"]],
        [B, ["wss://hub/", "wss://b-only/"]],
        [C, ["wss://hub/"]],
      ]),
      budget: 1,
    });

    expect(selection.picks).toEqual(["wss://hub/"]);
    expect(selection.uncovered).toEqual([]);
  });

  it("never exceeds the budget", () => {
    const demand = new Map(
      Array.from({ length: 20 }, (_, i) => [
        `${i}`.padStart(64, "0"),
        [`wss://r${i}/`],
      ]),
    );

    const selection = selectRelays({ ...base, demand, budget: 5 });

    expect(selection.picks).toHaveLength(5);
    expect(selection.uncovered).toHaveLength(15);
  });

  it("keeps pinned relays even when they cover nobody", () => {
    const selection = selectRelays({
      ...base,
      demand: new Map([[A, ["wss://useful/"]]]),
      pinned: ["wss://fallback/"],
      budget: 2,
    });

    expect(selection.picks).toContain("wss://fallback/");
    expect(selection.picks).toContain("wss://useful/");
  });

  it("lets pinned relays win when the budget cannot hold them all", () => {
    const selection = selectRelays({
      ...base,
      demand: new Map([[A, ["wss://useful/"]]]),
      pinned: ["wss://p1/", "wss://p2/"],
      budget: 2,
    });

    expect(selection.picks).toEqual(["wss://p1/", "wss://p2/"]);
    expect(selection.uncovered).toEqual([A]);
  });

  it("counts an author who declares one relay as satisfied at one", () => {
    // 1 本しか宣言していない著者を redundancy で初期化すると、永久に
    // 未充足のまま貪欲の判断を歪める
    const selection = selectRelays({
      demand: new Map([
        [A, ["wss://solo/"]],
        [B, ["wss://x/", "wss://y/"]],
      ]),
      pinned: [],
      current: [],
      budget: 3,
      redundancy: 2,
    });

    expect(selection.assignment.get(A)).toEqual(["wss://solo/"]);
    expect(selection.assignment.get(B)).toEqual(["wss://x/", "wss://y/"]);
    expect(selection.uncovered).toEqual([]);
  });

  it("caps each author's assignment at the redundancy", () => {
    // 他の著者の都合で 3 本とも選ばれていても、購読するのは 2 本まで
    const selection = selectRelays({
      demand: new Map([
        [A, ["wss://x/", "wss://y/", "wss://z/"]],
        [B, ["wss://y/"]],
        [C, ["wss://z/"]],
      ]),
      pinned: [],
      current: [],
      budget: 3,
      redundancy: 2,
    });

    expect(selection.picks).toHaveLength(3);
    expect(selection.assignment.get(A)).toEqual(["wss://x/", "wss://y/"]);
  });

  it("breaks ties toward relays that are already open", () => {
    const demand = new Map([
      [A, ["wss://new/", "wss://open/"]],
      [B, ["wss://new/", "wss://open/"]],
    ]);

    const fresh = selectRelays({ ...base, demand, budget: 1 });
    const sticky = selectRelays({
      ...base,
      demand,
      budget: 1,
      current: ["wss://open/"],
    });

    // 同点なら辞書順。current があるならそちらを優先する
    expect(fresh.picks).toEqual(["wss://new/"]);
    expect(sticky.picks).toEqual(["wss://open/"]);
  });

  it("does not keep a current relay that has become useless", () => {
    const selection = selectRelays({
      ...base,
      demand: new Map([[A, ["wss://needed/"]]]),
      current: ["wss://stale/"],
      budget: 5,
    });

    expect(selection.picks).toEqual(["wss://needed/"]);
  });

  it("is deterministic for the same input", () => {
    const demand = new Map([
      [A, ["wss://p/", "wss://q/"]],
      [B, ["wss://q/", "wss://p/"]],
      [C, ["wss://r/"]],
      [D, ["wss://r/"]],
    ]);

    const first = selectRelays({ ...base, demand, budget: 2 });
    const second = selectRelays({ ...base, demand, budget: 2 });

    expect(first.picks).toEqual(second.picks);
  });

  it("returns an empty selection for empty demand", () => {
    const selection = selectRelays({ ...base, demand: new Map() });

    expect(selection.picks).toEqual([]);
    expect(selection.uncovered).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/relay-selector.test.ts`
Expected: FAIL — `Cannot find module './relay-selector'`

- [ ] **Step 3: 実装する**

`src/core/read/relay-selector.ts` を新規作成:

```ts
import type { RelayUrl } from "../relay/relay-connection";

export type Selection = {
  /** 開くべきリレー。pinned を含む。長さ <= budget */
  readonly picks: readonly RelayUrl[];
  /** 著者 → 購読するリレー。demand の全著者が入る (空配列 = 予算切れ) */
  readonly assignment: ReadonlyMap<string, readonly RelayUrl[]>;
  /** 1 本も確保できなかった著者 */
  readonly uncovered: readonly string[];
};

export type SelectRelaysOptions = {
  /** 著者 → その著者が宣言した write リレー全部 (切り捨てなし) */
  demand: ReadonlyMap<string, readonly RelayUrl[]>;
  /** 明示指定・fallback・インデクサ。予算を消費するが決して落とさない */
  pinned: readonly RelayUrl[];
  /** いま開いているリレー。同点時に優先して churn を減らす */
  current: readonly RelayUrl[];
  budget: number;
  redundancy: number;
};

/**
 * 予算内で開くリレー集合を決める (ADR-0025)。純関数。
 *
 * 冗長度つきの貪欲集合被覆。各著者の残り必要本数を
 * **min(redundancy, 宣言本数)** で初期化するのが要点である —
 * write リレーを 1 本しか宣言していない著者は原理的に冗長度 2 に到達
 * できないので、redundancy で初期化すると永久に未充足のまま残り、
 * 貪欲の判断を歪める。
 *
 * 粘着性は**同点のときだけ**効く。既に開いているリレーを優先することで
 * カラム追加のたびに 30 接続を張り直す churn を避けるが、被覆を犠牲に
 * してまで維持はしない。
 */
export const selectRelays = ({
  demand,
  pinned,
  current,
  budget,
  redundancy,
}: SelectRelaysOptions): Selection => {
  // リレー → そのリレーを宣言している著者
  const relayToAuthors = new Map<RelayUrl, Set<string>>();
  for (const [pubkey, urls] of demand) {
    for (const url of urls) {
      const authors = relayToAuthors.get(url);
      if (authors) authors.add(pubkey);
      else relayToAuthors.set(url, new Set([pubkey]));
    }
  }

  const need = new Map<string, number>();
  for (const [pubkey, urls] of demand) {
    need.set(pubkey, Math.min(redundancy, urls.length));
  }

  const picks: RelayUrl[] = [];
  const picked = new Set<RelayUrl>();
  const take = (url: RelayUrl) => {
    picks.push(url);
    picked.add(url);
    for (const pubkey of relayToAuthors.get(url) ?? []) {
      const remaining = need.get(pubkey);
      if (remaining !== undefined && remaining > 0) {
        need.set(pubkey, remaining - 1);
      }
    }
  };

  // pinned が先。予算を食うが決して落とさない
  for (const url of pinned) {
    if (picked.has(url)) continue;
    if (picks.length >= budget) break;
    take(url);
  }

  const currentSet = new Set(current);
  const candidates = new Map(relayToAuthors);
  for (const url of picked) candidates.delete(url);

  while (picks.length < budget) {
    let best: RelayUrl | undefined;
    let bestGain = 0;
    let bestIsCurrent = false;

    for (const [url, authors] of candidates) {
      let gain = 0;
      for (const pubkey of authors) {
        if ((need.get(pubkey) ?? 0) > 0) gain += 1;
      }
      if (gain === 0) continue;

      const isCurrent = currentSet.has(url);
      const better =
        gain > bestGain ||
        // 同点なら既に開いているものを優先する (churn を減らす)
        (gain === bestGain && isCurrent && !bestIsCurrent) ||
        // それも同じなら辞書順。同じ入力が常に同じ出力になるように
        (gain === bestGain &&
          isCurrent === bestIsCurrent &&
          best !== undefined &&
          url < best);

      if (better) {
        best = url;
        bestGain = gain;
        bestIsCurrent = isCurrent;
      }
    }

    if (best === undefined) break;
    take(best);
    candidates.delete(best);
  }

  const assignment = new Map<string, readonly RelayUrl[]>();
  const uncovered: string[] = [];
  for (const [pubkey, urls] of demand) {
    const assigned = urls.filter((url) => picked.has(url)).slice(0, redundancy);
    assignment.set(pubkey, assigned);
    if (assigned.length === 0) uncovered.push(pubkey);
  }

  return { picks, assignment, uncovered };
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/read/relay-selector.test.ts`
Expected: PASS（10 件）

- [ ] **Step 5: ADR を書く**

`docs/adr/0025-greedy-relay-selection-under-a-global-budget.md` を新規作成。`status: accepted`。書く内容:

- 決定: 大域予算のもとで貪欲集合被覆によりリレーを選ぶ。冗長度は 2
- 根拠: 実測（378〜1251 本を要求するが 30 本で 96〜98%）。実測ドキュメントへリンクする。**ADR は `docs/adr/` にあるので、そこから見たパスは `../research/2026-08-01-outbox-connection-budget.md` になる**
- **却下した 2 案とその理由**（再燃させないため）: セクションごとの予算分割（10 カラムで即座に使い切り、カラム間で著者が重複するので予算を捨てる）、優先度キューによる遅延接続（30 本で 96〜98% 取れるのでキューが働くのは残り数 % に対してだけ）
- `min(redundancy, 宣言本数)` の初期化がなぜ必要か
- 粘着性が同点のときだけ効くこと、その代償（churn は減るが消えない）

- [ ] **Step 6: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "feat(read): add greedy relay selection under a global budget"
```

---

### Task 4: 張り直し経路の型と `SectionReader` の追従

**なぜ:** 現在の `SectionHandle.relays` は「`start()` 時点の計画が永久に正しい」という前提を型で表現しており、それが ADR-0016 の「解決後に張り直す」を不可能にしていた。この Task では**型と `SectionReader` 側だけ**を用意する。マネージャはまだ計画を変えない。

**Files:**
- Modify: `src/core/read/source.ts:24-30`
- Modify: `src/core/read/subscription-manager.ts:17-28`（型のみ）と 145-160（`initialPlan` へ改名）
- Modify: `src/core/read/section-reader.ts`
- Test: `src/core/read/section-reader.test.ts`
- Modify: `docs/adr/0015-section-status-excludes-renderer-fetches.md`

**Interfaces:**
- Produces:
```ts
// src/core/read/subscription-manager.ts
export type SectionPlan = {
  readonly relays: readonly RelayUrl[];
  readonly unroutableAuthors: number;
  readonly uncoveredAuthors: number;
};
export type SectionDelivery = {
  onEvent: (id: string, relay: RelayUrl) => void;
  onRelayComplete: (relay: RelayUrl) => void;
  onRelayUnreachable: (relay: RelayUrl) => void;
  onPlanChanged: (plan: SectionPlan) => void;
};
export type SectionHandle = {
  readonly initialPlan: SectionPlan;
  close(): void;
};
// src/core/read/source.ts
incomplete?: {
  unreachableRelays: number;
  unroutableAuthors: number;
  uncoveredAuthors: number;
};
```

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/section-reader.test.ts` に追記。既存のテストがマネージャをどうスタブしているかを先に読み、その作り方に合わせること。

```ts
it("goes back to streaming when the plan gains a relay", () => {
  // リレー1 だけで settled になった後、張り直しでリレー2 が増える
  const { reader, delivery, statuses } = startReaderWithRelays(["wss://one/"]);
  delivery.onRelayComplete("wss://one/");
  expect(reader.status.phase).toBe("settled");

  delivery.onPlanChanged({
    relays: ["wss://one/", "wss://two/"],
    unroutableAuthors: 0,
    uncoveredAuthors: 0,
  });

  expect(reader.status.phase).not.toBe("settled");
  expect(statuses.at(-1)?.phase).not.toBe("settled");
});

it("keeps the completion state of relays that survive a re-plan", () => {
  const { reader, delivery } = startReaderWithRelays(["wss://one/"]);
  delivery.onRelayComplete("wss://one/");

  delivery.onPlanChanged({
    relays: ["wss://one/", "wss://two/"],
    unroutableAuthors: 0,
    uncoveredAuthors: 0,
  });
  delivery.onRelayComplete("wss://two/");

  // リレー1 の完了が引き継がれていなければ settled にならない
  expect(reader.status.phase).toBe("settled");
});

it("forgets a relay that the re-plan dropped", () => {
  const { reader, delivery } = startReaderWithRelays([
    "wss://one/",
    "wss://gone/",
  ]);
  delivery.onRelayUnreachable("wss://gone/");
  expect(reader.status.incomplete?.unreachableRelays).toBe(1);

  delivery.onPlanChanged({
    relays: ["wss://one/"],
    unroutableAuthors: 0,
    uncoveredAuthors: 0,
  });
  delivery.onRelayComplete("wss://one/");

  expect(reader.status.incomplete).toBeUndefined();
  expect(reader.status.phase).toBe("settled");
});

it("clears unreachable when the relay completes after recovering", () => {
  const { reader, delivery } = startReaderWithRelays(["wss://one/"]);
  delivery.onRelayUnreachable("wss://one/");
  expect(reader.status.incomplete?.unreachableRelays).toBe(1);

  // 再接続して EOSE が届いた
  delivery.onRelayComplete("wss://one/");

  expect(reader.status.incomplete).toBeUndefined();
  expect(reader.status.phase).toBe("settled");
});

it("reports uncoveredAuthors from the plan", () => {
  const { reader, delivery } = startReaderWithRelays(["wss://one/"]);

  delivery.onPlanChanged({
    relays: ["wss://one/"],
    unroutableAuthors: 2,
    uncoveredAuthors: 3,
  });
  delivery.onRelayComplete("wss://one/");

  expect(reader.status.incomplete).toEqual({
    unreachableRelays: 0,
    unroutableAuthors: 2,
    uncoveredAuthors: 3,
  });
});
```

`startReaderWithRelays` はこのファイルに置くヘルパ。`SectionReader` を作り、`manager.subscribe` が `{ initialPlan: { relays, unroutableAuthors: 0, uncoveredAuthors: 0 }, close }` を返して `delivery` を捕捉するようにし、`reader.start()` を呼んでから `{ reader, delivery, statuses }` を返す。`statuses` は `reader.subscribe(() => statuses.push(reader.status))` で集める。**既存のテストに似たヘルパが既にあるなら、新しく作らずそれを拡張すること。**

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/section-reader.test.ts`
Expected: FAIL — `onPlanChanged` が無い / `uncoveredAuthors` が status に無い

- [ ] **Step 3: 型を足す**

`src/core/read/source.ts` の `SectionStatus.incomplete` に `uncoveredAuthors: number` を足す。

`src/core/read/subscription-manager.ts` に `SectionPlan` を足し、`SectionDelivery` に `onPlanChanged` を足し、`SectionHandle` を `{ readonly initialPlan: SectionPlan; close(): void }` にする。`subscribe()` の戻り値を `initialPlan: { relays: [...perRelay.keys()], unroutableAuthors, uncoveredAuthors: 0 }` に変える（この Task では `uncoveredAuthors` は常に 0）。

- [ ] **Step 4: `SectionReader` を追従させる**

- `start()` の `this.#handle.relays` を `this.#handle.initialPlan.relays` にする
- `#plan: SectionPlan` フィールドを持ち、`start()` で `initialPlan` を入れる
- `onPlanChanged` ハンドラを `manager.subscribe` へ渡す。中身は「`#plan` を差し替え、`#relays` を**新しいリレー集合で作り直す（残るリレーの `RelayState` は使い回す）**、`#notify()`」
- `onRelayComplete` を `complete = true` かつ `unreachable = false` にする。**専用の復帰コールバックは足さない**
- `status` の `unroutableAuthors` は `#handle?.unroutableAuthors` ではなく `#plan` から読む。`uncoveredAuthors` も同様
- `incomplete` を付ける条件は「3 つのいずれかが 0 より大きい」

`#relays` の作り直しは、Task 6 で `onPlanChanged` が `#starting` の最中にも飛びうるので、既存の `#starting` 抑制と噛み合うことを確認すること。

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run && pnpm typecheck`
Expected: PASS。`incomplete` の形が変わったので `subscription-manager.test.ts` / `create-section.test.tsx` / デバッグルートに追従が要る。

- [ ] **Step 6: ADR-0015 の境界を守るテストを足す**

**`relays: []` の判断は変えない。** 明示的な空配列を持つセクションは、フィールドが 3 つになった後も `phase: "settled"`、`incomplete` なしを報告する。既存のテストがこれを主張しているはずなので、それが**まだ通っていること**を確認する。無ければ足す:

```ts
it("still settles with no incomplete for an explicitly empty relay list", () => {
  const { reader, delivery } = startReaderWithRelays([]);
  void delivery;

  expect(reader.status).toEqual({ phase: "settled" });
});
```

- [ ] **Step 7: ADR-0015 を改訂する**

`incomplete` に `uncoveredAuthors` を足したこと、**`unroutableAuthors` に合算しない理由**（`uncovered` は上限を上げれば直るこちら側の問題、`unroutable` は相手が `kind:10002` を出していないので直せない。混ぜると「設定を変えれば直るのか」に答えられない）、および `relays: []` の判断は不変であることを書く。

- [ ] **Step 8: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "feat(read): let a live section learn that its plan changed"
```

---

### Task 5: `planQuery` を割り当てベースに縮める

**なぜ:** `planQuery` は今「著者→リレーを引く」と「リレーごとのフィルタを組む」を同時にやっている。前者はセレクタの仕事なので、この関数は割り当てを受け取ってフィルタを組むだけにする。

**Files:**
- Modify: `src/core/read/query-plan.ts`
- Modify: `src/core/read/subscription-manager.ts:100-108`（呼び出し側の追従）
- Test: `src/core/read/query-plan.test.ts`

**Interfaces:**
- Produces:
```ts
export type QueryPlan = {
  perRelay: Map<RelayUrl, RelayFilter[]>;
  unroutableAuthors: string[];
  uncoveredAuthors: string[];
};
export type PlanQueryOptions = {
  filters: RelayFilter[];
  /** 著者 → 購読するリレー。**宣言があった著者だけ**が入る。空配列 = 予算切れ */
  assignment: ReadonlyMap<string, readonly RelayUrl[]>;
  fallbackRelays: readonly RelayUrl[];
};
```

**契約:**

| 著者の状態 | 意味 | 送り先 | 計上 |
|---|---|---|---|
| `assignment` に無い | `kind:10002` が引けない | fallback | `unroutableAuthors` |
| `assignment` にあり値が空 | 予算切れ | どこにも送らない | `uncoveredAuthors` |
| `assignment` にあり値がある | 通常 | その各リレー | なし |

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/query-plan.test.ts` を書き換える。既存テストの `writeRelaysFor` を `assignment` に置き換え、以下を足す:

```ts
it("sends an author with no relay list to the fallback relays", () => {
  const plan = planQuery({
    filters: [{ kinds: [1], authors: [A] }],
    assignment: new Map(), // A は kind:10002 が引けていない
    fallbackRelays: ["wss://fallback/"],
  });

  expect(plan.perRelay.get("wss://fallback/")).toEqual([
    { kinds: [1], authors: [A] },
  ]);
  expect(plan.unroutableAuthors).toEqual([A]);
  expect(plan.uncoveredAuthors).toEqual([]);
});

it("sends an author whose budget ran out nowhere, and counts them", () => {
  const plan = planQuery({
    filters: [{ kinds: [1], authors: [A] }],
    assignment: new Map([[A, []]]), // 宣言はあるが予算で落ちた
    fallbackRelays: ["wss://fallback/"],
  });

  // fallback へ送ってはいけない。予算を守るために落としたのに
  // fallback で開き直したら意味がない
  expect(plan.perRelay.size).toBe(0);
  expect(plan.unroutableAuthors).toEqual([]);
  expect(plan.uncoveredAuthors).toEqual([A]);
});

it("splits one filter into per-relay filters by assignment", () => {
  const plan = planQuery({
    filters: [{ kinds: [1], authors: [A, B], limit: 50 }],
    assignment: new Map([
      [A, ["wss://one/"]],
      [B, ["wss://two/"]],
    ]),
    fallbackRelays: ["wss://fallback/"],
  });

  expect(plan.perRelay.get("wss://one/")).toEqual([
    { kinds: [1], authors: [A], limit: 50 },
  ]);
  expect(plan.perRelay.get("wss://two/")).toEqual([
    { kinds: [1], authors: [B], limit: 50 },
  ]);
});
```

既存の「`authors` 未指定は fallback へ同報する」「`authors: []` は送らない」「リレーごとにフィルタは別インスタンス」のテストは**そのまま残すこと**。いずれも実在した欠陥の回帰テストである。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/query-plan.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`planQuery` の著者ループを差し替える。`writeRelaysFor(author)` の呼び出しを消し、

```ts
for (const author of authors) {
  const assigned = assignment.get(author);

  if (assigned === undefined) {
    // kind:10002 が引けていない。暫定的に fallback へ回す (ADR-0016)
    unroutable.add(author);
    for (const relay of fallbackRelays) {
      const bucket = byRelay.get(relay);
      if (bucket) bucket.push(author);
      else byRelay.set(relay, [author]);
    }
    continue;
  }

  if (assigned.length === 0) {
    // 予算で落ちた。fallback へ回すと予算を守った意味が無くなるので
    // どこへも送らず、欠落として報告する (ADR-0011)
    uncovered.add(author);
    continue;
  }

  for (const relay of assigned) {
    const bucket = byRelay.get(relay);
    if (bucket) bucket.push(author);
    else byRelay.set(relay, [author]);
  }
}
```

`uncovered` は `unroutable` と同じく `new Set<string>()` で持ち、戻り値で `[...uncovered]` にする。JSDoc の「著者を指定していないフィルタは…」の段落と「各リレー向けのフィルタは浅いコピー」の警告は**そのまま残すこと**。

- [ ] **Step 4: 呼び出し側を追従させる**

`src/core/read/subscription-manager.ts` の `planQuery` 呼び出し（100-108 行目）で、`writeRelaysFor` の代わりに割り当てを作って渡す。**この Task ではまだセレクタを使わない** — 各著者に `routing.writeRelaysFor(author)` の結果をそのまま割り当てる（宣言が空なら `assignment` に入れない）。`plan.uncoveredAuthors.length` を `initialPlan.uncoveredAuthors` に流す。

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "refactor(read): make planQuery take an assignment instead of routing"
```

---

### Task 6: マネージャがセクションを登録し、大域で選び直す

**なぜ:** 予算はアプリ全体の値なので、選択も全セクションの需要をまとめて行う必要がある。ここで選択が実際に着地し、`onPlanChanged` が意味を持つ。

**Files:**
- Modify: `src/core/read/subscription-manager.ts`
- Test: `src/core/read/subscription-manager.test.ts`

**Interfaces:**
- Consumes: `selectRelays` / `Selection`（Task 3）、`planQuery`（Task 5）、`MAX_CONNECTIONS` / `RELAY_REDUNDANCY`（Task 2）、`SectionPlan` / `onPlanChanged`（Task 4）
- Produces: `SubscriptionManagerOptions` に `maxConnections?: number` と `redundancy?: number` を足す（既定は定数）。`SubscriptionManager.replan(): void` を公開する。

**構造:** マネージャは登録済みセクションの集合を持つ。各エントリは `{ filters, explicitRelays, delivery, opened: Map<RelayUrl, RelaySubscription>, plan }`。

`replan()` の流れ:

1. 全エントリの `filters` から**大域の需要**を作る（著者 → `routing.writeRelaysFor(author)`。空なら需要に入れない）
2. `pinned` を作る（fallback リレー + 全エントリの `explicitRelays`）
3. `selectRelays({ demand, pinned, current: 開いているリレー, budget, redundancy })`
4. エントリごとに `planQuery({ filters, assignment, fallbackRelays })` を呼ぶ
5. エントリごとに、前回の `opened` と新しい `perRelay` を**差分**する。消えたリレーは購読を閉じて `release`、増えたリレーは購読を開く、両方にあるものは触らない
6. 計画が変わったエントリにだけ `delivery.onPlanChanged(newPlan)` を呼ぶ

**明示リレーのセクションは選択を経由しない**（ADR-0005 のバイパス）。`explicitRelays` があるエントリは `perRelay` を明示リレーから直接作る。ただし `pinned` に入れて予算は消費する。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/subscription-manager.test.ts` に追記:

```ts
it("shares one budget across every section", () => {
  // 2 つのセクションが別々の著者を見ていても、開く接続の合計が予算を超えない
  const { manager, connections } = createManager({ maxConnections: 3 });
  manager.subscribe([{ kinds: [1], authors: authorsWithRelays(0, 5) }], undefined, noopDelivery());
  manager.subscribe([{ kinds: [1], authors: authorsWithRelays(5, 10) }], undefined, noopDelivery());

  expect(connections.size).toBeLessThanOrEqual(3);
});

it("re-plans a live section when its routing becomes known", () => {
  // 著者の kind:10002 が後から届いたら、fallback から本来のリレーへ張り直す
  const { manager, store, delivery, plans } = createManagerWithSection(AUTHOR);
  expect(plans.at(-1)?.relays).toEqual(["wss://fallback/"]);

  store.put(relayListFor(AUTHOR, ["wss://author-write/"]), "wss://fallback/");
  manager.replan();

  expect(plans.at(-1)?.relays).toEqual(["wss://author-write/"]);
  expect(plans.at(-1)?.unroutableAuthors).toBe(0);
  void delivery;
});

it("does not reopen a relay that both plans keep", () => {
  // 差分を取らずに全部張り直すと、全カラムの phase が巻き戻る
  const { manager, connectCalls } = createManagerWithTwoAuthorsSharingARelay();
  const before = connectCalls.length;

  manager.replan();

  expect(connectCalls.length).toBe(before);
});

it("reports authors dropped by the budget as uncovered", () => {
  const { manager, plans } = createManagerWithSection(/* 5 authors, 5 relays */);
  // budget 1 の manager では 4 人が落ちる
  expect(plans.at(-1)?.uncoveredAuthors).toBeGreaterThan(0);
});

it("never drops an explicitly requested relay for budget reasons", () => {
  const { manager, connections } = createManager({ maxConnections: 1 });
  manager.subscribe([{ kinds: [1] }], ["wss://named/"], noopDelivery());
  manager.subscribe([{ kinds: [1], authors: authorsWithRelays(0, 5) }], undefined, noopDelivery());

  expect([...connections.keys()]).toContain("wss://named/");
});
```

**ヘルパは既存のテストファイルにあるものを拡張すること。** 無い部分だけ足す。このファイルで新たに要るのは:

| ヘルパ | 中身 |
|---|---|
| `createManager(options?)` | `EventStore` と `RoutingTable` を作り、`FakeRelayConnection` を返す `connect` で `SubscriptionManager` を組む。`{ manager, store, connections, connectCalls }` を返す。`connections` は URL → `FakeRelayConnection` の Map、`connectCalls` は呼ばれた URL の配列 |
| `relayListFor(pubkey, urls)` | その pubkey の署名つき `kind:10002`（`r` タグは `write` マーカー）。`routing-table.test.ts` の `relayList` ヘルパと同じ作り方 |
| `authorsWithRelays(from, to)` | 連番の pubkey を作り、それぞれに**別々の**write リレーを宣言する `kind:10002` を `store` に入れてから pubkey の配列を返す |
| `noopDelivery()` | 4 つのコールバックが何もしない `SectionDelivery` |
| `createManagerWithSection(...authors)` | `createManager` に加えて 1 セクションを `subscribe` し、`onPlanChanged` で受けた `SectionPlan` を溜める `plans` 配列を返す。`plans` には `initialPlan` も先頭に入れておくと `plans.at(-1)` が常に最新になる |

「両方の計画が保持するリレーを開き直さない」テストは、**2 人の著者が同じリレーを宣言している状態**を `authorsWithRelays` ではなく手で組む（`relayListFor(A, ["wss://shared/"])` と `relayListFor(B, ["wss://shared/"])`）。`connectCalls.length` が `replan()` の前後で変わらないことを主張する。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/subscription-manager.test.ts`
Expected: FAIL — `manager.replan is not a function` ほか

- [ ] **Step 3: 実装する**

上の**構造**のとおりに `SubscriptionManager` を書き換える。実装上の注意:

- `subscribe()` はエントリを登録してから `replan()` を呼び、そのエントリの計画を `initialPlan` として返す。**`onPlanChanged` は `subscribe()` の中では呼ばない**（呼び出し側がまだハンドルを持っていない）
- `handle.close()` はエントリを外してから `replan()` を呼ぶ。閉じたエントリに `onPlanChanged` を呼ばないこと
- `dispose()` 後のハンドルが生きている接続を閉じないための仕組みは**現行の世代カウンタをそのまま保つ**。Task 7 で識別子ベースに置き換える
- 需要の構築は著者ごとに 1 回だけ `routing.writeRelaysFor` を呼ぶ（`RoutingTable` は呼ぶたびに `parseRelayList` をやり直すので、著者数 × セクション数だけ走らせない）

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "feat(read): plan relay selection globally across all sections"
```

---

### Task 7: `ConnectionPool` を切り出す

**なぜ:** 接続の所有・予算・購読レジストリを 1 箇所に集める。レジストリは Task 9 の再接続（元のフィルタで張り直す）に必要である。

**Files:**
- Create: `src/core/read/connection-pool.ts`
- Test: `src/core/read/connection-pool.test.ts`
- Modify: `src/core/read/subscription-manager.ts`（`#pool` / `#acquire` / `#release` / 世代カウンタを捨ててプールに委ねる）

**Interfaces:**
- Produces:
```ts
export type PooledSubscription = { close(): void };
export type ConnectionPoolOptions = {
  connect: (url: RelayUrl) => RelayConnection;
  maxConnections?: number;
};
export class ConnectionPool {
  get size(): number;
  /** 予算に空きが無ければ undefined。呼び出し側は uncovered として扱う */
  subscribe(
    url: RelayUrl,
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): PooledSubscription | undefined;
  dispose(): void;
}
```

**`close()` は識別子ベースにする。** 現行の世代カウンタは `dispose()` 後の迷子ハンドルを無効化するためのものだが、プールでは**エントリのオブジェクト同一性**で同じことがより正確にできる:

```ts
close: () => {
  const pooled = this.#pool.get(url);
  // dispose 済み、二重 close、あるいは dispose を挟んで同じ URL が
  // 開き直された場合 — いずれもこの entry は今の集合に居ない
  if (!pooled || !pooled.entries.has(entry)) return;
  pooled.entries.delete(entry);
  entry.subscription?.close();
  if (pooled.entries.size === 0) this.#drop(url);
}
```

参照カウントは別に持たない。**`entries.size` がそのまま参照カウントである。**

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/connection-pool.test.ts` を新規作成:

```ts
it("shares one connection between subscriptions to the same relay", () => {
  const { pool, connectCalls } = createPool();
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  pool.subscribe("wss://one/", [{ kinds: [7] }], noopHandlers());

  expect(connectCalls).toEqual(["wss://one/"]);
  expect(pool.size).toBe(1);
});

it("closes the connection when the last subscription closes", () => {
  const { pool, connections } = createPool();
  const a = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  const b = pool.subscribe("wss://one/", [{ kinds: [7] }], noopHandlers());

  a?.close();
  expect(connections.get("wss://one/")?.closed).toBe(false);
  b?.close();
  expect(connections.get("wss://one/")?.closed).toBe(true);
  expect(pool.size).toBe(0);
});

it("refuses a new relay once the budget is full", () => {
  const { pool } = createPool({ maxConnections: 1 });
  expect(pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers())).toBeDefined();
  expect(pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers())).toBeUndefined();
});

it("still accepts another subscription to an already open relay at the budget", () => {
  const { pool } = createPool({ maxConnections: 1 });
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

  // 新しい接続は要らないので予算に関係ない
  expect(pool.subscribe("wss://one/", [{ kinds: [7] }], noopHandlers())).toBeDefined();
});

it("does not let a subscription from before dispose() close a later connection", () => {
  const { pool, connections } = createPool();
  const stale = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  pool.dispose();
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  const fresh = connections.get("wss://one/");

  stale?.close();

  expect(fresh?.closed).toBe(false);
  expect(pool.size).toBe(1);
});

it("reports the relay as closed instead of throwing when connect() fails", () => {
  // 30 本のうち 1 本が死んでいるだけで全カラムが例外になってはいけない
  const { pool } = createPool({ failing: ["wss://bad/"] });
  const reasons: string[] = [];

  const sub = pool.subscribe("wss://bad/", [{ kinds: [1] }], {
    onEvent: () => {},
    onEose: () => {},
    onClosed: (reason) => reasons.push(reason),
  });

  expect(reasons).toHaveLength(1);
  expect(() => sub?.close()).not.toThrow();
});
```

`createPool` は `FakeRelayConnection` を返す `connect` を組み立て、`connectCalls` と URL → 接続の Map を一緒に返すヘルパ。`failing` に入れた URL では `connect` が投げるようにする。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/connection-pool.test.ts`
Expected: FAIL — `Cannot find module './connection-pool'`

- [ ] **Step 3: 実装する**

内部状態は `Map<RelayUrl, Pooled>`、`Pooled = { connection: RelayConnection | null; entries: Set<Entry>; offClose: (() => void) | null }`、`Entry = { filters: RelayFilter[]; handlers: RelaySubscriptionHandlers; subscription: RelaySubscription | null }`。

`size` は**接続が生きているものだけ**を数える（Task 8 で死んだ接続が枠を占有しないことに効く）:

```ts
get size(): number {
  let open = 0;
  for (const pooled of this.#pool.values()) if (pooled.connection) open += 1;
  return open;
}
```

`subscribe(url, filters, handlers)`:

1. `pooled` が無く、かつ `this.size >= max` なら `undefined` を返す
2. `pooled` が無ければ作って `#pool` に入れ、`connect(url)` を試みる。**投げたら `connection` を `null` のままにする**（`#pool` からは消さない — Task 9 の再接続対象として残す）
3. `entry` を作って `pooled.entries` に足す
4. `pooled.connection` があれば `connection.subscribe(filters, handlers)` を `entry.subscription` に入れる。**ここも try/catch で包み、投げたら `null` のままにする**
5. `pooled.connection` が無い（または subscribe が投げた）なら `handlers.onClosed("relay unavailable")` を**同期的に**呼ぶ
6. 上の**識別子ベース**の `close` を持つ `PooledSubscription` を返す

`#drop(url)` は `offClose?.()` してから `connection?.close()` し、`#pool.delete(url)`。

`dispose()` は全 `pooled` について `#drop` 相当を行い `#pool.clear()`。

**手順 5 の同期 `onClosed` は `SectionReader.#starting` が抑制する前提である。** Task 4 でその噛み合わせを確認済み。

- [ ] **Step 4: マネージャをプールに載せ替える**

`SubscriptionManager` から `#pool` / `#acquire` / `#release` / `#generation` を削除し、`ConnectionPool` を持つ。`SubscriptionManagerOptions` の `connect` はそのままプールへ渡す。`maxConnections` もプールへ渡す。

**予算を超えて拒否されたリレーの扱い（2026-08-01 訂正）。** 初版は「そのエントリの計画から外して `uncoveredAuthors` に寄せる」と書いていたが、**これは誤りである。** Task 6 のレビューで、予算超過が Outbox 経路だけでなく**明示指定リレーと fallback リレーでも起きる**ことが実測された（`maxConnections: 1` で fallback 3 本のセクションが 3 接続を開く。本番設定・10 カラムが各 5 本を名指しする場合で 30 + 3 + 50 = 83 接続）。明示リレーにも fallback にも**背後に著者がいない**ので、`uncoveredAuthors` は数えようがなく、無理に数えれば捏造になる。

正しい扱いは 3 つ:

1. **報告先は `delivery.onRelayUnreachable(url)`** → `incomplete.unreachableRelays`。意味がそのまま合う — 「見るべき場所だったが見なかった」。`uncoveredAuthors` は Outbox 経路の著者、それも**割り当てられた最後のリレーを失った著者**にだけ使う。1 回の拒否で両方が立つこともある
2. **拒否されたリレーは `plan.relays` に残す。** `SectionReader.#applyPlan` は `#relays` を `plan.relays` から作り直すので、計画から外すと次の計画変更でその記録ごと消える。残したうえで unreachable を立てれば、`status` の `live = states.filter(r => !r.unreachable)` により `settled` を妨げず、`incomplete` には計上され続ける
3. **ADR-0025 に一文足す — pinned は予算の優先権であって免除ではない。** ADR-0005 が言う「明示指定は**著者ルーティング**のバイパス」はソケット予算のバイパスを意味しない。ADR-0011 の 30 はユーザーの意図で無料にできない資源上限であり、ADR-0025 は既に `pinned` を `budget` で切り詰める先例を持つ（テスト済み）。**上限が勝つ。**

**Task 6 のテスト `never drops an explicitly requested relay for budget reasons` は、この Task で落ちるはずである。** それが正しい信号であり、プールを弱めて通してはならない。テストを「予算内なら明示リレーが優先される」に書き換えること。

**`PooledSubscription.close()` は決して例外を投げてはならない。** Task 6 の時点で `handle.close()` は末尾で `replan()` を呼ぶため `connect()` が投げうる状態になっており、`SectionReader.stop()` はこれを try/catch していない。投げると `#started` が `true` のまま残り、そのセクションは二度と `start()` できず、`createSection` の `onCleanup` も途中で中断する。**プールが `connect()` / `subscribe()` の例外を吸収して `handlers.onClosed("relay unavailable")` に変える**ことで、`#replan()` 自体が投げなくなり、この経路ごと消える。`close()` が total であることをテストで主張すること。

`connectionCount` ゲッターは `pool.size` に委譲する（デバッグルートとテストが使っている）。

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "feat(read): own connections in a budgeted pool with a subscription registry"
```

---

### Task 8: 死んだ接続を追い出して枠を解放する

**なぜ:** これが**現在生きているバグ**の修正である。ソケットが自然死しても接続がプールに残り続け、次にその URL を掴んだセクションが死体を渡される。

**Files:**
- Modify: `src/core/read/connection-pool.ts`
- Test: `src/core/read/connection-pool.test.ts`

**Interfaces:**
- Consumes: `RelayConnection.onClose`（Task 1）、`FakeRelayConnection.die()`（Task 1）

- [ ] **Step 1: 失敗するテストを書く**

```ts
it("frees the slot when a connection dies on its own", () => {
  const { pool, connections } = createPool({ maxConnections: 1 });
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  expect(pool.size).toBe(1);

  connections.get("wss://one/")?.die();

  // 死んだソケットが 30 枠を握り続けてはいけない (ADR-0021)
  expect(pool.size).toBe(0);
  expect(pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers())).toBeDefined();
});

it("does not hand a dead connection to the next subscriber", () => {
  const { pool, connections, connectCalls } = createPool();
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  connections.get("wss://one/")?.die();

  const reasons: string[] = [];
  pool.subscribe("wss://one/", [{ kinds: [7] }], {
    onEvent: () => {},
    onEose: () => {},
    onClosed: (reason) => reasons.push(reason),
  });

  // 死体を渡されると即座に onClosed が返り、そのカラムは永久に unreachable になる
  expect(reasons).toEqual([]);
  expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);
});

it("keeps the registry so the entries can be re-issued later", () => {
  const { pool, connections } = createPool();
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  connections.get("wss://one/")?.die();

  // 接続は無いがエントリは残っている。close() しても例外にならない
  expect(pool.size).toBe(0);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/connection-pool.test.ts`
Expected: FAIL — 死後も `pool.size` が 1 のまま

- [ ] **Step 3: 実装する**

接続を開いたところで `pooled.offClose = connection.onClose(() => this.#onConnectionDied(url))` を登録する。

```ts
#onConnectionDied(url: RelayUrl): void {
  const pooled = this.#pool.get(url);
  if (!pooled) return;
  // 枠を解放する (ADR-0021)。エントリは張り直しのために保持する
  pooled.offClose?.();
  pooled.offClose = null;
  pooled.connection = null;
  for (const entry of pooled.entries) entry.subscription = null;
}
```

**購読の `onClosed` をここで呼ばないこと。** 接続側（`WebSocketRelayConnection.fail()` / `FakeRelayConnection.die()`）が既に全ハンドラへ配っている。二重に呼ぶと `unreachableRelays` が二重計上される。

`subscribe()` の手順 2 を「`pooled` が無い**か `pooled.connection` が null**なら `connect(url)` を試みる」に広げる。このとき `this.size >= max` の判定も必要になる（死んだ接続を開き直すのも 1 枠を使う）。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "fix(read): evict dead connections so they stop occupying the budget"
```

---

### Task 9: 再接続 — バックオフ・ジッタ・`retryNow()`

**なぜ:** streets は開きっぱなしで使うクライアントである。ノート PC をスリープして復帰したとき、全カラムが死んだままになってはいけない。

**Files:**
- Modify: `src/core/read/connection-pool.ts`
- Test: `src/core/read/connection-pool.test.ts`
- Modify: `docs/adr/0021-reconnection-policy.md`

**Interfaces:**
- Produces: `ConnectionPoolOptions` に `scheduler?: { setTimeout, clearTimeout }` と `random?: () => number` を足す（テスト用の注入口）。`ConnectionPool.retryNow(): void` を公開する。`SubscriptionManager.retryNow(): void` から委譲する。

**決定（ADR-0021 を `accepted` にする）:**

| 項目 | 決定 |
|---|---|
| バックオフ | 指数、初回 1 秒、上限 60 秒 |
| ジッタ | `delay = base * (0.5 + random())`。無いと 30 本の再接続が同期して復帰時にバーストを自作する |
| 諦める条件 | **永久に諦めない。** 60 秒で頭打ちにして回し続ける |
| 枠 | 再接続待ちは枠を占有しない（Task 8 で達成済み） |
| 再購読の担当 | **プール**。アダプタは 1 ソケット・リトライ無しのまま保つ |
| 切断中のイベント | **元のフィルタをそのまま張り直す。** `since` で埋めない |
| 手動再試行 | `retryNow()` を公開。UI は後続 #7 |

**仕様からの訂正が 2 つある。**

**① 予算が埋まって復帰できないときの報告先。** 仕様 §4 は「その著者を `uncovered` として報告」と書いていたが、**`unreachableRelays` のほうが正確である。** そのリレーはセクションの計画に入っており（選ばれている）、届いていないだけだからである。`uncovered` は計画に 1 本も入らなかった著者を指す。この Task では追加の報告経路を作らない。

**② 接続の死亡・復帰では選び直さない。** 仕様 §5 は選び直しの契機として「接続の死亡・復帰（供給の変化）」を挙げていたが、**これは実装しない。** 理由は 2 つ。

- 死んだリレーはプールのレジストリに残って再接続を待っている。同じリレーが `current` に居るまま選び直すと、セレクタと再接続機構が同じ枠を取り合う
- 死亡のたびに選び直すと、瞬断のたびに全カラムの計画が動く。粘着性を入れてまで避けたかった churn がここから入る

**死亡は「計画は正しいが今は届いていない」であって「計画が間違っている」ではない。** したがって報告先は `unreachableRelays` であり、計画は変えない。選び直しの契機は「セクションの追加・削除」と「`kind:10002` の到着」の 2 つに絞る。

- [ ] **Step 1: 失敗するテストを書く**

```ts
it("reconnects with exponential backoff after a death", () => {
  const { pool, connections, connectCalls, clock } = createPool({ random: () => 0.5 });
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  connections.get("wss://one/")?.die();

  clock.advance(999);
  expect(connectCalls).toHaveLength(1);
  clock.advance(1); // 初回 1 秒 * (0.5 + 0.5)
  expect(connectCalls).toHaveLength(2);
});

it("re-issues the original filters on reconnect", () => {
  const { pool, connections, clock } = createPool({ random: () => 0.5 });
  pool.subscribe("wss://one/", [{ kinds: [1], authors: ["abc"] }], noopHandlers());
  connections.get("wss://one/")?.die();

  clock.advance(1000);

  // since で埋めない。元のフィルタをそのまま張り直す
  expect(connections.get("wss://one/")?.subscriptions[0].filters).toEqual([
    { kinds: [1], authors: ["abc"] },
  ]);
});

it("caps the backoff at 60 seconds and never gives up", () => {
  const { pool, connections, connectCalls, clock } = createPool({ random: () => 0.5 });
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

  for (let attempt = 0; attempt < 12; attempt += 1) {
    connections.get("wss://one/")?.die();
    clock.advance(60_000);
  }

  // 8 回で諦めない。スリープ復帰が手動再試行だけになってはいけない
  expect(connectCalls.length).toBe(13);
});

it("applies jitter so reconnections do not synchronise", () => {
  const { pool, connections, connectCalls, clock } = createPool({ random: () => 0 });
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  connections.get("wss://one/")?.die();

  clock.advance(499);
  expect(connectCalls).toHaveLength(1);
  clock.advance(1); // 1000 * (0.5 + 0) = 500ms
  expect(connectCalls).toHaveLength(2);
});

it("retryNow() reconnects immediately and resets the backoff", () => {
  const { pool, connections, connectCalls, clock } = createPool({ random: () => 0.5 });
  pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  connections.get("wss://one/")?.die();
  clock.advance(1000);
  connections.get("wss://one/")?.die(); // 2 回目、次は 2 秒待ち

  pool.retryNow();

  expect(connectCalls).toHaveLength(3);
  // バックオフがリセットされているので、次の死亡後は再び 1 秒
  connections.get("wss://one/")?.die();
  clock.advance(1000);
  expect(connectCalls).toHaveLength(4);
});

it("stops reconnecting once the last subscription closed", () => {
  const { pool, connections, connectCalls, clock } = createPool({ random: () => 0.5 });
  const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
  connections.get("wss://one/")?.die();

  sub?.close();
  clock.advance(60_000);

  expect(connectCalls).toHaveLength(1);
});
```

`clock` は偽タイマー。`vitest` の `vi.useFakeTimers()` を使うか、`scheduler` を注入して手で進めるヘルパを書く。**注入するほうが望ましい** — 読み取り層が DOM も実タイマーも掴んでいないことを構造で示せる。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/connection-pool.test.ts`
Expected: FAIL — 再接続しない

- [ ] **Step 3: 実装する**

`Pooled` に `attempts: number` と `timer: ReturnType<setTimeout> | null` を足す。定数は `RECONNECT_BASE_MS = 1_000`、`RECONNECT_MAX_MS = 60_000`。

`#onConnectionDied` の末尾で `#scheduleReconnect(url)` を呼ぶ。

```ts
#scheduleReconnect(url: RelayUrl): void {
  const pooled = this.#pool.get(url);
  if (!pooled || pooled.connection || pooled.timer !== null) return;
  if (pooled.entries.size === 0) return; // 誰も待っていない

  const base = Math.min(
    RECONNECT_BASE_MS * 2 ** pooled.attempts,
    RECONNECT_MAX_MS,
  );
  // ジッタ: 0.5〜1.5 倍。無いと全リレーの再接続が同期し、
  // 復帰時に自分でバーストを作る
  const delay = base * (0.5 + this.#random());
  pooled.attempts += 1;
  pooled.timer = this.#scheduler.setTimeout(() => {
    pooled.timer = null;
    this.#reconnect(url);
  }, delay);
}

#reconnect(url: RelayUrl): void {
  const pooled = this.#pool.get(url);
  if (!pooled || pooled.connection || pooled.entries.size === 0) return;
  // 枠が無ければ諦めず、あとでもう一度試す
  if (this.size >= this.#maxConnections) {
    this.#scheduleReconnect(url);
    return;
  }
  try {
    const connection = this.#options.connect(url);
    pooled.connection = connection;
    pooled.offClose = connection.onClose(() => this.#onConnectionDied(url));
    for (const entry of pooled.entries) {
      entry.subscription = connection.subscribe(entry.filters, entry.handlers);
    }
    pooled.attempts = 0;
  } catch {
    pooled.connection = null;
    pooled.offClose = null;
    this.#scheduleReconnect(url);
  }
}
```

`retryNow()` は全 `pooled` について「接続が無ければタイマーを消し、`attempts = 0` にして `#reconnect(url)`」。

`#drop(url)` と `dispose()` で `timer` を必ず `clearTimeout` すること。**タイマーが残ると、閉じたはずのリレーへ再接続し続ける。**

`SubscriptionManager` に `retryNow()` を足してプールへ委譲する。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: ADR-0021 を `accepted` にする**

`status: proposed` を `accepted` にし、上の**決定**の表で「決めるべきこと（未確定）」の表を置き換える。提案から変えた 2 項目（再購読の担当・諦める条件）については、変えた理由も書く。切断中のイベントを埋めない理由（スリープ復帰で数時間分が流れ込み 500 件上限を即座に埋めて古い方を押し出す）も書く。

- [ ] **Step 6: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "feat(read): reconnect dead relays with jittered exponential backoff"
```

---

### Task 10: `kind:10002` の到着で選び直す

**なぜ:** ADR-0016 の「未解決の著者は既定リレーへ暫定的に送信し、**解決後に張り直す**」の後半を完成させる。ウォームアップ中に届く `kind:10002` のバーストで数百回選び直さないようデバウンスする。

**Files:**
- Modify: `src/core/read/subscription-manager.ts`
- Test: `src/core/read/subscription-manager.test.ts`

**Interfaces:**
- Consumes: `ConnectionPoolOptions.scheduler`（Task 9）— マネージャも同じ注入口を持つ
- Produces: `SubscriptionManagerOptions` に `scheduler?` と `replanDebounceMs?`（既定 100）

- [ ] **Step 1: 失敗するテストを書く**

```ts
it("re-plans after a kind:10002 arrives", () => {
  const { manager, connections, plans, clock } = createManagerWithSection(AUTHOR);
  expect(plans.at(-1)?.relays).toEqual(["wss://fallback/"]);

  // fallback リレーが著者の kind:10002 を配信してきた
  emitEvent(connections.get("wss://fallback/"), relayListFor(AUTHOR, ["wss://author-write/"]));
  clock.advance(100);

  expect(plans.at(-1)?.relays).toEqual(["wss://author-write/"]);
});

it("debounces a burst of relay lists into one re-plan", () => {
  const { manager, connections, plans, clock } = createManagerWithSection(AUTHOR);
  const before = plans.length;

  for (let i = 0; i < 50; i += 1) {
    emitEvent(connections.get("wss://fallback/"), relayListFor(authorAt(i), [`wss://w${i}/`]));
  }
  clock.advance(100);

  // ウォームアップは kind:10002 のバースト。50 回選び直してはいけない
  expect(plans.length - before).toBe(1);
});

it("does not re-plan for ordinary events", () => {
  const { manager, connections, plans, clock } = createManagerWithSection(AUTHOR);
  const before = plans.length;

  emitEvent(connections.get("wss://fallback/"), noteBy(AUTHOR));
  clock.advance(100);

  expect(plans.length).toBe(before);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/subscription-manager.test.ts`
Expected: FAIL — 張り直しが起きない

- [ ] **Step 3: 実装する**

マネージャの `onEvent`（プールへ渡しているハンドラ）で、`store.put(...)` が `"rejected"` でなく、かつ `event.kind === 10002` なら `#scheduleReplan()` を呼ぶ。

```ts
#scheduleReplan(): void {
  if (this.#replanTimer !== null) return;
  this.#replanTimer = this.#scheduler.setTimeout(() => {
    this.#replanTimer = null;
    this.replan();
  }, this.#replanDebounceMs);
}
```

`dispose()` でタイマーを消すこと。

**`EventStore` に変更通知を足さない。** 後続 #4（IndexedDB 水和）で `EventStore` を読み取り層の内部に降ろす作業と干渉するためである。**帰結として、水和で入る `kind:10002` はマネージャを通らないので、後続 #4 で明示的に `replan()` を呼ぶ必要がある。** この一文をコードのコメントに残すこと。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "feat(read): re-plan live sections when a relay list arrives"
```

---

### Task 11: `warmUpRouting` をプール経由にする

**なぜ:** 現在 `warmUpRouting` は自前の `connect` でインデクサへ接続しており、**プールの外にいる。** このままだとウォームアップ中は 30 + 4 = 34 本になり、ADR-0011 の予算が意味を持たなくなる。

**Files:**
- Modify: `src/core/read/bootstrap.ts`
- Modify: `src/routes/debug/v1-section.tsx`（呼び出し側）
- Test: `src/core/read/bootstrap.test.ts`

**Interfaces:**
- `WarmUpOptions.connect` を `pool: ConnectionPool` に置き換える。`collect` は `connection.subscribe` ではなく `pool.subscribe(url, filters, handlers)` を使う。

**インデクサは予算が埋まっていても必ず開けなければならない。** ウォームアップこそがルーティングを成立させるので、Outbox の選択に枠を奪われて走れないと循環する。プールに**予約枠**の概念を足すか、マネージャ側でインデクサを `pinned` に含めるかの二択だが、**後者を採る** — ウォームアップはマネージャの `subscribe` を経由しないので、マネージャが `pinned` にインデクサを含めても意味がない。したがって**プールに `subscribe` の予算チェックを迂回する経路を足す**:

```ts
subscribe(url, filters, handlers, options?: { reserved?: boolean }): PooledSubscription | undefined
```

`reserved: true` のときは `size >= max` でも接続を開く。ブートストラップだけが使う。**乱用すると予算が意味を失うので、この 1 箇所以外では使わないこと。**

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/bootstrap.test.ts` を追従させる（`connect` を渡していた既存テストは `pool` を渡す形に書き換える）。加えて:

```ts
it("opens indexers even when the pool is already at its budget", () => {
  const pool = new ConnectionPool({ connect: fakeConnect, maxConnections: 1 });
  pool.subscribe("wss://busy/", [{ kinds: [1] }], noopHandlers());

  const promise = warmUpRouting({ pubkey: VIEWER, store, pool, indexers: ["wss://indexer/"] });

  // ウォームアップが走れないとルーティングが永久に成立しない
  expect(connections.has("wss://indexer/")).toBe(true);
  void promise;
});

it("releases the indexer connections when warm-up finishes", async () => {
  const pool = new ConnectionPool({ connect: fakeConnect });
  const promise = warmUpRouting({ pubkey: VIEWER, store, pool, indexers: ["wss://indexer/"] });
  settleIndexers();
  await promise;

  expect(pool.size).toBe(0);
});
```

既存の「1 本のインデクサが投げても残りで続行する」「EOSE の後に CLOSED が来ても二重に数えない」テストは**そのまま残すこと**。いずれも実在した欠陥の回帰テストである。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run src/core/read/bootstrap.test.ts`
Expected: FAIL

- [ ] **Step 3: プールに予約経路を足す**

上の `options?: { reserved?: boolean }` を実装する。予算チェックの行だけが変わる。

- [ ] **Step 4: `bootstrap.ts` を書き換える**

`WarmUpOptions.connect` を `pool: ConnectionPool` にする。`collect` は `RelayConnection[]` ではなく `RelayUrl[]` を受け取り、`pool.subscribe(url, filters, handlers, { reserved: true })` を呼ぶ。片付いた URL の購読はその場で閉じる。`finally` の `connection.close()` は「全 `PooledSubscription` を `close()` する」に変わる（プールが最後の購読で接続を閉じる）。

**既存の慎重な扱いを壊さないこと:**
- 1 接続につき「片付いた」判定は 1 回だけ（EOSE の後に CLOSED が来るリレーが実在する）
- 片付いた接続はその場で購読を閉じる（速いリレーが遅いリレーを待たない）
- `subscribe` が同期的に `onClosed` を呼ぶ場合の取りこぼし対策（110 行目の `if (done) subscription.close()`）
- 1 本のインデクサが投げても残りで続行する

- [ ] **Step 5: デバッグルートを追従させる**

`src/routes/debug/v1-section.tsx` で `warmUpRouting` に `connect: connectRelay` ではなくマネージャのプールを渡す。マネージャがプールを公開していなければ、デバッグルートでプールを先に作ってマネージャへ渡す形にする。

- [ ] **Step 6: テストが通ることを確認する**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm e2e e2e/v1-section.spec.ts`
Expected: PASS（e2e 4/4 — ここで既存の Outbox e2e が壊れていないことを必ず確認する）

- [ ] **Step 7: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "refactor(read): route bootstrap indexers through the connection pool"
```

---

### Task 12: デバッグルートと接続予算の E2E

**なぜ:** ADR-0011 は「測定できない予算は要件ではなく願望である」と書いているが、現時点で E2E が測っている予算はゼロである。7 指標のうち 1 つ目をここで埋める。

**Files:**
- Modify: `src/routes/debug/v1-section.tsx`
- Create: `e2e/fixtures/seed-budget.ts`
- Create: `e2e/connection-budget.spec.ts`
- Modify: `e2e/global-setup.ts`

**Interfaces:**
- デバッグルートは `?budget=<n>` を読んで `ConnectionPool` の `maxConnections` へ渡す。既定は `MAX_CONNECTIONS`。
- 新しい `data-testid`: `connections`（`manager.connectionCount`、1 秒間隔のポーリングで更新して構わない）、`uncovered`（`status().incomplete?.uncoveredAuthors ?? 0`）

**測るのは接続数であって計画のリレー数ではない。** ADR-0011 が予算しているのは同時 WebSocket 接続数であり、`manager.connectionCount`（= `pool.size`）がまさにその値である。`createSection` に計画を露出させる必要はない。

**E2E の設計:** 既定の 30 のまま架空リレーを 100 本用意すると、ブラウザが失敗する WebSocket を 28 本開くことになり、遅く騒がしいだけで証明の強さは変わらない。**予算を注入して小さい値（4）で測る。** 予算値そのものが 30 であることはユニットテストで主張する。

**フィクスチャ:** 閲覧者が **9 人**をフォローする。

| 著者 | 宣言する write リレー |
|---|---|
| A・B・C | ローカルリレー1（`ws://127.0.0.1:8080/`） |
| D・E | ローカルリレー2（`ws://127.0.0.1:8081/`） |
| F・G・H・I | **それぞれ別の**架空リレー（`ws://127.0.0.1:9001/` 〜 `9004/`） |

投稿はリレー1 に A の 1 件（`budgetNoteOneText`）、リレー2 に D の 1 件（`budgetNoteTwoText`）。

**この組み合わせだと必ず誰かが落ちる。** デバッグルートの `fallbackRelays` はリレー1 なので `pinned` = {リレー1}。予算 4 のうち残り 3 枠を貪欲が選ぶ。冗長度 2 でも各著者の宣言は 1 本なので必要本数は `min(2,1)=1`。A・B・C は pinned のリレー1 で充足。残る候補はリレー2（gain 2）と架空 4 本（gain 1 ずつ）なので、リレー2 → 架空 2 本の順に埋まり、**架空 2 本ぶんの著者 2 人が `uncovered` になる**。実在の 2 本は両方選ばれるので投稿も両方出る。

- [ ] **Step 1: フィクスチャを書く**

`e2e/fixtures/seed-budget.ts` を新規作成。`e2e/fixtures/seed-outbox.ts` の作りに倣う（固定鍵・固定 `created_at` で冪等にすること）。閲覧者の pubkey は `seed-outbox.ts` と**別**にして、既存の e2e と干渉させない。エクスポートするもの: `budgetViewerPubkey`、`budgetNoteOneText`、`budgetNoteTwoText`、`seedBudgetFixture()`。

- [ ] **Step 2: 失敗する E2E を書く**

`e2e/connection-budget.spec.ts` を新規作成:

```ts
const debugUrl = `/debug/v1-section?budget=4&pubkey=${budgetViewerPubkey}`;

const numberIn = async (page: Page, testId: string) =>
  Number((await page.getByTestId(testId).textContent())?.replace(/\D/g, ""));

test("never opens more connections than the budget allows", async ({
  page,
}) => {
  await page.goto(debugUrl);
  await expect(page.getByTestId("warmup")).toContainText("followees: 9", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 30_000,
  });

  // ADR-0011 が予算しているのは同時 WebSocket 接続数そのもの
  expect(await numberIn(page, "connections")).toBeLessThanOrEqual(4);
});

test("spends the budget on the relays that cover the most authors", async ({
  page,
}) => {
  await page.goto(debugUrl);

  // 架空リレーは 1 人ずつしかカバーしない。貪欲が効いていれば
  // 実在の 2 本が選ばれ、両方の投稿が出る
  await expect(page.getByTestId("items")).toContainText(budgetNoteOneText, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("items")).toContainText(budgetNoteTwoText);
});

test("reports the authors it dropped instead of hiding them", async ({
  page,
}) => {
  await page.goto(debugUrl);
  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 30_000,
  });

  // 予算 4 に対し候補が 6 本あるので、架空リレー 2 本ぶんの著者が必ず落ちる。
  // 黙って欠落させてはならない (ADR-0011)
  expect(await numberIn(page, "uncovered")).toBe(2);
});
```

**架空リレー（9001〜9004）への接続は当然失敗する。** それは `unreachableRelays` として観測されるだけで、テストの主張には影響しない。ただし `phase: settled` に至るまでに接続失敗のタイムアウトを待つので、待ち時間は他の e2e より長めに取ってある。

- [ ] **Step 3: テストが失敗することを確認する**

Run: `pnpm e2e e2e/connection-budget.spec.ts`
Expected: FAIL — `plan-relays` などの testid が無い

- [ ] **Step 4: `global-setup.ts` にフィクスチャを足す**

`seedBudgetFixture()` を `seedLocalRelay()` / `seedOutboxFixture()` と並べて呼ぶ。

- [ ] **Step 5: デバッグルートを実装する**

`?budget=` を読んで `ConnectionPool` の `maxConnections` に渡す。上の 2 つの `data-testid` を足す。

`connectionCount` はシグナルではないので、そのまま JSX に置いても更新されない。**1 秒間隔の `setInterval` でシグナルへ写す**（`onCleanup` で必ず解除すること）。デバッグルート専用の割り切りであり、読み取り層には持ち込まない。

- [ ] **Step 6: テストが通ることを確認する**

Run: `pnpm e2e e2e/connection-budget.spec.ts && pnpm e2e e2e/v1-section.spec.ts`
Expected: 両方 PASS

- [ ] **Step 7: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "test(e2e): measure the connection budget against two local relays"
```

---

### Task 13: リレー停止からの復帰を E2E で確かめる

**なぜ:** バックオフのユニットテストは偽タイマーで測っている。**実際のソケットが死んで実際に復帰することは、ここでしか確かめられない。**

**Files:**
- Create: `e2e/relay-recovery.spec.ts`

**注意:** このテストは `docker compose stop/start` を叩くので、実行時間が他のテストより一桁長い。**専用の spec ファイルに分けること。** コンテナ操作が失敗したときは「復帰しなかった」ではなく「操作が失敗した」と分かる形で落とすこと。

- [ ] **Step 1: 失敗する E2E を書く**

```ts
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { outboxNoteBText, outboxViewerPubkey } from "./fixtures/seed-outbox";

const compose = (...args: string[]) => {
  try {
    execFileSync("docker", ["compose", ...args], { stdio: "pipe" });
  } catch (error) {
    // 「復帰しなかった」ではなく「操作が失敗した」と分かるように落とす
    throw new Error(
      `docker compose ${args.join(" ")} failed: ${(error as Error).message}`,
    );
  }
};

test("recovers a relay that went away and came back", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto(`/debug/v1-section?pubkey=${outboxViewerPubkey}`);
  await expect(page.getByTestId("items")).toContainText(outboxNoteBText, {
    timeout: 15_000,
  });

  compose("stop", "nostr-rs-relay-2");
  await expect(page.getByTestId("unreachable")).not.toHaveText(
    "unreachableRelays: 0",
    { timeout: 30_000 },
  );

  compose("start", "nostr-rs-relay-2");
  // 初回 1 秒からの指数バックオフ + ジッタ。上限 60 秒
  await expect(page.getByTestId("unreachable")).toHaveText(
    "unreachableRelays: 0",
    { timeout: 120_000 },
  );
  await expect(page.getByTestId("items")).toContainText(outboxNoteBText);
});

test.afterAll(() => {
  // 途中で落ちてもリレー2 を止めたままにしない
  compose("start", "nostr-rs-relay-2");
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Task 9 の実装が入っていれば通るはずなので、**まず「再接続を無効化したら落ちること」を手で確かめる。** `RECONNECT_MAX_MS` を巨大な値にして走らせ、復帰しないことを見てから戻す。**この確認をせずに「通った」と報告しないこと** — 何も証明していないテストになりうる。

- [ ] **Step 3: テストが通ることを確認する**

Run: `pnpm e2e e2e/relay-recovery.spec.ts`
Expected: PASS

- [ ] **Step 4: 全体を通す**

Run: `pnpm exec vitest run && pnpm e2e e2e/v1-section.spec.ts e2e/connection-budget.spec.ts e2e/relay-recovery.spec.ts && pnpm typecheck && pnpm check`
Expected: すべて PASS（`e2e/console-warning.spec.ts` の失敗は範囲外）

- [ ] **Step 5: ドキュメントを更新する**

- `docs/design/architecture.md` の 8 節「接続プールが担当する 4 つ」の表を削除し、実装済みとして本文へ統合する。6 節の `incomplete` の説明に `uncoveredAuthors` を足す。3 節の seam 表に `onClose` を反映する
- `docs/design/read-layer-followups.md` の「生きているセクションを張り直す手段が存在しない」「`RelayConnection` に接続単位のライフサイクル通知がない」「接続数はフォロー人数に比例して無制限に増える」を**解消済みへ移す**
- `docs/design/verifying-v1-section.md` に、予算と復帰の確認手順を足す

- [ ] **Step 6: コミット**

```bash
pnpm fix && pnpm typecheck && pnpm exec vitest run
git add -A
git commit -m "test(e2e): verify a relay recovers after going away"
```
