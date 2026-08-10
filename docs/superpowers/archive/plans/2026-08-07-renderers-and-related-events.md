# A-2 レンダラと関連イベント 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kind 別レンダラの登録機構を作り、リポスト・引用・返信を実際に描けるようにする。関連イベントの取得は既に動いているコアレッサを一般化する。

**Architecture:** 描画の入口を `<EventView id variant>` 1 つに固定し、`full` / `compact` の 2 表示を持たせる。**`compact` は関連イベントを一切要求しない** —— これが入れ子の深さ上限そのものになり、カウンタが要らなくなる。取得は `createProfileRequests` と同じ形の `createEventRequests`（200ms 窓）。読み取り層のクエリ機構には手を入れない。

**Tech Stack:** SolidJS / TypeScript / Vitest / Playwright。

**仕様:** [docs/superpowers/archive/specs/2026-08-07-renderers-and-related-events-design.md](../specs/2026-08-07-renderers-and-related-events-design.md)。**タスクの記述と仕様が食い違ったら仕様が正。**

## Global Constraints

- **完了の判定は `pnpm vitest run && pnpm typecheck && pnpm check` の 3 つすべて。**
  `pnpm check` は Biome と読み取り層の依存チェックだけで、**型検査を含まない**
  （型検査は `pnpm typecheck` = `tsc -b`）。Vitest は esbuild で変換するため型
  エラーを一切見ない。3 つ全部が緑になるまで DONE と報告しないこと。
- **すべてのテストは、捕まえる変異をコメントで名指しし、実際にその変異を製品
  コードへ入れて落ちることを確認してから報告すること。** 加えて **その変異が
  *名指ししたそのテスト*を落とすことまで確かめる** —— 直前のスライスでは計画が
  名指しした変異のうち 5 件が*兄弟テスト*のほうを落としており、実装担当が全件
  訂正した。落とすテストが違ったら、コメントのほうを実態に合わせて直すこと。
- **NIP の解釈は一次情報（`nostr-protocol/nips`）に従う。`src/features/`・
  `src/shared/libs/parser/` の v0 実装を参照しないこと** —— 仕様 5 節が記録して
  いるとおり、v0 は現行 NIP-10 に存在しない `mention` marker を割り当てており、
  `e` / `q` タグの pubkey 要素も読んでいない。
- **読み取り層（`src/core/read/`, `src/core/relay/`）のクエリ機構は変更しない。**
  このスライスが `src/core/read/` に足すのは `event-requests.ts` 1 ファイルだけ。
  既存ファイルに手を入れたくなったら、それは繰延事項として
  `docs/design/read-layer-followups.md` へ書くこと（見つけた時点で書く）。
- 作業ブランチは `v1`。旧実装（v0 側）は無視してよい。
- コメントとドキュメントは日本語。既存ファイルの記述密度に合わせ、「なぜ」を
  書き「何を」は書かない。
- `data-testid` は既存のものを変えない。新しいものは各タスクの指定に従う。
- **`content` のパースは範囲外。** 本文はプレーンテキストとして出す（URL も
  `nostr:` も画像も展開しない）。

---

### Task 1: タグの解釈（純関数）

**Files:**
- Create: `src/core/nostr/event-refs.ts`
- Create: `src/core/nostr/event-refs.test.ts`

**Interfaces:**
- Consumes: `NostrEvent` / `isNostrEvent`（`src/core/nostr/event.ts`）、`RelayUrl`
- Produces:
  ```ts
  export type EventRef =
    | { form: "id"; id: string; relay?: RelayUrl; pubkey?: string }
    | { form: "address"; address: string; relay?: RelayUrl };

  export const replyTarget = (event: NostrEvent) => Extract<EventRef, { form: "id" }> | undefined;
  export const quoteTargets = (event: NostrEvent) => EventRef[];
  export const repostTarget = (event: NostrEvent) => Extract<EventRef, { form: "id" }> | undefined;
  export const embeddedRepostEvent = (event: NostrEvent) => NostrEvent | undefined;
  ```

**このタスクは純関数だけ。UI にも読み取り層にも触らない。**

**NIP の一次情報（仕様 5 節より、実装が依存する事実）:**

- `e` タグ = `["e", <event-id>, <relay-url>, <marker>, <pubkey>]`。**marker は
  `"reply"` と `"root"` の 2 つだけ。`"mention"` は現行 NIP-10 に存在しない**
- **ルートへの直接の返信は `root` marker の `e` タグ 1 本だけを持つ。** よって
  親は `reply` があればそれ、無ければ `root`
- marker 無しの位置ベースの旧形式は deprecated。**このスライスでは解釈しない**
  （位置から意味を割り当てるのは NIP-10 自身が「曖昧で解決不能」としている）
- `q` タグ = `["q", "<event-id or event-address>", "<relay-url>", "<pubkey-if-a-regular-event>"]`
- kind:6 は `e` タグ必須（リレー URL も必須）、`content` はリポスト対象の JSON
  文字列（空でもよい）。kind:16 は `k` タグに対象の kind

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "./event";
import {
  embeddedRepostEvent,
  quoteTargets,
  replyTarget,
  repostTarget,
} from "./event-refs";

const ID_A = "a".repeat(64);
const ID_B = "b".repeat(64);
const PK = "c".repeat(64);

const noteWith = (tags: string[][], overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: ID_A,
  pubkey: PK,
  created_at: 1_700_000_000,
  kind: 1,
  tags,
  content: "",
  sig: "s".repeat(128),
  ...overrides,
});

describe("replyTarget", () => {
  it("reply marker があればそれを返す", () => {
    // 捕まえる変異: root を優先する (親ではなくスレッドの先頭を親として
    // 表示してしまう —— 長いスレッドで「誰への返信か」が常に間違う)
    expect(
      replyTarget(
        noteWith([
          ["e", ID_A, "wss://a/", "root", PK],
          ["e", ID_B, "wss://b/", "reply", PK],
        ]),
      ),
    ).toEqual({ form: "id", id: ID_B, relay: "wss://b/", pubkey: PK });
  });

  it("reply が無ければ root を返す", () => {
    // 捕まえる変異: reply marker だけを見る。NIP-10 は「ルートへの直接の
    // 返信は root marker の e タグ 1 本だけを持つ」と定めているので、
    // reply だけを見ると最も普通の返信が親を持たないことになる
    expect(replyTarget(noteWith([["e", ID_B, "", "root"]]))).toEqual({
      form: "id",
      id: ID_B,
    });
  });

  it("marker の無い e タグは無視する", () => {
    // 捕まえる変異: 位置ベースの旧形式を解釈する。NIP-10 自身が
    // deprecated かつ「曖昧で解決不能」としている
    expect(replyTarget(noteWith([["e", ID_B, "wss://b/"]]))).toBeUndefined();
  });

  it("空文字のリレー URL は relay を持たせない", () => {
    // 捕まえる変異: 空文字をそのまま relay に入れる (NIP-10 は
    // 「may be empty string」と明記している。空文字をリレーヒントとして
    // 下流へ渡すと接続先として使われうる)
    expect(replyTarget(noteWith([["e", ID_B, "", "root"]]))).not.toHaveProperty("relay");
  });

  it("pubkey が 64 桁 hex でなければ落とす", () => {
    // 捕まえる変異: 5 番目の要素を検証せずそのまま入れる (仕様 9 節)
    expect(replyTarget(noteWith([["e", ID_B, "", "root", "nope"]]))).toEqual({
      form: "id",
      id: ID_B,
    });
  });

  it("id が 64 桁 hex でなければタグごと落とす", () => {
    // 捕まえる変異: id を検証しない (壊れた id で fetchOnce を撃つ)
    expect(replyTarget(noteWith([["e", "short", "", "root"]]))).toBeUndefined();
  });
});

describe("quoteTargets", () => {
  it("q タグを順に返す", () => {
    // 捕まえる変異: 最初の 1 件だけ返す (複数引用が消える)
    expect(quoteTargets(noteWith([["q", ID_A, "wss://a/", PK], ["q", ID_B, "", ""]]))).toEqual([
      { form: "id", id: ID_A, relay: "wss://a/", pubkey: PK },
      { form: "id", id: ID_B },
    ]);
  });

  it("event-address 形式を address として返す", () => {
    // 捕まえる変異: id と同じ扱いにする (`30023:<pubkey>:<d>` を
    // `{ ids: [...] }` で引きに行き、永久に見つからない)
    expect(quoteTargets(noteWith([["q", `30023:${PK}:slug`, "wss://a/"]]))).toEqual([
      { form: "address", address: `30023:${PK}:slug`, relay: "wss://a/" },
    ]);
  });

  it("e タグは引用ではない", () => {
    // 捕まえる変異: e タグも引用として拾う。NIP-18 が q タグを作った目的
    // そのものが「引用がスレッドの返信として現れないようにする」ことなので、
    // 逆向きに混ぜると返信が引用として二重に描かれる
    expect(quoteTargets(noteWith([["e", ID_B, "", "root"]]))).toEqual([]);
  });
});

describe("repostTarget", () => {
  it("e タグを返す", () => {
    expect(repostTarget(noteWith([["e", ID_B, "wss://b/"]], { kind: 6 }))).toEqual({
      form: "id",
      id: ID_B,
      relay: "wss://b/",
    });
  });

  it("e タグが無ければ undefined (例外を投げない)", () => {
    // 捕まえる変異: throw する。v0 のパーサはそうしているが、1 件の不正な
    // イベントでカラム全体を壊してはいけない (仕様 9 節)
    expect(() => repostTarget(noteWith([], { kind: 6 }))).not.toThrow();
    expect(repostTarget(noteWith([], { kind: 6 }))).toBeUndefined();
  });
});

describe("embeddedRepostEvent", () => {
  it("content の JSON がイベントの形なら返す", () => {
    const embedded = noteWith([], { id: ID_B });
    expect(
      embeddedRepostEvent(noteWith([], { kind: 6, content: JSON.stringify(embedded) })),
    ).toEqual(embedded);
  });

  it("content が空なら undefined", () => {
    // 捕まえる変異: 空文字を JSON.parse に渡して例外を投げる
    expect(embeddedRepostEvent(noteWith([], { kind: 6, content: "" }))).toBeUndefined();
  });

  it("JSON として壊れていれば undefined", () => {
    // 捕まえる変異: try/catch を省く
    expect(embeddedRepostEvent(noteWith([], { kind: 6, content: "{ not json" }))).toBeUndefined();
  });

  it("イベントの形をしていなければ undefined", () => {
    // 捕まえる変異: isNostrEvent を通さずキャストする。埋め込みは
    // **リポストした人が書いた任意の文字列**であり、形すら信用できない
    expect(
      embeddedRepostEvent(noteWith([], { kind: 6, content: JSON.stringify({ hello: 1 }) })),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/nostr/event-refs.test.ts`
Expected: FAIL —— モジュールが存在しない。

- [ ] **Step 3: 実装する**

```ts
import { type NostrEvent, isNostrEvent } from "./event";
import type { RelayUrl } from "../relay/relay-connection";

/** NIP-01 の id / pubkey は 32 バイトの小文字 hex 表現である。 */
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * 他のイベントへの参照。`q` タグは event-address（置換可能イベントの
 * `kind:pubkey:d` 座標）も運べるので、id 形式と区別できる形にする ——
 * 混ぜると `{ ids: [...] }` で座標を引きに行って永久に見つからない。
 */
export type EventRef =
  | { form: "id"; id: string; relay?: RelayUrl; pubkey?: string }
  | { form: "address"; address: string; relay?: RelayUrl };

type IdRef = Extract<EventRef, { form: "id" }>;

/**
 * 空文字を落とす。NIP-10 はリレー URL について「may be empty string」と
 * 明記しており、空文字をそのままリレーヒントとして下流へ渡すと接続先として
 * 使われうる。
 */
const relayOf = (value: string | undefined): RelayUrl | undefined =>
  value && value.length > 0 ? (value as RelayUrl) : undefined;

const pubkeyOf = (value: string | undefined): string | undefined =>
  value && HEX_64.test(value) ? value : undefined;

const idRef = (id: string, relay?: string, pubkey?: string): IdRef | undefined => {
  if (!HEX_64.test(id)) return undefined;
  const ref: IdRef = { form: "id", id };
  const r = relayOf(relay);
  if (r) ref.relay = r;
  const p = pubkeyOf(pubkey);
  if (p) ref.pubkey = p;
  return ref;
};

/**
 * 返信先（親）を返す。**marker が付いた `e` タグだけを見る。**
 *
 * NIP-10 の marker は `"reply"` と `"root"` の 2 つだけであり、`"mention"`
 * は現行仕様に存在しない（v0 の実装は割り当てているが、それは古い）。
 * marker 無しの位置ベースの旧形式は deprecated で、NIP-10 自身が
 * 「曖昧で解決不能」としているので解釈しない。
 *
 * `reply` があればそれ、無ければ `root` —— NIP-10 は「スレッドのルートへの
 * 直接の返信は root marker の `e` タグ 1 本だけを持つ」と定めているので、
 * `reply` だけを見ると最も普通の返信が親を持たないことになる。
 */
export const replyTarget = (event: NostrEvent): IdRef | undefined => {
  let root: IdRef | undefined;
  for (const tag of event.tags) {
    if (tag[0] !== "e") continue;
    const marker = tag[3];
    if (marker !== "reply" && marker !== "root") continue;
    const ref = idRef(tag[1] ?? "", tag[2], tag[4]);
    if (!ref) continue;
    if (marker === "reply") return ref;
    root ??= ref;
  }
  return root;
};

/**
 * 引用先を順に返す。**`e` タグは拾わない** —— NIP-18 が `q` タグを作った
 * 目的そのものが「引用がスレッドの返信として現れないようにする」ことなので、
 * 混ぜると逆流する。
 */
export const quoteTargets = (event: NostrEvent): EventRef[] => {
  const refs: EventRef[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== "q") continue;
    const value = tag[1] ?? "";
    if (value.includes(":")) {
      const ref: EventRef = { form: "address", address: value };
      const r = relayOf(tag[2]);
      if (r) ref.relay = r;
      refs.push(ref);
      continue;
    }
    const ref = idRef(value, tag[2], tag[3]);
    if (ref) refs.push(ref);
  }
  return refs;
};

/**
 * リポスト対象の `e` タグ。**例外を投げない** —— NIP-18 は kind:6 に `e`
 * タグを要求するが、守らないイベントは実在しうる。1 件の不正なイベントで
 * カラム全体を壊さない（仕様 9 節）。
 */
export const repostTarget = (event: NostrEvent): IdRef | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "e") continue;
    const ref = idRef(tag[1] ?? "", tag[2], tag[4]);
    if (ref) return ref;
  }
  return undefined;
};

/**
 * リポストの `content` に埋め込まれた対象イベント（NIP-18）。
 *
 * **この値は信用できない** —— リポストした人が書いた任意の文字列である。
 * ここで確かめるのは形（`isNostrEvent`）だけで、**署名の検証は呼び出し側が
 * `EventStore.put` を通して行う**。put が `"rejected"` を返したら、この
 * 埋め込みは捨てて `e` タグから引き直すこと。
 */
export const embeddedRepostEvent = (event: NostrEvent): NostrEvent | undefined => {
  if (event.content.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return undefined;
  }
  return isNostrEvent(parsed) ? parsed : undefined;
};
```

**`isNostrEvent` のシグネチャを確認すること。** `src/core/nostr/event.ts` が
`unknown` を受ける型ガードでなければ、そのように直すのではなく、ここで形を
確かめてから渡す形にすること（読み取り層を変更しない、という制約）。

- [ ] **Step 4: 3 つのゲートと変異検証**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
名指しした 14 件の変異を全部入れて確認し、報告ファイルに全件書く。

- [ ] **Step 5: コミット**

```bash
git add src/core/nostr/event-refs.ts src/core/nostr/event-refs.test.ts
git commit -m "feat(nostr): read reply/quote/repost references per current NIP-10 and NIP-18"
```

---

### Task 2: 関連イベントのコアレッサ

**Files:**
- Create: `src/core/read/event-requests.ts`
- Create: `src/core/read/event-requests.test.ts`

**Interfaces:**
- Consumes: `EventStore`（`get(id)`）、`SubscriptionManager`（`fetchOnce(filters, options?)`）、`Scheduler` / `defaultScheduler`（`connection-pool.ts`）
- Produces:
  ```ts
  export type EventRequests = {
    request(id: string, relayHint?: RelayUrl): void;
    isUnresolved(id: string): boolean;
    subscribe(listener: () => void): () => void;
    dispose(): void;
  };
  export const createEventRequests = (options: {
    store: EventStore;
    manager: SubscriptionManager;
    scheduler?: Scheduler;
  }) => EventRequests;
  export const EVENT_BATCH_MS = 200;
  ```

**`src/core/read/profile-requests.ts` を読み、同じ形にすること。** 窓の長さも
同じ 200ms、`request` / `subscribe` / `dispose` の意味論も同じ、`Scheduler` の
注入口も同じ。**違うのは 3 点だけ:**

1. フィルタが `{ kinds: [0], authors }` ではなく **`{ ids }`**
2. 既取得の判定が `store.latestReplaceable(0, pubkey)` ではなく **`store.get(id)`**
3. **`isUnresolved(id)` がある**（`profile-requests.ts` には無い）

**`isUnresolved` の意味:** その id を含むバッチが 1 本片付いたのに、まだ
`store.get(id)` が `undefined` であること。要求したことが無い id については
`false`。`fetchOnce` は全リレーが EOSE/CLOSED を返すかタイムアウト（10 秒）で
必ず解決するので、「バッチが片付いた」は判定できる。**これが「取得中」と
「取得できなかった」を呼び出し側が区別する唯一の手段である**（仕様 7 節）。

**`relayHint` は受け取って捨てる。** 仕様 4.2 節のとおり —— ヒントの信頼性
（悪意あるリレーが任意の URL を書ける）を検討していないので使わない。
**引数だけ先に置く**のは、呼び出し側がタグから読む処理をどのみち書くため。
**このことをコメントに明記すること** —— 黙って捨てると、後から読む人が
バグだと思う。

- [ ] **Step 1: 失敗するテストを書く**

`profile-requests.test.ts` を読み、そのセットアップ（`createFakeClock`、
`EventStore`、`SubscriptionManager` のスタブ）をそのまま踏襲すること。
以下は満たすべき主張であり、ヘルパーの形は既存に合わせる。

主張と、それぞれが捕まえる変異:

| 主張 | 捕まえる変異 |
|---|---|
| 窓の中の複数 `request` が `fetchOnce` 1 本になり、`ids` に全部入る | 要求ごとに `fetchOnce` を撃つ（N+1 の復活。ADR-0017 が恐れたもの） |
| 窓が閉じる前は `fetchOnce` が呼ばれない | 窓を持たず同期的に撃つ |
| `store.get(id)` が既にあれば要求しない | 既取得の判定を省く |
| 同じ id を 2 回要求しても `ids` に 1 つだけ入る | `Set` ではなく配列で溜める |
| 窓が閉じた後の新しい要求は**次の**バッチになる | `pending` を差し替えず使い回す |
| `isUnresolved` はバッチ完了前 `false`、完了後まだ store に無ければ `true` | 完了を待たず即 `true`（取得中のものが「失敗」と描かれる） |
| `isUnresolved` はイベントが届けば `false` | store を見ない |
| 要求していない id の `isUnresolved` は `false` | 既定を `true` にする |
| `dispose()` がタイマーを残さない | `clearTimeout` を省く（`clock.pendingCount` で直接数える） |
| `dispose()` 後の `request` は何もしない | ガードを省く |

- [ ] **Step 2: 走らせて落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/event-requests.test.ts`
Expected: FAIL —— モジュールが存在しない。

- [ ] **Step 3: 実装する**

`profile-requests.ts` の構造をそのまま写し、上記 3 点を変える。`isUnresolved`
のために「要求してバッチが片付いた id」の集合を 1 つ持つ。

```ts
  /**
   * 要求して、それを含むバッチが片付いた id。`fetchOnce` は全リレーが
   * EOSE/CLOSED を返すかタイムアウトで**必ず**解決するので、ここに入って
   * いて store に無いなら「探したが見つからなかった」と言い切れる。
   * 「まだ探している最中」と区別するための集合であり、これが無いと
   * 遅いだけのものが壊れて見える（仕様 7 節）。
   */
  const settled = new Set<string>();

  const flush = (): void => {
    timer = null;
    if (pending.size === 0) return;
    const ids = [...pending];
    // `profile-requests.ts` と同じ理由で、ここで新しい Set に差し替える ——
    // `fetchOnce` の解決前に来た要求を今回のバッチへ混ぜず次へ回す。
    pending = new Set();

    void options.manager.fetchOnce([{ ids }]).then(() => {
      if (disposed) return;
      for (const id of ids) settled.add(id);
      for (const listener of listeners) listener();
    });
  };
```

```ts
    isUnresolved(id) {
      // store にあるなら解決済み。settled に入っていても、後から別経路
      // （カラムの購読など）で届いていることがある。
      return settled.has(id) && !options.store.get(id);
    },
```

**`flush` の中で `pending` を新しい `Set` に差し替える理由**（`fetchOnce` の
解決前に来た要求を次のバッチへ回す）は `profile-requests.ts` のコメントに
書いてあるので、同じ理由をここにも書くこと。

- [ ] **Step 4: 3 つのゲートと変異検証**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
名指しした変異を全件確認し、報告ファイルに書く。

- [ ] **Step 5: コミット**

```bash
git add src/core/read/event-requests.ts src/core/read/event-requests.test.ts
git commit -m "feat(read): coalesce related-event requests the way profiles already are"
```

---

### Task 3: レンダラ登録機構と `EventView`

**Files:**
- Create: `src/core/view/renderer-registry.ts`
- Create: `src/core/view/renderer-registry.test.ts`
- Create: `src/core/view/render-context.tsx`
- Create: `src/routes/v1/EventView.tsx`
- Create: `src/routes/v1/UnknownKind.tsx`

**Interfaces:**
- Produces:
  ```ts
  // renderer-registry.ts
  export type EventVariant = "full" | "compact";
  export type EventRenderer = {
    kind: number;
    full: Component<{ event: NostrEvent }>;
    compact: Component<{ event: NostrEvent }>;
  };
  export const defineRenderer = (renderer: EventRenderer): EventRenderer => renderer;
  export const rendererFor = (
    renderers: readonly EventRenderer[],
    kind: number,
  ): EventRenderer | undefined;

  // render-context.tsx
  export type RenderContextValue = {
    store: EventStore;
    events: EventRequests;
    profiles: ProfileRequests;
    renderers: readonly EventRenderer[];
  };
  export const RenderProvider: ParentComponent<{ value: RenderContextValue }>;
  export const useRender = (): RenderContextValue;
  ```

**このタスクでは kind ごとのレンダラを作らない**（Task 4）。`EventView` と
fallback（`UnknownKind`）だけを作り、**レンダラ集合が空でも壊れない**ことを
示す。

- [ ] **Step 1: `rendererFor` のテストを書く**

純関数なので単体で固定できる。捕まえる変異を明記すること:
登録済み kind を返す / 未登録で `undefined` を返す（変異: 最初の要素を返す）/
同じ kind が 2 つ登録されていたら**先に登録されたほう**を返す（変異: 後勝ちに
する —— 後勝ちだと、既定の集合にアプリ側が 1 つ足すときの上書き規則が逆になる。
**このスライスでは重複登録を作らないが、規則を先に固定しておく**）。

- [ ] **Step 2: `render-context.tsx` を書く**

Solid の `createContext` / `useContext`。`useRender` は provider の外で呼ばれた
ら**例外を投げる**（`undefined` を返して呼び出し側で分岐させると、渡し忘れが
実行時の静かな未描画になる）。

- [ ] **Step 3: `EventView.tsx` を書く**

```tsx
export type EventViewProps = {
  id: string;
  variant: EventVariant;
  /** タグが運ぶリレーヒント。Task 2 のとおり今は使われない。 */
  relayHint?: RelayUrl;
};
```

振る舞い:

1. `store.get(id)` にあれば、その kind のレンダラを選んで描く。未登録なら
   `UnknownKind`
2. 無ければ `events.request(id, relayHint)` して `events.subscribe` で待つ。
   `<Profile>`（`src/routes/v1/Profile.tsx`）の `createEffect` の形をそのまま
   踏襲すること —— **`profile` 自身を effect の中で読むと無限ループになる**と
   いうコメントが書かれている罠を繰り返さない
3. 待っている間は「読み込み中」（`data-testid="event-loading"`）
4. `events.isUnresolved(id)` が真になったら「読み込めませんでした」
   （`data-testid="event-unresolved"`）

`data-testid="event-view"` を付け、`data-variant` に variant を出すこと
（e2e が `compact` で描かれていることを主張できるようにする）。

```tsx
const EventView: Component<EventViewProps> = (props) => {
  const ctx = useRender();
  const [event, setEvent] = createSignal<NostrEvent | undefined>();
  const [unresolved, setUnresolved] = createSignal(false);

  createEffect(() => {
    // 追跡するのは props.id だけ。この中で event() を読んで分岐すると、
    // setEvent がこの effect を再実行させて無限ループになる
    // (`Profile.tsx` に同じ罠のコメントがある)。
    const id = props.id;
    setUnresolved(false);

    const check = (): boolean => {
      const found = ctx.store.get(id);
      if (!found) return false;
      setEvent(found);
      return true;
    };

    if (check()) return;

    ctx.events.request(id, props.relayHint);
    const unsubscribe = ctx.events.subscribe(() => {
      if (check()) {
        unsubscribe();
        return;
      }
      // 無関係なバッチの完了でも呼ばれる。自分の id が片付いたときだけ
      // 「見つからなかった」へ倒す。
      if (ctx.events.isUnresolved(id)) setUnresolved(true);
    });
    onCleanup(unsubscribe);
  });

  return (
    <div data-testid="event-view" data-variant={props.variant}>
      <Show
        when={event()}
        fallback={
          <Show
            when={unresolved()}
            fallback={<p data-testid="event-loading">読み込み中…</p>}
          >
            <p data-testid="event-unresolved">読み込めませんでした</p>
          </Show>
        }
      >
        {(found) => {
          const renderer = rendererFor(ctx.renderers, found().kind);
          // 未登録の kind でも描く。ADR-0003 は fallback を必須としている。
          const Body = renderer
            ? props.variant === "full" ? renderer.full : renderer.compact
            : props.variant === "full" ? UnknownKind.Full : UnknownKind.Compact;
          return <Body event={found()} />;
        }}
      </Show>
    </div>
  );
};
```

**この骨組みは動くことを確かめていない。** `<Show>` の children が関数を
取る形、`rendererFor` を描画のたびに呼ぶこと（メモ化すべきか）、
`UnknownKind` を 2 つの Component としてどう export するかは、実装しながら
Solid の作法に合わせて直すこと。**要求と分岐の意味論**（store にあれば描く /
無ければ要求 / `isUnresolved` で失敗へ倒す / 未登録 kind でも描く）だけが
このスライスの要求である。

- [ ] **Step 4: `UnknownKind.tsx` を書く**

`full`: kind 番号 +「未対応の種類です」+ `content` を 200 文字で切り詰め。
`compact`: kind 番号のみ。`data-testid="unknown-kind"`。

**`content` の切り詰めは文字数で行い、絵文字などのサロゲートペアを割らない
こと**（`Array.from(content).slice(0, 200).join("")`）。割れた文字は表示が
壊れるだけでなく、`data-testid` で拾った文字列の比較を不安定にする。

- [ ] **Step 5: 3 つのゲートと変異検証**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`

**この時点では `EventView` はまだどこからも使われていない。** `pnpm typecheck`
は緑になるはずで、赤なら何かを間違えている。

- [ ] **Step 6: コミット**

```bash
git add src/core/view src/routes/v1/EventView.tsx src/routes/v1/UnknownKind.tsx
git commit -m "feat(view): add the kind renderer registry and the single render entry point"
```

---

### Task 4: kind:1 / kind:6 / kind:16 のレンダラ

**Files:**
- Create: `src/routes/v1/renderers/Note.tsx`（既存の `src/routes/v1/Note.tsx` から）
- Create: `src/routes/v1/renderers/Repost.tsx`
- Create: `src/routes/v1/renderers/index.ts`（既定のレンダラ集合）
- Modify: `src/routes/v1/DeckColumn.tsx`（`<Note>` の直接呼び出しを `<EventView>` に）
- Modify: `src/routes/v1.tsx`（`RenderProvider` を置く、`createEventRequests` を作る）
- Delete: `src/routes/v1/Note.tsx`

**Interfaces:**
- Consumes: Task 1 の `replyTarget` / `quoteTargets` / `repostTarget` /
  `embeddedRepostEvent`、Task 2 の `EventRequests`、Task 3 の
  `defineRenderer` / `EventView` / `useRender`

**中身は仕様 6 節の表がすべて。** 以下は表に書ききれない実装上の要点。

- [ ] **Step 1: kind:1 のレンダラ**

`full`:
- 既存の `Note.tsx` の見た目（著者・本文・時刻、`data-testid="note"` /
  `note-author` / `note-content` / `note-created-at`）を**変えない**
- `replyTarget(event)` があれば本文の**上**に:
  - `ref.pubkey` があれば `<Profile pubkey={ref.pubkey}>` で「@name への返信」
    を**即座に**出す（`data-testid="reply-to"`）。**親イベントの到着を待たない**
    —— これが仕様 5 節の「取得前に著者名を出せる」の実装そのもの
  - 続けて `<EventView id={ref.id} variant="compact" relayHint={ref.relay} />`
- `quoteTargets(event)` の各 `form: "id"` について本文の**下**に
  `<EventView variant="compact" />`。`form: "address"` は
  「未対応の参照です」（`data-testid="unsupported-ref"`）

`compact`:
- 著者・本文・時刻のみ。**`replyTarget` も `quoteTargets` も呼ばない**

- [ ] **Step 2: `compact` が関連を要求しないことを固定するテスト**

**このスライスで最も落としやすい規則である**（破れても画面は深くなるだけで
動いてしまう）。ユニットテストで直接主張すること:

`EventRequests` のスタブ（`request` の呼び出しを記録するだけ）を context に
入れ、引用と返信を持つ kind:1 を `variant="compact"` で描画し、**`request` が
一度も呼ばれない**ことを主張する。同じイベントを `variant="full"` で描画すると
**呼ばれる**ことも同じテストで主張し、対照にすること。

Solid コンポーネントの描画には `createRoot` を使う（このリポジトリには
`@solidjs/testing-library` が無く、既存の `*.test.tsx` はすべて `createRoot`
を使っている —— `src/core/solid/create-section.test.tsx` を見ること）。

捕まえる変異: `compact` でも `replyTarget`/`quoteTargets` を呼んで
`<EventView>` を描く。

- [ ] **Step 3: kind:6 / kind:16 のレンダラ**

`full`:
- 「@x がリポスト」（`<Profile>`、`data-testid="repost-by"`）
- 対象の決定は次の順:
  1. `embeddedRepostEvent(event)` があれば **`store.put(embedded, "embedded")`
     を通す**。戻り値が `"rejected"` でなければ、その id を対象にする
     （`"duplicate"` も可 —— 既に store にある正規のものが使われる）
  2. `"rejected"` だった、または埋め込みが無ければ `repostTarget(event)` の id
  3. どちらも無ければ「リポスト（対象不明）」（`data-testid="repost-unknown"`）
- 対象を `<EventView variant="compact" />` で描く

`compact`: 「@x がリポスト」の 1 行のみ。**対象を描かない**

**`store.put` の第 2 引数（リレー URL）に何を渡すか。** 実在するリレーの URL を
渡してはいけない —— `seenRelays` はリレーヒントとして読まれる（`routing-table`）
ので、埋め込み由来のものを実在リレーの提供として記録すると嘘になる。
`"embedded"` のような、URL ではないと分かる印を使うこと。**この判断の理由を
コメントに書くこと。**

kind:16 は kind:6 と同じレンダラでよい（`k` タグは対象の kind を示すだけで、
描画は `EventView` が対象の実際の kind から選ぶ）。**`k` タグを読む必要は無い**
—— 読んで分岐すると、`k` タグが嘘をついていた場合に実際の kind と食い違う。

- [ ] **Step 4: 配線する**

`src/routes/v1.tsx`:
- `createEventRequests({ store, manager })` を作り `onCleanup` で dispose
- `RenderProvider` で `<DeckColumn>` 群を包む。`renderers` は
  `src/routes/v1/renderers/index.ts` の既定集合

`src/routes/v1/DeckColumn.tsx`:
- `<Note event={...}>` を `<EventView id={event.id} variant="full" />` に置き換える
- **`data-testid="item"` の構造は変えない**（既存の e2e が拾っている）

- [ ] **Step 5: 3 つのゲートと変異検証**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Run: `pnpm exec playwright test e2e/v1.spec.ts`（**既存の e2e が緑のままである
こと。** kind:1 の描画は見た目を変えていないので落ちてはいけない）

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat(v1): render reposts, quotes and replies through the registry"
```

---

### Task 5: 初回描画の計測と e2e

**Files:**
- Modify: `src/routes/v1.tsx`
- Modify: `src/routes/v1/DiagnosticsPanel.tsx`
- Modify: `e2e/fixtures/seed-preview.ts`（または新しいシードを足す）
- Modify: `e2e/v1.spec.ts`

- [ ] **Step 1: `first-render-ms` を足す**

**測る区間: pubkey が確定した時点から、いずれかのカラムに最初のノートが
描画されるまで。** `performance.now()` で挟む。`optimistic-insert-ms`
（`src/routes/v1.tsx`）と同じ形で、**開発者モードのときだけ表示**する
（`data-testid="first-render-ms"`）。

**「最初のノートが描画されるまで」をどう検出するか。** セクションの
`items()` が初めて空でなくなった瞬間でよい。`createEffect` で全カラムの
`items().length` を見て、初回だけ記録する。**2 回目以降は上書きしないこと**
—— カラムを足すたびに値が変わっては、初回描画の指標にならない。

- [ ] **Step 2: シードを足す**

`e2e/fixtures/` に次を足す。既存のシードの書き方（署名の作り方、リレーへの
publish の仕方）をそのまま踏襲すること。

- kind:6 のリポスト（`content` に埋め込みあり、`e` タグあり）
- kind:1 の引用（`q` タグ）
- kind:1 の返信（`e` タグ、`root` marker、pubkey 要素あり）
- **未登録の kind**（例えば kind:30023）

- [ ] **Step 3: e2e を足す**

`e2e/v1.spec.ts` に:

1. リポストが `repost-by` と対象の本文を出す
2. 引用が `event-view[data-variant="compact"]` の中に引用先の本文を出す
3. 返信が `reply-to` を出す
4. **未登録の kind が `unknown-kind` を出し、カラムが壊れない**（他のアイテムが
   引き続き描かれていることも主張すること —— fallback の目的は「壊さない」
   ことであり、fallback が出ることだけでは半分しか確かめていない）

- [ ] **Step 4: ゲート**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`
Run: `pnpm exec playwright test e2e/v1.spec.ts`

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "feat(v1): measure first render; cover reposts, quotes, replies and unknown kinds in e2e"
```

---

### Task 6: ADR の改訂と記録

**Files:**
- Modify: `docs/adr/0017-declarative-renderer-needs.md`
- Modify: `docs/adr/0003-open-column-abstraction.md`
- Modify: `docs/adr/0004-kind-knowledge-lives-in-renderers.md`
- Modify: `docs/design/read-layer-followups.md`

**製品コードは変更しない。**

- [ ] **Step 1: ADR-0017 を改訂する**

**仕様 4.1 節がこの改訂の内容そのものである。** そこに書かれた 4 点を ADR へ
移す:

1. **却下理由が無効になったこと** —— 実行時要求方式を却下した根拠は
   「バッチングがマイクロタスク合流という暗黙の仕組みに依存する」だったが、
   `profile-requests.ts` は明示的なコアレッサでそれを行い、実測で 50 ノート・
   10 著者 → REQ 1 本だった
2. **採らないと決めたもの** —— 宣言的 `needs(event)`、波状解決、深さ上限の
   カウンタ
3. **代わりに何が深さ上限になるか** —— `compact` が関連を要求しないという規則
4. **失うもの** —— ADR-0007 の NIP 追従パイプラインにとっての
   「純粋関数として宣言された依存は生成しやすくレビューで検証しやすい」

**「実装の段階」節に A-2 の項を足し、この ADR の決定が置き換わったことを
節の冒頭からも分かるようにすること** —— 冒頭の宣言的 API の例をそのまま
残すと、読んだ人がそれを実装すべきものだと思う。

- [ ] **Step 2: ADR-0003 / ADR-0004 に実装の段階を足す**

ADR-0003: レンダラ登録機構が**実装されたこと**、fallback が実際に効くこと、
`full` / `compact` の 2 表示という形。A-1 で記録した「1 カラム = 1 セクション」
のひっくり返す条件（ユーザー詳細カラム）は**まだ来ていない**ことも書く。

ADR-0004: 「取得回数の上限制御」がどう満たされたか —— 深さ上限のカウンタでは
なく `compact` の規則で満たしている、と書く。

- [ ] **Step 3: 仕様 11 節の 5 問に答える**

`docs/design/read-layer-followups.md` に新しい節
（`## A-2 レンダラと関連イベント（2026-08-07）— 仕様 11 節の答え`）を作る。

- **問 1（初回描画は何秒になったか）と問 4（8 カラムでの接続数）は実鍵でしか
  答えられない。** 「未取得」と明記し、開発者モードの `first-render-ms` /
  `peak-connections` を読むこと、と書く
- **問 2（`compact` が関連を引かない規則で不足を感じないか）も人間の判断が要る**
- **問 3（リポストの埋め込みが署名検証に通る割合）と問 5（`e`/`q` タグに
  pubkey が入っているか）は、実装中に観測できていれば書く。** 観測していなければ
  「未取得」と書き、**どう測れば分かるかを書く**

**推測を書かないこと。** 上の「A-1」節と「v1 縦断スライス」節が同じ規律で
書かれているので、形を揃えること。

- [ ] **Step 4: 繰延事項を書く**

Task 1〜5 の報告ファイルを読み、直さなかったものを followups の
「デッキと画面（読み取り層の外）」表へ足す。**拾い漏らさないこと。**

このタスク開始時点で分かっているものを 2 件、必ず書く:

- `EventRequests.relayHint` を受け取って捨てていること（仕様 4.2 節）。使う
  なら、悪意あるリレーが任意の URL を書ける問題を先に検討する必要がある
- `content` のパース（URL・画像・`nostr:` メンション・カスタム絵文字）が
  未着手であること。v0 の `parseTextContent` 相当

- [ ] **Step 5: ゲート**

Run: `pnpm vitest run && pnpm typecheck && pnpm check`

- [ ] **Step 6: コミット**

```bash
git add docs/
git commit -m "docs: revise ADR-0017; record what A-2 built and what it did not answer"
```

---

## 検証

自動テストで閉じられる範囲は各タスクで閉じている。完了時に人間へ次を依頼すること。

1. `pnpm dev` → `/v1` でログインし、開発者モードを有効にする
2. **`first-render-ms` を読む。** A-1 時点では約 3 秒（実鍵、体感）。**悪化して
   いるのが当然**であり、悪化幅そのものが仕様 11 節 問 1 の答えになる
3. **カラムを 8 本まで増やし `peak-connections` を読む。** A-1 は 10 だった
4. **リポスト・引用・返信が実際に描かれるか。** とくに引用先が `compact` で
   出ること、引用の引用が**展開されない**こと
5. **`@name への返信` が、親イベントの到着より先に出るか。** `e` タグに pubkey
   を入れないクライアントの投稿では出ない —— どちらが多いかが仕様 11 節 問 5
6. **未対応の kind が混ざったときにカラムが壊れないか**
