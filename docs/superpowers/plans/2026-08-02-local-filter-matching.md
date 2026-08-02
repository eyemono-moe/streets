# ローカルフィルタ照合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リレーが配信したイベントを、そのリレーへ実際に送った REQ のフィルタと突き合わせ、一致しないものをストアにも UI にも入れない。

**Architecture:** 依存ゼロの純粋関数 `matchesFilter` / `matchesAnyFilter` を `src/core/read/filter-match.ts` に置き、`SubscriptionManager.#handlersFor` の `onEvent` 先頭と `bootstrap.ts` の `collect` の `onEvent` 先頭で門にする。捨てた件数はリレーごとに単調増加のカウンタへ記録し、アクセサで露出する。照合が入ると原理的に発火しなくなる `kind:10002` 再プランの引き金を削除する。

**Tech Stack:** TypeScript (strict), SolidJS, Vitest, Playwright, Biome, pnpm

**仕様:** [docs/superpowers/specs/2026-08-02-local-filter-matching-design.md](../specs/2026-08-02-local-filter-matching-design.md) — **着手前に全文を読むこと。** 特に 2 節（「REQ より厳しくなってはならない」原則）と 6 節（削除の裁定）は、以下の各タスクの判断根拠である。

## Global Constraints

- **照合器は REQ より厳しくなってはならない。** 判断に迷う条件はすべて緩い側へ倒す。厳しすぎる誤りは「頼んだのに黙って捨てる」= ADR-0011 が禁じる隠れた劣化。緩すぎる誤りは今日と同じ状態に戻るだけ。**この 2 つは対称ではない。**
- **`matchesFilter` は全域関数である。** いかなる入力に対しても真偽値を返し、例外を投げない。`onEvent` はソケットのメッセージ処理から呼ばれるため、投げると他セクションへの配信を巻き込む。
- **`event` の静的型はこの地点では嘘である。** `websocket-relay-connection.ts:152-160` は `typeof subId !== "string"` と `typeof event !== "object"` だけを確認して `onEvent(event as NostrEvent)` とキャストしている。構造検証 (`isNostrEvent`) が走るのは `EventStore.put` の内部であり、照合器はその**手前**に立つ。`event.tags` の欠落、`event.created_at` が文字列、`event.pubkey` が数値、はいずれも実際に到達しうる。
- **`limit` と `search` は照合条件ではない。** NIP-01「limit is only valid for the initial query and MUST be ignored afterwards」。`search` は NIP-50 でローカル判定不能。どちらも**読まない**ことで実装する。
- **前方一致は存在しない。** NIP-01「The ids, authors, #e and #p filter lists MUST contain exact 64-character lowercase hex values」。大文字小文字を区別した厳密比較。
- コメントは日本語。既存ファイルのコメント密度と語り口に合わせる。
- 各タスクの最後に `pnpm exec vitest run`・`pnpm typecheck`・`pnpm check` を通してからコミットする。
- **`pnpm exec playwright test` を走らせるときは `--grep-invert "repost parser warning flood"` を付ける。** `e2e/console-warning.spec.ts` は旧実装 (`/`) を対象とした既存の失敗であり、このスライスとは無関係（clean tree でも落ちる）。

---

### Task 1: `filter-match.ts` — NIP-01 のフィルタ意味論

**Files:**
- Create: `src/core/read/filter-match.ts`
- Create: `src/core/read/filter-match.test.ts`

**Interfaces:**
- Consumes: `NostrEvent` (`src/core/nostr/event.ts`)、`RelayFilter` (`src/core/relay/relay-connection.ts`)
- Produces:
  ```ts
  export const matchesFilter: (event: NostrEvent, filter: RelayFilter) => boolean;
  export const matchesAnyFilter: (event: NostrEvent, filters: readonly RelayFilter[]) => boolean;
  ```

- [ ] **Step 1: 検証器そのものを先に確認する**

前スライスでは `pnpm typecheck` が **0 ファイル**を検査していた（`tsc --noEmit` をルートのソリューション構成に対して実行していたため）。すべての「typecheck 通過」報告が無意味だった。同じことを繰り返さないため、実装前に確認する。

```bash
pnpm typecheck                                   # tsc -b、exit 0 を確認
pnpm exec tsc -p tsconfig.app.json --noEmit --listFiles | grep -c 'src/core/read'
```

Expected: 2 行目が **0 より大きい**こと。0 なら以降の型検査はすべて無意味なので、**先に報告して止まること。**

- [ ] **Step 2: 失敗するテストを書く**

`src/core/read/filter-match.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";
import { matchesAnyFilter, matchesFilter } from "./filter-match";

const A = "a".repeat(64);
const B = "b".repeat(64);
const ID = "1".repeat(64);

const base: NostrEvent = {
  id: ID,
  pubkey: A,
  created_at: 1000,
  kind: 1,
  tags: [],
  content: "",
  sig: "0".repeat(128),
};
const ev = (o: Partial<NostrEvent> = {}): NostrEvent => ({ ...base, ...o });

// 期待値は手で導出したものではなく、意図した実装を実際に走らせて得た出力である
// (計画作成時に scratchpad で計算済み)。各行の「捕まえる変異」は、その主張が
// 何を守っているかを明示するためのもの — 変異を入れたらその行だけが落ちること。
describe("matchesFilter", () => {
  it.each<[string, NostrEvent, RelayFilter, boolean, string]>([
    ["limit だけのフィルタは全一致", ev(), { limit: 50 }, true, "limit を件数条件として扱う変異"],
    ["空フィルタは全一致", ev(), {}, true, "条件ゼロを不一致に倒す変異"],
    ["authors 一致", ev(), { authors: [A] }, true, "authors を無視する変異"],
    ["authors 不一致", ev(), { authors: [B] }, false, "authors を無視する変異"],
    ["authors: [] は何にも一致しない", ev(), { authors: [] }, false, "空配列を『条件なし』として扱う変異"],
    ["大文字 hex は一致しない", ev({ pubkey: A.toUpperCase() }), { authors: [A] }, false, "toLowerCase() を挟んで緩める変異"],
    ["since は境界を含む", ev({ created_at: 1000 }), { since: 1000 }, true, ">= を > にする off-by-one"],
    ["since の 1 つ下は不一致", ev({ created_at: 999 }), { since: 1000 }, false, ">= を <= に取り違える変異"],
    ["until は境界を含む", ev({ created_at: 1000 }), { until: 1000 }, true, "<= を < にする off-by-one"],
    ["until の 1 つ上は不一致", ev({ created_at: 1001 }), { until: 1000 }, false, "until を無視する変異"],
    ["フィルタ内は AND", ev(), { kinds: [1], authors: [B] }, false, "AND を OR にする変異"],
    ["タグは tags[i][1] を見る", ev({ tags: [["e", ID]] }), { "#e": [ID] }, true, "添字の取り違え"],
    ["タグ名は tags[i][0]", ev({ tags: [[ID, "e"]] }), { "#e": [ID] }, false, "tags[i][1] でタグ名を引く変異"],
    ["複数タグのうち 1 つ一致で足りる", ev({ tags: [["p", B], ["e", ID]] }), { "#e": [ID] }, true, "全タグ一致を要求する変異"],
    ["search は照合に使わない", ev(), { search: "zzz", authors: [A] }, true, "search を不一致に倒す変異"],
    ["未知のキーは無視する", ev(), { unknownKey: "zzz", authors: [A] } as RelayFilter, true, "未知キーで捨てる変異"],
    ["複数文字タグも扱う", ev({ tags: [["foo", "v"]] }), { "#foo": ["v"] }, true, "単一文字タグ以外を無視する変異"],
    ["複数文字タグの不一致", ev({ tags: [["bar", "v"]] }), { "#foo": ["v"] }, false, "タグ名を比較しない変異"],
  ])("%s", (_name, event, filter, expected) => {
    expect(matchesFilter(event, filter)).toBe(expected);
  });
});

describe("matchesAnyFilter", () => {
  it("フィルタ間は OR", () => {
    expect(matchesAnyFilter(ev(), [{ authors: [B] }, { authors: [A] }])).toBe(true);
  });

  it("どれにも一致しなければ false", () => {
    expect(matchesAnyFilter(ev(), [{ authors: [B] }, { kinds: [7] }])).toBe(false);
  });

  it("空のフィルタ列は何にも一致しない", () => {
    // REQ を送っていない = 何も要求していない。OR の単位元は偽。
    expect(matchesAnyFilter(ev(), [])).toBe(false);
  });
});

describe("matchesFilter は全域関数である", () => {
  // 照合器は EventStore.put の *手前* に立つので、isNostrEvent を通っていない
  // 生のワイヤデータを受け取る (websocket-relay-connection.ts:152-160)。
  // ここで投げると、そのリレーを見ている他セクションへの配信ごと巻き込む。
  it.each<[string, unknown, RelayFilter]>([
    ["tags が欠落", { id: ID, pubkey: A, created_at: 1, kind: 1 }, { "#e": [ID] }],
    ["tags が非配列", { ...base, tags: "nope" }, { "#e": [ID] }],
    ["タグ要素が非配列", { ...base, tags: ["nope"] }, { "#e": [ID] }],
    ["created_at が文字列", { ...base, created_at: "1000" }, { since: 1 }],
    ["pubkey が数値", { ...base, pubkey: 123 }, { authors: [A] }],
    ["event が null", null, { authors: [A] }],
    ["filter 値が非配列", base, { authors: "not-an-array" } as unknown as RelayFilter],
    ["filter のタグ値が非配列", { ...base, tags: [["e", ID]] }, { "#e": ID } as unknown as RelayFilter],
  ])("投げない: %s", (_name, event, filter) => {
    expect(() => matchesFilter(event as NostrEvent, filter)).not.toThrow();
    expect(typeof matchesFilter(event as NostrEvent, filter)).toBe("boolean");
  });
});
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/filter-match.test.ts`
Expected: FAIL — `Failed to resolve import "./filter-match"`

- [ ] **Step 4: 実装する**

`src/core/read/filter-match.ts`:

```ts
import type { NostrEvent } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";

/**
 * NIP-01 のフィルタ意味論をローカルで再実装したもの。
 *
 * **この関数は未検証のワイヤデータに対して呼ばれる。** `websocket-relay-connection.ts`
 * は `typeof event === "object"` だけを確認して `NostrEvent` にキャストしており、
 * 構造検証 (`isNostrEvent`) が走るのは `EventStore.put` の内部 —— つまりこの
 * 関数より後ろである。引数の静的型を信用してはならない。
 *
 * **原則: REQ より厳しくなってはならない。** 判断に迷う条件は緩い側へ倒す。
 * 厳しすぎれば「頼んだのに黙って捨てる」(ADR-0011 が禁じる隠れた劣化) になり、
 * 緩すぎても今日と同じ状態に戻るだけである。この 2 つは対称ではない。
 */
export const matchesFilter = (
  event: NostrEvent,
  filter: RelayFilter,
): boolean => {
  if (typeof event !== "object" || event === null) return false;

  // `limit` と `search` はここで一切読まない。それがこの 2 つを「照合条件では
  // ない」と扱うことの実装である。NIP-01: "The limit property of a filter is
  // only valid for the initial query and MUST be ignored afterwards."
  // `search` (NIP-50) は全文検索であり、ローカルでは判定できない —— 判定でき
  // ないものを不一致に倒すと、正当なイベントを誤って捨てる。

  if (filter.ids !== undefined && !includesValue(filter.ids, event.id)) {
    return false;
  }
  if (
    filter.authors !== undefined &&
    !includesValue(filter.authors, event.pubkey)
  ) {
    return false;
  }
  if (filter.kinds !== undefined && !includesValue(filter.kinds, event.kind)) {
    return false;
  }

  // NIP-01: since/until はどちらも境界を含む。
  if (filter.since !== undefined) {
    if (typeof event.created_at !== "number") return false;
    if (event.created_at < filter.since) return false;
  }
  if (filter.until !== undefined) {
    if (typeof event.created_at !== "number") return false;
    if (event.created_at > filter.until) return false;
  }

  for (const key of Object.keys(filter)) {
    if (!key.startsWith("#")) continue;
    // RelayFilter の索引シグネチャは `#${string}` なので、任意の string での
    // 添字アクセスは型が付かない。ここだけ Record として読む。
    const values = (filter as Record<string, unknown>)[key];
    if (values === undefined) continue;
    if (!Array.isArray(values)) return false;
    if (!hasTag(event.tags, key.slice(1), values)) return false;
  }

  return true;
};

/** NIP-01 の複数フィルタは OR。空配列は偽 (`some` の定義からそうなる)。 */
export const matchesAnyFilter = (
  event: NostrEvent,
  filters: readonly RelayFilter[],
): boolean =>
  Array.isArray(filters) && filters.some((f) => matchesFilter(event, f));

const includesValue = (list: unknown, value: unknown): boolean =>
  Array.isArray(list) && list.includes(value);

/**
 * NIP-01: "the event and filter condition values must have at least one item
 * in common"、かつ "Only the first value in any given tag is indexed" ——
 * タグ名は `tag[0]`、索引される値は `tag[1]` である。
 */
const hasTag = (
  tags: unknown,
  name: string,
  values: readonly unknown[],
): boolean => {
  if (!Array.isArray(tags)) return false;
  return tags.some(
    (tag) => Array.isArray(tag) && tag[0] === name && values.includes(tag[1]),
  );
};
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/read/filter-match.test.ts`
Expected: PASS（`matchesFilter` 18 件 + `matchesAnyFilter` 3 件 + 全域性 8 件）

- [ ] **Step 6: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/read/filter-match.ts src/core/read/filter-match.test.ts
git commit -m "feat(read): implement NIP-01 filter matching as a total function"
```

---

### Task 2: `SubscriptionManager` を照合器に通し、死んだ引き金を削除する

**Files:**
- Modify: `src/core/read/subscription-manager.ts`（`#handlersFor` の署名と `onEvent`、カウンタ、アクセサ、`kind:10002` 引き金の削除）
- Modify: `src/core/read/subscription-manager.test.ts`（追加と、旧テストの削除）

**Interfaces:**
- Consumes: `matchesAnyFilter(event, filters)`（Task 1）
- Produces:
  ```ts
  // SubscriptionManager の新しい公開アクセサ
  get unrequestedEventsByRelay(): ReadonlyMap<RelayUrl, number>;
  ```
  公開 `replan()` は**そのまま残る**。削除されるのは `kind:10002` の到着でそれを自動的に呼ぶ経路だけ。

**照合器の配線と引き金の削除が 1 タスクである理由:** この 2 つは因果的に繋がっている。照合器を入れた瞬間、引き金は原理的に発火しなくなる（セクションのフィルタは `{kinds:[1], authors:[...]}` であり、`kind:10002` は一致しない）。実際 `subscription-manager.test.ts:1604` の既存テストは、照合器を入れただけで落ちる —— **「照合を承認しつつ削除を却下する」というレビューは成立しない**（承認した瞬間にコードが死ぬ）。分割すると、どちらのタスクも単独ではテストを緑にできない。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/subscription-manager.test.ts` の末尾に追加。既存の `setup()` / `signed()` ヘルパ（ファイル冒頭）をそのまま使う。

```ts
describe("ローカルフィルタ照合 (信頼境界)", () => {
  // 要求していないイベントを押し込むリレーを作る。明示リレー経路を使うのは、
  // ルーティングを介さずに「このリレーへこのフィルタを送った」を固定できるため。
  const setupExplicit = () => {
    const { relays, store, manager, delivery } = setup();
    const d = delivery();
    const handle = manager.subscribe(
      [{ kinds: [1], authors: [signed(1).pubkey] }],
      ["wss://liar/"],
      d,
    );
    const relay = relays.get("wss://liar/");
    if (!relay) throw new Error("relay was not opened");
    return { relay, store, manager, delivery: d, handle };
  };

  it("要求していないイベントはストアにも配信にも到達しない", () => {
    const { relay, store, manager, delivery } = setupExplicit();
    // 著者が違う (seed 2)。署名は本物なので schnorr では落ちない。
    const intruder = signed(2);

    relay.emitEvent(0, intruder);

    expect(store.get(intruder.id)).toBeUndefined();
    expect(delivery.onEvent).not.toHaveBeenCalled();
    expect(manager.unrequestedEventsByRelay.get("wss://liar/")).toBe(1);
  });

  it("要求したイベントは通り、カウンタは増えない", () => {
    const { relay, store, manager, delivery } = setupExplicit();
    const wanted = signed(1);

    relay.emitEvent(0, wanted);

    expect(store.get(wanted.id)).toBeDefined();
    expect(delivery.onEvent).toHaveBeenCalledWith(wanted.id, "wss://liar/");
    expect(manager.unrequestedEventsByRelay.get("wss://liar/")).toBeUndefined();
  });

  it("カウンタはリレーごとに分かれる", () => {
    const { relays, manager, delivery } = setup();
    manager.subscribe(
      [{ kinds: [1], authors: [signed(1).pubkey] }],
      ["wss://a/", "wss://b/"],
      delivery(),
    );
    const a = relays.get("wss://a/");
    const b = relays.get("wss://b/");
    if (!a || !b) throw new Error("relays were not opened");

    a.emitEvent(0, signed(2));
    a.emitEvent(0, signed(3));
    b.emitEvent(0, signed(4));

    expect(manager.unrequestedEventsByRelay.get("wss://a/")).toBe(2);
    expect(manager.unrequestedEventsByRelay.get("wss://b/")).toBe(1);
  });

  it("カウンタは単調増加で、外から書き換えられない", () => {
    const { relay, manager } = setupExplicit();
    relay.emitEvent(0, signed(2));

    const snapshot = manager.unrequestedEventsByRelay;
    (snapshot as Map<RelayUrl, number>).set("wss://liar/", 999);

    // アクセサはコピーを返すので、内部状態は汚染されない。
    expect(manager.unrequestedEventsByRelay.get("wss://liar/")).toBe(1);
  });

  it("同じリレー上の各購読が、それぞれ自分のフィルタで判定される", () => {
    // クロージャ捕捉が効いていることの主張。同じ接続の上に 2 セクション分の
    // REQ が並ぶ状況で、片方だけが要求している著者のイベントを *もう片方の*
    // 購読へ流す。`entry.opened` を実行時に引く実装や、フィルタを 1 つに
    // 混ぜてしまう実装だと、これが通ってしまう。
    //
    // 1 本目を close() してから 2 本目を張る形にしてはならない ——
    // エントリが 0 になるとプールが接続を落とし、再購読で `connect()` が
    // 二度呼ばれて setup() のガード (`connect called twice`) に当たる。
    const { relays, store, manager, delivery } = setup();
    const authorOne = signed(1).pubkey;
    const authorTwo = signed(2).pubkey;
    const dOne = delivery();
    const dTwo = delivery();

    manager.subscribe([{ kinds: [1], authors: [authorOne] }], ["wss://x/"], dOne);
    manager.subscribe([{ kinds: [1], authors: [authorTwo] }], ["wss://x/"], dTwo);

    const relay = relays.get("wss://x/");
    if (!relay) throw new Error("relay was not opened");
    expect(relay.subscriptions).toHaveLength(2);

    // 著者 1 のイベントを、著者 2 だけを要求している購読 (index 1) へ流す。
    const wantedByTheOtherSection = signed(1);
    relay.emitEvent(1, wantedByTheOtherSection);

    expect(dTwo.onEvent).not.toHaveBeenCalled();
    expect(store.get(wantedByTheOtherSection.id)).toBeUndefined();
    expect(manager.unrequestedEventsByRelay.get("wss://x/")).toBe(1);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/subscription-manager.test.ts -t "信頼境界"`
Expected: FAIL — `manager.unrequestedEventsByRelay` が存在せず、押し込んだイベントがストアに入ってしまう

- [ ] **Step 3: `#handlersFor` にフィルタを渡すよう変更する**

`src/core/read/subscription-manager.ts`。まず import を足す:

```ts
import { matchesAnyFilter } from "./filter-match";
```

`#handlersFor` の署名を変える（`:771` 付近）:

```ts
  /**
   * `filters` は「このリレーへ実際に送った REQ の中身」である。`entry.opened`
   * を実行時に引かずクロージャで捕捉するのは、不変式をハンドラ生成時点で
   * 閉じるため —— `#applyEntryDiff` が REQ を差し替えるときは必ず新しい
   * ハンドラが作られるので、古い REQ に対応するハンドラが新しいフィルタで
   * 判定する余地が構造的に消える。
   */
  #handlersFor(
    entry: SectionEntry,
    url: RelayUrl,
    filters: RelayFilter[],
  ): RelaySubscriptionHandlers {
```

- [ ] **Step 4: `onEvent` の先頭に門を置く**

`#handlersFor` の `onEvent`（`:773` 付近）を次のように変える:

```ts
      onEvent: (event) => {
        if (entry.closed) return;
        // 信頼境界 (ADR-0023)。署名検証は *偽造* を止めるが *混入* は止めない。
        // ここが `store.put` より前にあるのは意図的で、要求していないイベントの
        // 洪水を浴びても払うのは文字列比較であって schnorr 検証ではない。
        if (!matchesAnyFilter(event, filters)) {
          this.#recordUnrequested(url);
          return;
        }
        const result = this.#options.store.put(event, url);
        ...
```

- [ ] **Step 5: カウンタとアクセサを足す**

フィールド（`#entries` の近く）:

```ts
  /**
   * 要求していないのに送られてきたイベントの、リレーごとの件数
   * (仕様 5.1)。**単調増加でリセットしない** —— 押し込んだ後に静かになった
   * リレーが潔白に見えてはいけない。`ConnectionPool.peakSize` と同じ理屈。
   */
  readonly #unrequested = new Map<RelayUrl, number>();
```

アクセサ（`retryNow()` の近く）:

```ts
  /**
   * リレーごとに分けるのは、合計値だけでは行動に移せないため —— 「どこかが
   * 嘘をついている」は情報だが「どのリレーが」は判断材料になる。合計は
   * 呼び出し側で足すこと。
   *
   * 内部の Map をそのまま返さずコピーを返す (`SectionReader.items` と同じ規約)。
   */
  get unrequestedEventsByRelay(): ReadonlyMap<RelayUrl, number> {
    return new Map(this.#unrequested);
  }

  #recordUnrequested(url: RelayUrl): void {
    this.#unrequested.set(url, (this.#unrequested.get(url) ?? 0) + 1);
  }
```

- [ ] **Step 6: 呼び出し側 2 箇所を直す**

`#applyEntryDiff` の中の 2 箇所（張り直し経路 `:707` 付近、新規経路 `:739` 付近）。どちらも既に `relayFilters` を持っている:

```ts
          this.#handlersFor(entry, url, relayFilters),
```

- [ ] **Step 7: この時点で既存テストが 1 件落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/subscription-manager.test.ts`

Expected: **FAIL 1 件** —— `schedules a re-plan for a followed author's kind:10002 but not for an unfollowed author's`（`:1604`）。

**これは予定された破壊であり、バグではない。** そのテストはセクションのフィルタ `{ kinds: [1], authors }`（`:273` の `createManagerWithSection`）へ `kind:10002` を流して再プランが起きることを主張している。照合器を入れた以上、`kind:10002` は `kinds:[1]` に一致せず落ちるので、この主張は**成立しなくなったのではなく、意味を失った**。Step 8-9 で引き金ごと削除する。

**これ以外のテストが落ちた場合は、照合器の配線に穴があるということなので、削除へ進まずに報告して止まること。**

- [ ] **Step 8: 削除を守るテストを書く**

`src/core/read/subscription-manager.test.ts` の「信頼境界」describe に追加:

```ts
  it("フォロー中の著者の kind:10002 を push されても計画は変わらない", () => {
    // 削除した引き金 (仕様 6 節) が復活していないことの主張。
    //
    // 「デバウンスタイマーが積まれないこと」を主張してはならない ——
    // ConnectionPool は同じ scheduler を再接続に使う (subscription-manager.ts
    // の `scheduler: options.scheduler` 受け渡し) ので、タイマー本数の主張は
    // プール側の挙動と混線し、何を測っているか分からなくなる。計画そのものが
    // 変わらないことを直接主張する。
    const { relays, manager, delivery } = setup();
    const d = delivery();
    const author = signed(1).pubkey;
    manager.subscribe([{ kinds: [1], authors: [author] }], ["wss://x/"], d);
    const relay = relays.get("wss://x/");
    if (!relay) throw new Error("relay was not opened");

    d.onPlanChanged.mockClear();

    // その著者本人の、まだ誰も知らない kind:10002。かつては再プランの引き金だった。
    relay.emitEvent(
      0,
      signed(1, {
        kind: 10002,
        created_at: 1_800_000_000,
        tags: [["r", "wss://newly-declared/", "write"]],
      }),
    );

    expect(d.onPlanChanged).not.toHaveBeenCalled();
    expect(manager.unrequestedEventsByRelay.get("wss://x/")).toBe(1);
  });
```

- [ ] **Step 9: 新しいテストが既に通ることを確認する**

Run: `pnpm exec vitest run src/core/read/subscription-manager.test.ts -t "push されても計画は変わらない"`

Expected: **PASS**（Step 3-6 の照合器が既に `kind:10002` を落としているため）。ここが FAIL なら配線に穴があるので、**削除を進める前に報告して止まること。**

- [ ] **Step 10: 引き金と、それにぶら下がっていた機構を削除する**

**なぜ削除するのか（仕様 6 節）:** この引き金に今日届きうる送信元は「リレーが要求されていないイベントを push してくる場合」だけである。コード自身のコメント（`:823-827`）がそう認めている。ウォームアップの `kind:10002` は `bootstrap.ts` 自身のハンドラを通り（`:139`）、`#handlersFor` を通らない。**Step 3-6 を入れた時点で、この引き金は原理的に発火しない。** 残すと動かないコードが残るだけになる。

`src/core/read/subscription-manager.ts` から次を削除する。**削除前に `rg` でそれぞれの呼び出し元が本当に 1 つだけであることを確認すること**（計画作成時点では確認済みだが、Step 3-6 で行番号がずれている）:

```bash
rg -n '#scheduleReplan|#isDemandedAuthor|#replanTimer' src/core/read/subscription-manager.ts
```

| 削除対象 | 位置の目印 |
|---|---|
| `onEvent` 内の `if (result === "inserted" && event.kind === 10002 && ...) { this.#scheduleReplan(); }` ブロックと、その上の約 40 行のコメント | `#handlersFor` の中 |
| `#scheduleReplan()` メソッド | `#normalizeExplicit` の手前あたり |
| `#replanTimer` フィールド | `#replanning` / `#dirty` の近く |
| `dispose()` 内の `if (this.#replanTimer !== null) { ... }` ブロック | `dispose()` |
| `#isDemandedAuthor()` メソッドと JSDoc | ファイル末尾付近 |

**残すもの:**
- 公開 `replan()` —— 水和や再ウォームアップが呼ぶ明示的な入口。
- `#scheduler` フィールドと `scheduler` オプション —— `ConnectionPool` へ渡している（`scheduler: options.scheduler`）。**これを消してはならない。**

- [ ] **Step 11: 旧テストを削除する**

Step 7 で落ちた `:1604` を含め、`kind:10002` の到着で再プランが起きることを主張していたテストを削除する。`subscription-manager.test.ts` から次で探す:

```bash
rg -n 'schedules a re-plan|再プラン|advanceTimersByTime' src/core/read/subscription-manager.test.ts
```

削除の判断基準: **そのテストが主張しているのが「`kind:10002` の *到着* が再プランを起こす」ことなら削除する。** 明示的な `manager.replan()` の呼び出しを起点にしているテストは**残す**（`replan()` は残るため）。判断に迷ったものは削除せず報告すること。

デバウンスのために `vi.useFakeTimers()` を使っていたヘルパが、削除後に誰からも使われなくなる可能性がある。使われなくなったヘルパも削除する（Biome が未使用変数として検出する）。

- [ ] **Step 12: 全体が緑になることを確認する**

Run: `pnpm exec vitest run`
Expected: PASS。Step 7 で落ちていた `:1604` は Step 11 で削除されて解消しているはず。

- [ ] **Step 13: 検査を通してコミットする**

`git add` は 1 回だが、**コミットは 2 つに分ける** —— 照合器の追加と、それによって死んだコードの削除は別の変更である。レビューと `git log` の両方で追える形にする。

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check

git add src/core/read/filter-match.ts 2>/dev/null; true   # Task 1 で既に commit 済みなら何も起きない
git add -p src/core/read/subscription-manager.ts src/core/read/subscription-manager.test.ts
# ↑ 照合器の配線 (import / #handlersFor / onEvent の門 / カウンタ / 呼び出し側) だけを stage する
git commit -m "feat(read): match delivered events against the REQ we actually sent"

git add src/core/read/subscription-manager.ts src/core/read/subscription-manager.test.ts
git commit -m "refactor(read): delete the kind:10002 re-plan trigger made unreachable by matching"
```

`git add -p` での切り分けが難しければ、**1 コミットにまとめてよい**（メッセージ本文で両方を説明すること）。分割はレビューのための便宜であって、要件ではない。

---

### Task 3: `bootstrap.ts` を同じ境界に通す

**Files:**
- Modify: `src/core/read/bootstrap.ts`
- Modify: `src/core/read/bootstrap.test.ts`

**Interfaces:**
- Consumes: `matchesAnyFilter(event, filters)`（Task 1）
- Produces:
  ```ts
  export type WarmUpResult = {
    followees: string[];
    routed: number;
    unroutable: number;
    /** 要求していないのにインデクサが送ってきたイベントの件数 */
    unrequested: number;
  };
  ```

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/bootstrap.test.ts` に追加。既存のテストが使っているハーネス（ファイル冒頭）に合わせること。

既存ヘルパ `sign(seed, fields)` / `base` / `poolWithFakes(connections)` をそのまま使う（`bootstrap.test.ts` 冒頭で定義済み）。**購読の index はこのファイルの既存規約に従う: アンカーが 0、フェーズ① が 1、フェーズ② が 2**（`poolWithFakes` の JSDoc に明記されている）。

```ts
  it("インデクサが要求していない kind を押し込んでもストアに入らない", async () => {
    // ブートストラップが送るのは {kinds:[3], authors:[pubkey], limit:1} と
    // {kinds:[10002], authors: followees}。kind:1 はどちらにも一致しない。
    //
    // 同時に「limit は照合条件ではない」ことも主張している —— フェーズ① の
    // フィルタは limit:1 を持つが、フォローリスト本体はこの門を通り抜けねば
    // ならない (通らなければ followees が空になり、後段の expect が落ちる)。
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(relays);

    const alice = sign(1, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://alice/", "write"]],
    });
    const viewer = sign(3, {
      ...base,
      kind: 3,
      tags: [["p", alice.pubkey]],
    });
    // 誰も要求していない、しかし署名は本物の kind:1。
    const intruder = sign(9, { ...base, kind: 1, content: "not requested" });

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      pool,
      indexers: ["wss://indexer/"],
    });

    const indexer = () => relays.get("wss://indexer/");
    // アンカー (0) + フェーズ① (1)
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEvent(1, intruder);
    indexer()?.emitEvent(1, viewer);
    indexer()?.emitEose(1);

    // フェーズ② (2)
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(3));
    indexer()?.emitEvent(2, intruder);
    indexer()?.emitEvent(2, alice);
    indexer()?.emitEose(2);

    const result = await pending;

    expect(store.get(intruder.id)).toBeUndefined();
    // 要求したものは両フェーズとも通っている
    expect(result.followees).toEqual([alice.pubkey]);
    expect(result.routed).toBe(1);
    // 両フェーズで 1 件ずつ捨てた
    expect(result.unrequested).toBe(2);
  });
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/bootstrap.test.ts`
Expected: FAIL — 押し込んだ `kind:1` がストアに入ってしまう

- [ ] **Step 3: `collect` に門を置き、件数を返す**

`src/core/read/bootstrap.ts`:

```ts
import { matchesAnyFilter } from "./filter-match";
```

`collect` の戻り値を `Promise<number>`（捨てた件数）に変える:

```ts
const collect = (
  pool: ConnectionPool,
  urls: readonly RelayUrl[],
  filters: RelayFilter[],
  store: EventStore,
  timeoutMs: number,
  open: Map<RelayUrl, PooledSubscription>,
): Promise<number> =>
  new Promise((resolve) => {
    let unrequested = 0;
    let pending = urls.length;
    ...
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const subscription of open.values()) subscription.close();
      open.clear();
      resolve(unrequested);
    };
```

`onEvent` を差し替える。**現在ここにある「ここではフィルタと突き合わせて確認しない」というコメント（`:130-137`）は削除する** —— そのコメントが述べている状態を、まさにこの変更が解消するため:

```ts
          // 信頼境界 (ADR-0023)。インデクサが要求と無関係な kind/著者を
          // 寄越しても、ここで落とす。ルーティング表の元データが入る経路
          // なので、混入を許すと ADR-0016 の導出そのものが汚れる。
          onEvent: (event: NostrEvent) => {
            if (!matchesAnyFilter(event, filters)) {
              unrequested += 1;
              return;
            }
            store.put(event, url);
          },
```

- [ ] **Step 4: `WarmUpResult` に件数を足す**

型:

```ts
export type WarmUpResult = {
  /** フォローリストに載っていた pubkey */
  followees: string[];
  /** kind:10002 が引けた人数 */
  routed: number;
  /** 引けなかった人数 */
  unroutable: number;
  /**
   * 要求していないのにインデクサが送ってきて捨てたイベントの件数 (仕様 5.3)。
   * ブートストラップには SubscriptionManager が無いので、ここが唯一の
   * 報告先になる。
   */
  unrequested: number;
};
```

`warmUpRouting` の 2 つの `collect` 呼び出しの戻り値を足し合わせ、**3 つある return すべてに載せる**（フォロー 0 人の早期 return を忘れないこと）:

```ts
    const unrequestedFollows = await collect(
      pool, indexers,
      [{ kinds: [FOLLOW_LIST_KIND], authors: [pubkey], limit: 1 }],
      store, timeoutMs, open,
    );
    ...
    if (followees.length === 0) {
      return { followees, routed: 0, unroutable: 0, unrequested: unrequestedFollows };
    }

    const unrequestedRelayLists = await collect(
      pool, indexers,
      [{ kinds: [RELAY_LIST_KIND], authors: followees }],
      store, timeoutMs, open,
    );
    ...
    return {
      followees,
      routed,
      unroutable: followees.length - routed,
      unrequested: unrequestedFollows + unrequestedRelayLists,
    };
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/read/bootstrap.test.ts`
Expected: PASS。`WarmUpResult` を組み立てている既存テストが型エラーになるので、`unrequested: 0` を足して直す。

- [ ] **Step 6: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/read/bootstrap.ts src/core/read/bootstrap.test.ts
git commit -m "feat(read): apply the trust boundary to bootstrap indexers too"
```

---

### Task 4: デバッグルートへの露出と、実際に嘘をつくリレーの e2e

**Files:**
- Modify: `src/routes/debug/v1-section.tsx`
- Modify: `e2e/fixtures/seed-outbox.ts`
- Create: `e2e/relay-lies.spec.ts`

**Interfaces:**
- Consumes: `manager.unrequestedEventsByRelay`（Task 2）、`warmUpRouting` の `unrequested`（Task 3）
- Produces: `data-testid="unrequested"`（合計）、`data-testid="unrequested-relays"`（内訳の `<ul>`）

- [ ] **Step 1: デバッグルートに表示を足す**

`src/routes/debug/v1-section.tsx`。`connections` / `peakConnections` と**同じ仕組み**に載せる —— `manager.unrequestedEventsByRelay` はシグナルではないので、JSX に直接置いても更新されない。

シグナルを足す（`peakConnections` の隣）:

```tsx
  const [unrequested, setUnrequested] = createSignal<[string, number][]>([]);
```

`syncConnectionSignals` に 1 行足す:

```tsx
  const syncConnectionSignals = () => {
    setConnections(manager.connectionCount);
    setPeakConnections(manager.peakConnectionCount);
    setUnrequested([...manager.unrequestedEventsByRelay]);
  };
```

表示（`peak-connections` の下）:

```tsx
        <p data-testid="unrequested">
          unrequested: {unrequested().reduce((sum, [, n]) => sum + n, 0)}
        </p>
        <ul data-testid="unrequested-relays">
          <For each={unrequested()}>
            {([url, count]) => (
              <li data-testid="unrequested-relay">
                {url} = {count}
              </li>
            )}
          </For>
        </ul>
```

`warmup` の行にブートストラップ側の件数も足す:

```tsx
        <p data-testid="warmup">
          followees: {warmUp()?.followees.length ?? 0} / routed:{" "}
          {warmUp()?.routed ?? 0} / unroutable: {warmUp()?.unroutable ?? 0} /
          unrequested: {warmUp()?.unrequested ?? 0}
        </p>
```

**注意:** `e2e/v1-section.spec.ts` が `warmup` の文言を完全一致で主張している。そちらも合わせて更新すること（`pnpm exec playwright test e2e/v1-section.spec.ts` で確認）。

- [ ] **Step 2: 侵入者イベントを fixture に足す**

`e2e/fixtures/seed-outbox.ts` の末尾に追加。**リレーには publish しない** —— e2e が `routeWebSocket` で直接注入する。

```ts
const intruderSecretKey = secretKey(307);
export const intruderNoteText = "intruder note the section never asked for";

/**
 * 閲覧者がフォローしていない著者の、**正当な署名つき** kind:1。
 *
 * 署名を本物にするのが要点である。無効な署名だと `EventStore.put` の schnorr
 * 検証が先に弾いてしまい、**照合器が効いたのかどうか区別できない。**
 * リレーへは publish しない —— 実リレーはフィルタを守るので、この経路では
 * 「要求していないものが届く」を再現できない。
 */
export const makeIntruderNote = () =>
  finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: intruderNoteText,
    },
    intruderSecretKey,
  );
```

- [ ] **Step 3: 失敗する e2e を書く**

`e2e/relay-lies.spec.ts`:

```ts
import { type WebSocketRoute, expect, test } from "@playwright/test";
import {
  intruderNoteText,
  makeIntruderNote,
  outboxNoteBText,
  outboxViewerPubkey,
  relayTwoUrl,
} from "./fixtures/seed-outbox.js";

/**
 * 悪意あるリレーを本物として再現する唯一の手段。
 *
 * 実リレー (nostr-rs-relay) はフィルタを守るので、「要求していないイベントを
 * 送りつけてくる」を実物では再現できない。`page.routeWebSocket` でページと
 * リレーの間に立ち、クライアントの REQ から `subscription_id` を拾って、
 * その購読宛に余計な EVENT を注入する —— NIP-01 の EVENT は
 * `subscription_id` しか持たないので、これは実在のリレーができることの
 * 正確な再現である。
 */
const relayTwoHost = new URL(relayTwoUrl).host;

test("drops events the section never asked for", async ({ page }) => {
  test.setTimeout(60_000);

  const intruder = makeIntruderNote();
  let injected = 0;

  await page.routeWebSocket(
    (url) => url.host === relayTwoHost,
    (ws: WebSocketRoute) => {
      const server = ws.connectToServer();
      // onMessage を張ると自動中継が止まるので、両方向を明示的に転送する。
      ws.onMessage((message) => {
        server.send(message);
        try {
          const parsed = JSON.parse(String(message));
          if (
            Array.isArray(parsed) &&
            parsed[0] === "REQ" &&
            typeof parsed[1] === "string"
          ) {
            ws.send(JSON.stringify(["EVENT", parsed[1], intruder]));
            injected += 1;
          }
        } catch {
          // JSON でないフレームは素通しでよい
        }
      });
      server.onMessage((message) => ws.send(message));
    },
  );

  await page.goto(`/debug/v1-section?pubkey=${outboxViewerPubkey}`);
  const items = page.getByTestId("items");

  // 著者 B の投稿はリレー2 にしかない。出た時点で、注入も済んでいる。
  await expect(items).toContainText(outboxNoteBText, { timeout: 20_000 });
  expect(injected, "the route never saw a REQ to inject into").toBeGreaterThan(0);

  // 主張 1: 迷い込みノートは出ない
  await expect(items).not.toContainText(intruderNoteText);

  // 主張 2: 捨てたことが観測できる。schnorr 拒否ではカウンタは増えないので、
  // この主張が「照合器が捨てた」ことと「署名検証が捨てた」ことを区別する。
  await expect(page.getByTestId("unrequested-relays")).toContainText(
    relayTwoUrl,
  );
  await expect(page.getByTestId("unrequested")).not.toHaveText(
    "unrequested: 0",
  );

  // 主張 3: リレー2 を壊しただけではない
  await expect(items).toContainText(outboxNoteBText);
});
```

- [ ] **Step 4: e2e を走らせる**

```bash
docker compose start nostr-rs-relay nostr-rs-relay-2
pnpm exec playwright test e2e/relay-lies.spec.ts
```

Expected: PASS（Task 2 が既に入っているため）

**`relayTwoUrl` の表記ゆれに注意。** fixture は `ws://127.0.0.1:8081`（末尾スラッシュなし）だが、アプリ内部では正規化されて `ws://127.0.0.1:8081/` になる可能性がある。`toContainText` は部分一致なので前者は後者に含まれるが、逆は成り立たない。**落ちたら `unrequested-relays` の実際の描画内容を確認してから直すこと**（推測で正規化を足さない）。

- [ ] **Step 5: 変異でテストが load-bearing であることを確認する**

`subscription-manager.ts` の `if (!matchesAnyFilter(event, filters))` ブロックを一時的にコメントアウトし、e2e を走らせる。

Expected: **FAIL** —— 迷い込みノートが `items` に出る。確認できたら元に戻し、`git diff src/` が空であることを確かめる。

戻らないまま次へ進んではならない:

```bash
git diff --stat src/    # 空であること
```

- [ ] **Step 6: 全体を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
pnpm exec playwright test --grep-invert "repost parser warning flood"
git add src/routes/debug/v1-section.tsx e2e/fixtures/seed-outbox.ts e2e/relay-lies.spec.ts e2e/v1-section.spec.ts
git commit -m "test(e2e): prove the trust boundary against a relay that actually lies"
```

---

### Task 5: ドキュメントを実装に追随させる

**Files:**
- Modify: `docs/adr/0023-centralized-subscription-manager.md`
- Modify: `docs/adr/0016-routing-bootstrap.md`
- Modify: `docs/design/read-layer-followups.md`
- Modify: `docs/design/architecture.md`

**Interfaces:**
- Consumes: Task 1〜5 で実際に入ったもの
- Produces: なし

- [ ] **Step 1: ADR-0023 を更新する**

「Consequences」の **ローカル再マッチが必要になる**の項に、解消済みであることと**どこで**解消したかを追記する（`src/core/read/filter-match.ts`、`SubscriptionManager.#handlersFor`、`bootstrap.ts` の `collect`）。「実装の段階」の記述も直す —— 現在は「後続 #3（接続プール）— マージ、30 接続上限、`max_subscriptions` の尊重、再接続」となっており、**再マッチがどの段階に属するか書かれていない。** 後続 #4 として独立させたことと、その理由（マージの前提条件であること）を足す。

- [ ] **Step 2: ADR-0016 を更新する**

「未解決の著者は既定リレーへ暫定的に送信し、解決後に張り直す」の後半について、**引き金が `kind:10002` の到着から明示的な `replan()` のみに変わった**ことを追記する。理由（照合を入れると、その経路に届きうる送信元がリレーの一方的な push だけになり原理的に発火しない）と、**専用の `kind:10002` 監視購読を作るかどうかはルーティング／水和のスライスが単独で判断する**ことを明記する。

- [ ] **Step 3: `read-layer-followups.md` を更新する**

- 「次の計画で直すべきもの」の **リレーが配信したイベントをフィルタに再照合していない** の項を「解消済み」へ移し、どう解消したかを書く（`filter-match.ts`、per-relay カウンタ、e2e が `routeWebSocket` で悪意あるリレーを再現していること）。
- 「後続 #3（接続プール）で扱うと決まったもの」の **同一リレー向けの REQ マージ** の項に、**後続 #5 へ回したこと**と、本スライスがその前提を用意したことを追記する。
- 「満たしていない要件」に変更はない（本スライスは ADR-0011 の 7 指標に触れていない）。**触れていないことを確認したうえで、何も書き換えないこと。**

- [ ] **Step 4: `architecture.md` を更新する**

読み取り層のデータフローを説明している箇所に、門が 1 つから 2 つになったこと（照合 → 検証の順で、照合が先にあるのは schnorr より安いため）を反映する。`filter-match.ts` をモジュール一覧に足す。

- [ ] **Step 5: リンクと事実を確認する**

```bash
pnpm check
rg -n 'filter-match|unrequestedEventsByRelay' docs/ | head -20
```

書いたファイルパス・シンボル名が実在することを確認する（前スライスでは、実装と食い違う記述が ADR に残っていたことがレビューで指摘されている）。

- [ ] **Step 6: コミットする**

```bash
git add docs/
git commit -m "docs: record local filter matching and the trigger it deleted"
```

---

## 完了条件

- `pnpm exec vitest run` 全通過
- `pnpm typecheck` exit 0
- `pnpm check` 通過
- `pnpm exec playwright test --grep-invert "repost parser warning flood"` 全通過
- `rg -n 'store.put' src/core/read/` の結果が、**すべて照合器の後ろにある**こと
