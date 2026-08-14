# リアクションとリポストの表示 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kind:7 をタイムラインに描き、リポストの対象を v0 と同じ「完全な描画」に直し、ノートに付いたリアクションを集計して出す。

**Architecture:** 純粋なロジック（NIP-25 の分類・集計）を `src/core/nostr` と `src/core/view` に置き、DOM から切り離してテストする。リアクションの取得は `ProfileRequests` と同じ形のコアレッサを新設し、`#e` で引く。**kind の知識を `EventStore` に入れない**（ADR-0004）ため、コアレッサが自分の索引を持ち、そのために `collect()` へ「受理したイベントを渡す」seam を 1 つ足す。

**Tech Stack:** SolidJS / UnoCSS / Vitest / Playwright。

**仕様:** [docs/superpowers/specs/2026-08-14-reactions-and-reposts-design.md](../specs/2026-08-14-reactions-and-reposts-design.md)。**タスクの記述と仕様が食い違ったら仕様が正。**

## Global Constraints

- **完了の判定は `pnpm vitest run` / `pnpm typecheck` / `pnpm check` の 3 つすべて**（Task 6 は加えて `pnpm exec playwright test e2e/v1.spec.ts`）。
  `pnpm check` は型検査を含まない。**各コマンドの終了ステータスをそれ自体で見ること** ——
  パイプへ通した先のステータスを読むと、落ちているのに通ったように見える。
- **v0 は「デザインの一次情報」であって「プロトコルの一次情報ではない」**（仕様 1 節）。
  - **読んでよい**: `src/features/Event/Reaction/components/*` /
    `src/features/Event/Repost/components/*` の**描画部分**
  - **読んではいけない**: `src/shared/libs/parser/7_reaction.ts` の解析。
    **NIP-25 に反する誤りが 2 つある**（空文字を `+` として扱わない、失敗で throw）。
    タグの意味は NIP-25 と `src/core/nostr/event-refs.ts` を見ること
- **レンダラは例外を投げない。** `<For>` の周りに `ErrorBoundary` が無く、1 件で
  カラム全体が落ちる。
- すべてのテストは捕まえる変異を名指しし、**実際にその変異を入れて落ちることを確認**する。
  **その変異が名指ししたテストを落とすこと**まで確かめる。**変異の前に製品コードを
  コピーして保存し、`git checkout` で戻さない。**
- **コメントには非自明な WHY だけ**（`CONTEXT.md` の「書き方」節）。WHAT・変更履歴・
  タスク ID は書かない。
- **既存の `data-testid` を変えない。**
- コンポーネントのテストは `createRoot`（この repo に `@solidjs/testing-library` は無い）。
  `src/routes/v1/renderers/Note.test.tsx` が最も近い前例。

---

### Task 1: NIP-25 の分類

**Files:**
- Create: `src/core/nostr/reaction.ts`
- Create: `src/core/nostr/reaction.test.ts`

**Interfaces:**
- Produces:
  - `type ReactionContent = { type: "like" } | { type: "emoji"; name: string; url: string } | { type: "text"; content: string }`
  - `type ParsedReaction = { content: ReactionContent; targetId: string; targetPubkey?: string }`
  - `parseReaction(event: NostrEvent): ParsedReaction | undefined`

**`undefined` を返す条件は「対象が分からないとき」だけ。** 例外は投げない。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "./event";
import { parseReaction } from "./reaction";

const base: NostrEvent = {
  id: "1".repeat(64),
  pubkey: "2".repeat(64),
  created_at: 1000,
  kind: 7,
  tags: [],
  content: "+",
  sig: "0".repeat(128),
};

const TARGET = "a".repeat(64);
const AUTHOR = "b".repeat(64);
const reaction = (over: Partial<NostrEvent>): NostrEvent => ({ ...base, ...over });

describe("parseReaction", () => {
  it("`+` は like", () => {
    // 捕まえる変異: like の分岐を消して全部 text にする
    expect(
      parseReaction(reaction({ tags: [["e", TARGET]], content: "+" }))?.content,
    ).toEqual({ type: "like" });
  });

  it("空文字も like", () => {
    // 捕まえる変異: `content === "+"` だけを like にする (v0 がこの誤りを
    // 持っている)。NIP-25 は「空文字はクライアントが `+` とみなすべき」と
    // 定めており、text に落とすと空のリアクションが画面に出る。
    expect(
      parseReaction(reaction({ tags: [["e", TARGET]], content: "" }))?.content,
    ).toEqual({ type: "like" });
  });

  it("emoji タグと `:name:` が一致すれば emoji", () => {
    // 捕まえる変異: emoji タグを見ずに text にする
    const parsed = parseReaction(
      reaction({
        tags: [
          ["e", TARGET],
          ["emoji", "smile", "https://example.com/smile.png"],
        ],
        content: ":smile:",
      }),
    );
    expect(parsed?.content).toEqual({
      type: "emoji",
      name: "smile",
      url: "https://example.com/smile.png",
    });
  });

  it("emoji タグがあっても content が一致しなければ text", () => {
    // 捕まえる変異: content を見ずに emoji タグがあれば emoji にする。
    // `:smile:` 以外の本文で登録済みの画像が出てしまう。
    const parsed = parseReaction(
      reaction({
        tags: [
          ["e", TARGET],
          ["emoji", "smile", "https://example.com/smile.png"],
        ],
        content: "🎉",
      }),
    );
    expect(parsed?.content).toEqual({ type: "text", content: "🎉" });
  });

  it("対象は最後の e タグ", () => {
    // 捕まえる変異: 最初の e タグを取る。NIP-25 はスレッドの祖先を前に
    // 並べるので、先頭を取ると祖先へリアクションしたことになる。
    const other = "c".repeat(64);
    expect(
      parseReaction(reaction({ tags: [["e", other], ["e", TARGET]] }))?.targetId,
    ).toBe(TARGET);
  });

  it("対象の著者は最後の p タグ", () => {
    // 捕まえる変異: 最初の p タグを取る (e タグと同じ理由)
    const other = "d".repeat(64);
    expect(
      parseReaction(
        reaction({ tags: [["e", TARGET], ["p", other], ["p", AUTHOR]] }),
      )?.targetPubkey,
    ).toBe(AUTHOR);
  });

  it("p タグが無くても対象 id は取れる", () => {
    // 捕まえる変異: p タグを必須にする。NIP-25 は SHOULD であって MUST では
    // なく、付けないクライアントは実在する。
    const parsed = parseReaction(reaction({ tags: [["e", TARGET]] }));
    expect(parsed?.targetId).toBe(TARGET);
    expect(parsed?.targetPubkey).toBeUndefined();
  });

  it("e タグが無ければ undefined (例外を投げない)", () => {
    // 捕まえる変異: throw する (v0 がそうしている)。1 件の壊れたイベントで
    // カラム全体が落ちる。
    expect(() => parseReaction(reaction({ tags: [] }))).not.toThrow();
    expect(parseReaction(reaction({ tags: [] }))).toBeUndefined();
  });

  it("64 桁 hex でない e タグは対象として採らない", () => {
    // 捕まえる変異: 形を確かめずに採る。存在しない id を延々と引きに行く。
    expect(parseReaction(reaction({ tags: [["e", "not-an-id"]] }))).toBeUndefined();
  });

  it("kind が 7 でなければ undefined", () => {
    // 捕まえる変異: kind を見ない。リポスト (kind:6) も e タグを持つので、
    // 見ないとリポストがリアクションとして解釈される。
    expect(
      parseReaction(reaction({ kind: 1, tags: [["e", TARGET]] })),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: 走らせて落ちることを確認**

Run: `pnpm vitest run src/core/nostr/reaction.test.ts`
Expected: FAIL（`./reaction` が存在しない）

- [ ] **Step 3: 実装**

```ts
import type { NostrEvent } from "./event";

const REACTION_KIND = 7;
/** NIP-01 の id / pubkey は 32 バイトの小文字 hex 表現である。 */
const HEX_64 = /^[0-9a-f]{64}$/;

export type ReactionContent =
  | { type: "like" }
  | { type: "emoji"; name: string; url: string }
  | { type: "text"; content: string };

export type ParsedReaction = {
  content: ReactionContent;
  targetId: string;
  /** NIP-25 の `p` は SHOULD。付けないクライアントが実在するので省略可能。 */
  targetPubkey?: string;
};

/** 同じ種類のタグのうち**最後**を返す。NIP-25 はスレッドの祖先を前に並べ、
 *  対象そのものを最後に置くと定めている。 */
const lastTagValue = (
  event: NostrEvent,
  name: string,
): string | undefined => {
  let found: string | undefined;
  for (const tag of event.tags) {
    if (tag[0] !== name) continue;
    const value = tag[1];
    if (value && HEX_64.test(value)) found = value;
  }
  return found;
};

const emojiContent = (event: NostrEvent): ReactionContent | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "emoji") continue;
    const name = tag[1];
    const url = tag[2];
    // 本文が `:name:` そのものでなければ、この emoji タグは content が指す
    // ものではない (NIP-30 は本文中の複数ショートコードも許すが、
    // リアクションの content は 1 つのショートコードだけ)。
    if (!name || !url || event.content !== `:${name}:`) continue;
    return { type: "emoji", name, url };
  }
  return undefined;
};

/**
 * kind:7 を描ける形へ落とす。**例外を投げない** —— 1 件の壊れたイベントで
 * カラム全体が落ちないようにするため、解釈できないものは `undefined`。
 */
export const parseReaction = (
  event: NostrEvent,
): ParsedReaction | undefined => {
  if (event.kind !== REACTION_KIND) return undefined;
  const targetId = lastTagValue(event, "e");
  if (!targetId) return undefined;

  const emoji = emojiContent(event);
  // 空文字は `+` と同じ (NIP-25)。v0 はここを取り違えており、空のリアクション
  // が画面に出る。
  const content: ReactionContent =
    emoji ?? (event.content === "+" || event.content === ""
      ? { type: "like" }
      : { type: "text", content: event.content });

  const targetPubkey = lastTagValue(event, "p");
  return targetPubkey
    ? { content, targetId, targetPubkey }
    : { content, targetId };
};
```

- [ ] **Step 4: 走らせて通ることを確認 → 変異検証 → コミット**

変異は 10 件（各テストのコメントが名指ししたもの）。**変異の前に `reaction.ts` を
コピーして保存し、検証後はコピーから戻すこと。**

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git add src/core/nostr/reaction.ts src/core/nostr/reaction.test.ts
git commit -m "feat(nostr): classify NIP-25 reactions without throwing"
```

---

### Task 2: リアクションの集計

**Files:**
- Create: `src/core/view/reaction-groups.ts`
- Create: `src/core/view/reaction-groups.test.ts`

**Interfaces:**
- Consumes: `ReactionContent` / `ParsedReaction`（Task 1、`src/core/nostr/reaction.ts`）
- Produces:
  - `type ReactionGroup = { key: string; content: ReactionContent; users: Map<string, number>; count: number }`
  - `groupReactions(reactions: readonly { pubkey: string; parsed: ParsedReaction }[]): ReactionGroup[]`

**引数の要素の形は Task 3 の `ReactionEntry` と同じ。** 構造的に一致していれば
そのまま渡せるので、**ここで新しい名前付きの型を輸出しないこと** —— 同じ形に
2 つの名前が付くと、どちらを使うべきか読む人が迷う。

**DOM を知らない純粋関数。**

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";
import type { ParsedReaction } from "../nostr/reaction";
import { groupReactions } from "./reaction-groups";

const TARGET = "a".repeat(64);
const entry = (pubkey: string, parsed: ParsedReaction) => ({ pubkey, parsed });
const like: ParsedReaction = { content: { type: "like" }, targetId: TARGET };
const text = (content: string): ParsedReaction => ({
  content: { type: "text", content },
  targetId: TARGET,
});
const emoji = (name: string, url: string): ParsedReaction => ({
  content: { type: "emoji", name, url },
  targetId: TARGET,
});

describe("groupReactions", () => {
  it("同じ内容がまとまり件数が合う", () => {
    // 捕まえる変異: グループ化せず 1 件 1 グループにする
    const groups = groupReactions([
      entry("u1", like),
      entry("u2", like),
      entry("u3", text("🎉")),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.content.type === "like")?.count).toBe(2);
  });

  it("同じ人が 2 回押したら 1 グループの中で 2 と数える", () => {
    // 捕まえる変異: users を Set にする (回数が落ちる) / 2 グループに割る
    const groups = groupReactions([entry("u1", like), entry("u1", like)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.users.get("u1")).toBe(2);
    expect(groups[0]?.count).toBe(2);
  });

  it("emoji と text が同じ文字列でも混ざらない", () => {
    // 捕まえる変異: 鍵に type を含めず文字列だけで引く。カスタム絵文字
    // `:smile:` とテキストの "smile" が同じ山になる。
    const groups = groupReactions([
      entry("u1", emoji("smile", "https://example.com/smile.png")),
      entry("u2", text("smile")),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("名前が同じで URL が違う emoji は 1 つにまとまる", () => {
    // 捕まえる変異: 鍵に URL を含める。同じショートコードを別ドメインの
    // 画像で送る人がいるだけで山が割れ、数が読めなくなる。
    const groups = groupReactions([
      entry("u1", emoji("smile", "https://a.example/s.png")),
      entry("u2", emoji("smile", "https://b.example/s.png")),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(2);
  });

  it("空の入力では空の配列", () => {
    // 捕まえる変異: 空でもグループを 1 つ作る (0 件の枠が画面に出る)
    expect(groupReactions([])).toEqual([]);
  });

  it("最初に現れた順に並ぶ", () => {
    // 捕まえる変異: Map の挿入順を壊す並べ替えを入れる。並びが呼ぶたびに
    // 変わると、リアクションが届くたびに既存の山が横に飛ぶ。
    const groups = groupReactions([
      entry("u1", text("🎉")),
      entry("u2", like),
      entry("u3", text("🎉")),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["text:🎉", "like"]);
  });
});
```

- [ ] **Step 2: 走らせて落ちることを確認**

Run: `pnpm vitest run src/core/view/reaction-groups.test.ts`
Expected: FAIL（`./reaction-groups` が存在しない）

- [ ] **Step 3: 実装**

```ts
import type { ParsedReaction, ReactionContent } from "../nostr/reaction";

export type ReactionGroup = {
  /** まとめる鍵。テストが並びを主張できるよう安定した文字列にする。 */
  key: string;
  content: ReactionContent;
  /** 押した人 → 回数。展開表示で「@name (2)」を出すのに要る。 */
  users: Map<string, number>;
  count: number;
};

/**
 * 鍵に**種別を含める**。カスタム絵文字 `:smile:` とテキストの "smile" は
 * 別物であり、文字列だけで引くと同じ山になる。逆に URL は含めない ——
 * 同じショートコードを別ドメインの画像で送る人がいるだけで山が割れ、
 * 数が読めなくなる。
 */
const keyOf = (content: ReactionContent): string => {
  switch (content.type) {
    case "like":
      return "like";
    case "emoji":
      return `emoji:${content.name}`;
    case "text":
      return `text:${content.content}`;
  }
};

/** 最初に現れた順を保つ (`Map` の挿入順)。並びが呼ぶたびに変わると、
 *  リアクションが 1 件届くだけで既存の山が横に飛ぶ。 */
export const groupReactions = (
  reactions: readonly { pubkey: string; parsed: ParsedReaction }[],
): ReactionGroup[] => {
  const groups = new Map<string, ReactionGroup>();
  for (const { pubkey, parsed } of reactions) {
    const key = keyOf(parsed.content);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        key,
        content: parsed.content,
        users: new Map([[pubkey, 1]]),
        count: 1,
      });
      continue;
    }
    current.users.set(pubkey, (current.users.get(pubkey) ?? 0) + 1);
    current.count += 1;
  }
  return [...groups.values()];
};
```

- [ ] **Step 4: 走らせて通ることを確認 → 変異検証 → コミット**

変異は 6 件。**変異の前にコピーして保存し、検証後はコピーから戻すこと。**

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git add src/core/view/reaction-groups.ts src/core/view/reaction-groups.test.ts
git commit -m "feat(view): group reactions by content"
```

---

### Task 3: リアクションの取得

**Files:**
- Modify: `src/core/read/collect.ts`（`CollectOptions` に `onAccepted` を足す）
- Modify: `src/core/read/subscription-manager.ts`（`fetchOnce` の options に通す）
- Create: `src/core/read/reaction-requests.ts`
- Create: `src/core/read/reaction-requests.test.ts`

**Interfaces:**
- Consumes: `parseReaction`（Task 1）
- Produces:
  - `type ReactionRequests = { request(targetId: string): void; reactionsOf(targetId: string): readonly { pubkey: string; parsed: ParsedReaction }[]; subscribe(listener: () => void): () => void; readonly lastBatchSize: number; readonly maxBatchSize: number; dispose(): void }`
  - `createReactionRequests(options: { manager: SubscriptionManager; scheduler?: Scheduler }): ReactionRequests`

**`ProfileRequests`（`src/core/read/profile-requests.ts`）と同じ形にする。** 窓で溜めて
1 本のフィルタにまとめ、解決したらリスナーへ知らせる。**そのファイルを読んで、
`flush` / `subscribe` / `lastBatchSize` の作りを揃えること。**

**なぜ `EventStore` に索引を足さないのか。** ADR-0004 が「kind の知識はレンダラに
置く」と決めており、「kind:7 を `e` タグで索引する」を store に入れるとそれを破る。
コアレッサが自分の索引を持てば、kind の知識はこのファイルの中に閉じる。

- [ ] **Step 1: `collect` に受理イベントの seam を足す**

`CollectOptions` に足す:

```ts
  /**
   * ローカルフィルタ照合を通って `store.put` された 1 件ごとに呼ばれる。
   *
   * `store` は「この `e` タグを持つイベント」を引く経路を持たず、足すと
   * kind の知識が store に入る (ADR-0004)。呼び出し側が自分の索引を作れる
   * ように、受理したものをそのまま渡す。
   */
  onAccepted?: (event: NostrEvent) => void;
```

`onEvent` の中、`store.put(event, url)` の直後で呼ぶ:

```ts
            store.put(event, url);
            options?.onAccepted?.(event);
```

`subscription-manager.ts` の `fetchOnce` の options に `onAccepted` を足し、
`collect` へ渡す:

```ts
  async fetchOnce(
    filters: RelayFilter[],
    options?: {
      relays?: RelayUrl[];
      timeoutMs?: number;
      onAccepted?: (event: NostrEvent) => void;
    },
  ): Promise<void> {
```

`collect(...)` の最後の引数へ `onAccepted: options?.onAccepted` を足す
（`onUnrequested` と並べる）。

- [ ] **Step 2: 失敗するテストを書く**

`src/core/read/profile-requests.test.ts` の作り（`FakeClock` と
`SubscriptionManager` のテストダブル）を読んで揃えること。

```ts
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { createFakeClock } from "./fake-clock";
import { createReactionRequests } from "./reaction-requests";
import type { SubscriptionManager } from "./subscription-manager";

const TARGET = "a".repeat(64);
const OTHER = "b".repeat(64);

const reactionEvent = (id: string, pubkey: string, target: string): NostrEvent => ({
  id,
  pubkey,
  created_at: 1000,
  kind: 7,
  tags: [["e", target]],
  content: "+",
  sig: "0".repeat(128),
});

/** `fetchOnce` の呼び出しを記録し、受理イベントを流し込めるテストダブル。 */
const createFakeManager = () => {
  const calls: { filters: unknown[]; deliver: (e: NostrEvent) => void }[] = [];
  return {
    calls,
    manager: {
      async fetchOnce(
        filters: unknown[],
        options?: { onAccepted?: (e: NostrEvent) => void },
      ) {
        calls.push({
          filters,
          deliver: (e) => options?.onAccepted?.(e),
        });
      },
    } as unknown as SubscriptionManager,
  };
};

describe("createReactionRequests", () => {
  it("窓の間に溜めた対象 id を 1 本のフィルタにまとめる", () => {
    // 捕まえる変異: request のたびに fetchOnce を呼ぶ (40 件のノートで
    // 40 本の REQ が飛ぶ)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    requests.request(OTHER);
    clock.advance(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.filters).toEqual([{ kinds: [7], "#e": [TARGET, OTHER] }]);
  });

  it("同じ対象を 2 度要求しても 1 度しか投げない", () => {
    // 捕まえる変異: pending を配列にする (同じ id が並び、REQ が無駄に伸びる)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    requests.request(TARGET);
    clock.advance(200);
    expect(calls[0]?.filters).toEqual([{ kinds: [7], "#e": [TARGET] }]);
  });

  it("受理したリアクションを対象ごとに引ける", () => {
    // 捕まえる変異: 索引に入れない (一覧が永久に空のまま)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    clock.advance(200);
    calls[0]?.deliver(reactionEvent("1".repeat(64), "u1", TARGET));
    expect(requests.reactionsOf(TARGET)).toHaveLength(1);
    expect(requests.reactionsOf(OTHER)).toHaveLength(0);
  });

  it("同じリアクションが 2 度届いても 1 件", () => {
    // 捕まえる変異: id で重複を除かない。複数リレーから同じイベントが
    // 届くのは普通で、数が実際の倍になる。
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    clock.advance(200);
    const event = reactionEvent("1".repeat(64), "u1", TARGET);
    calls[0]?.deliver(event);
    calls[0]?.deliver(event);
    expect(requests.reactionsOf(TARGET)).toHaveLength(1);
  });

  it("kind:7 として解釈できないものは索引に入れない", () => {
    // 捕まえる変異: parseReaction の undefined を無視して入れる。
    // リレーは要求外のものを寄越しうる (ADR-0023)。
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    clock.advance(200);
    calls[0]?.deliver({
      ...reactionEvent("1".repeat(64), "u1", TARGET),
      kind: 1,
    });
    expect(requests.reactionsOf(TARGET)).toHaveLength(0);
  });

  it("dispose 後は要求もしないし通知もしない", () => {
    // 捕まえる変異: dispose を無視する。アンマウント後に REQ が飛ぶ。
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.dispose();
    requests.request(TARGET);
    clock.advance(200);
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 走らせて落ちることを確認**

Run: `pnpm vitest run src/core/read/reaction-requests.test.ts`
Expected: FAIL（`./reaction-requests` が存在しない）

- [ ] **Step 4: 実装**

`profile-requests.ts` を写しつつ、索引を足す。窓は 200ms（`PROFILE_BATCH_MS` と
同じ値。**別の値にする理由が無い**）。

```ts
import type { NostrEvent } from "../nostr/event";
import { type ParsedReaction, parseReaction } from "../nostr/reaction";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { RelayFilter } from "../relay/relay-connection";
import type { SubscriptionManager } from "./subscription-manager";

const REACTION_KIND = 7;
/** `ProfileRequests` と同じ窓。別の値にする理由が無い。 */
const REACTION_BATCH_MS = 200;

export type ReactionEntry = { pubkey: string; parsed: ParsedReaction };

export type ReactionRequests = {
  request(targetId: string): void;
  reactionsOf(targetId: string): readonly ReactionEntry[];
  subscribe(listener: () => void): () => void;
  readonly lastBatchSize: number;
  readonly maxBatchSize: number;
  dispose(): void;
};

export const createReactionRequests = (options: {
  manager: SubscriptionManager;
  scheduler?: Scheduler;
}): ReactionRequests => {
  const scheduler = options.scheduler ?? defaultScheduler;
  let pending = new Set<string>();
  let timer: ReturnType<Scheduler["setTimeout"]> | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const requested = new Set<string>();
  // 対象 id → (リアクションの id → 中身)。内側を Map にするのは、
  // 同じイベントが複数リレーから届くため —— id で潰さないと数が倍になる。
  const byTarget = new Map<string, Map<string, ReactionEntry>>();

  let lastBatchSize = 0;
  let maxBatchSize = 0;

  const accept = (event: NostrEvent): void => {
    const parsed = parseReaction(event);
    if (!parsed) return;
    let bucket = byTarget.get(parsed.targetId);
    if (!bucket) {
      bucket = new Map();
      byTarget.set(parsed.targetId, bucket);
    }
    bucket.set(event.id, { pubkey: event.pubkey, parsed });
  };

  const flush = (): void => {
    timer = null;
    if (pending.size === 0) return;
    const ids = [...pending];
    pending = new Set();
    lastBatchSize = ids.length;
    if (ids.length > maxBatchSize) maxBatchSize = ids.length;

    const filters: RelayFilter[] = [{ kinds: [REACTION_KIND], "#e": ids }];
    void options.manager
      .fetchOnce(filters, { onAccepted: accept })
      .then(() => {
        if (disposed) return;
        for (const listener of listeners) listener();
      });
  };

  return {
    request(targetId) {
      if (disposed) return;
      // 一度要求した対象は二度要求しない。リアクションは後から増えるが、
      // それを追うのはこのスライスの範囲外 (仕様 2 節) であり、
      // 窓が回るたびに全ノートを引き直すと REQ が際限なく伸びる。
      if (requested.has(targetId)) return;
      requested.add(targetId);
      pending.add(targetId);
      if (timer === null) {
        timer = scheduler.setTimeout(flush, REACTION_BATCH_MS);
      }
    },

    reactionsOf(targetId) {
      const bucket = byTarget.get(targetId);
      return bucket ? [...bucket.values()] : [];
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    get lastBatchSize() {
      return lastBatchSize;
    },
    get maxBatchSize() {
      return maxBatchSize;
    },

    dispose() {
      disposed = true;
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
      pending = new Set();
      listeners.clear();
      byTarget.clear();
    },
  };
};
```

`RelayFilter` に `"#e"` が無ければ型を足すこと（`src/core/relay/relay-connection.ts`）。
既に `#e` を使っている箇所（`e2e` の REQ など）を確認し、既存の形に合わせる。

- [ ] **Step 5: ゲートと変異検証、コミット**

変異は 6 件。

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git commit -m "feat(read): coalesce reaction lookups by target event"
```

---

### Task 4: kind:7 のレンダラとリポストの修正

**Files:**
- Create: `src/routes/v1/renderers/Reaction.tsx`
- Create: `src/routes/v1/renderers/Reaction.test.tsx`
- Modify: `src/routes/v1/renderers/Repost.tsx`（対象を `compact` から `full` へ）
- Modify: `src/routes/v1/renderers/Repost.test.tsx`
- Modify: `src/routes/v1/renderers/index.ts`（kind:7 を登録）

**Interfaces:**
- Consumes: `parseReaction` / `ParsedReaction`（Task 1）、`EventView`、`Profile`
- Produces: `ReactionFull` / `ReactionCompact`（`Component<EventBodyProps>`）

**仕様 3 節がすべて。** 見出し 1 行 + 対象を**完全な** `EventView` として子に置く。

- [ ] **Step 1: `Repost` の対象を `full` にする**

`Repost.tsx` の `RepostFull` の中、`<EventView id={ref().id} variant="compact" ... />`
を `variant="full"` に変える。**`RepostCompact` は変えない**（compact の中の
compact は引用と同じ扱いでよい）。

見出しの行を v0 に合わせる（`src/features/Event/Repost/components/RepostUserName.tsx`）:

```tsx
      <p data-testid="repost-by" class="c-secondary flex items-center gap-1 text-caption">
        <span class="i-material-symbols:repeat-rounded c-green-5 aspect-square h-auto w-4 shrink-0" />
        <Profile
          pubkey={props.event.pubkey}
          store={ctx.store}
          requests={ctx.profiles}
        />
        <span class="shrink-0">がリポスト</span>
      </p>
```

- [ ] **Step 2: `Repost.test.tsx` に「対象が compact ではない」主張を足す**

```tsx
  it("リポストの対象は compact ではなく full で描く", () => {
    // 捕まえる変異: variant="compact" に戻す。v0 は対象を完全な Event として
    // 描いており (showReactions showActions 付き)、compact にすると対象の
    // 返信先・引用・リアクション一覧が消える (仕様 3 節)。
    const events = createRecordingEventRequests();
    const targetId = signed(40).id;
    const event = signed(41, {
      kind: 6,
      tags: [["e", targetId, "wss://relay/"]],
      content: "",
    });
    const { element, dispose } = mount(
      () => RepostFull({ event }),
      contextWith(events),
    );
    try {
      expect(
        element().querySelector(
          '[data-testid="event-view"][data-variant="full"]',
        ),
      ).not.toBeNull();
      expect(
        element().querySelector(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).toBeNull();
    } finally {
      dispose();
    }
  });
```

- [ ] **Step 3: `Reaction.tsx` を書く**

見出しの反応内容は v0 の `ReactionUserName.tsx` に合わせる。

```tsx
import { Match, Show, Switch, createSignal } from "solid-js";
import type { Component } from "solid-js";
import { type ReactionContent, parseReaction } from "../../../core/nostr/reaction";
import { useRender } from "../../../core/view/render-context";
import type { EventBodyProps } from "../../../core/view/renderer-registry";
import EventView from "../EventView";
import Profile from "../Profile";

/**
 * 見出しに出す反応内容そのもの (仕様 3.1 節の表)。
 *
 * `content` を先に取り出してから分岐するのは、`<Match when={...}>` の中で
 * `props.content.type` を毎回書き直すと TypeScript の絞り込みが効かず、
 * 分岐の中で再度 type を確かめる冗長なコードになるため。
 */
const ReactionMark: Component<{ content: ReactionContent }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  const emoji = () =>
    props.content.type === "emoji" ? props.content : undefined;
  const text = () => (props.content.type === "text" ? props.content : undefined);

  return (
    <Switch>
      <Match when={props.content.type === "like"}>
        <span
          data-testid="reaction-like"
          class="i-material-symbols:favorite-rounded c-accent-5 aspect-square h-5 w-auto shrink-0"
        />
      </Match>
      {/*
        絵文字の画像が落ちたらショートコードのテキストへ戻す —— 画像が 404 でも
        「何のリアクションか」が消えない (`NoteContent` の絵文字と同じ判断)。
      */}
      <Match when={emoji() && !broken()}>
        <img
          data-testid="reaction-emoji"
          src={emoji()?.url}
          alt={emoji()?.name}
          title={emoji()?.name}
          class="inline-block h-5 w-auto shrink-0"
          onError={() => setBroken(true)}
        />
      </Match>
      <Match when={emoji() && broken()}>
        <span class="h-5 shrink-0 truncate leading-5">{`:${emoji()?.name}:`}</span>
      </Match>
      <Match when={text()}>
        <span class="h-5 truncate leading-5">{text()?.content}</span>
      </Match>
    </Switch>
  );
};

/**
 * kind:7 の詳細表示 (仕様 3 節)。見出し 1 行と、対象イベントの**完全な**
 * 描画。対象を `compact` にしないのは、リアクションが見せたいのは
 * 「そのイベントそのもの」だからで、省略形にする理由が無い。
 *
 * 対象が分からない kind:7 (e タグが無い) は**何も描かない** —— 見出しだけ
 * 出しても「誰かが何かにリアクションした」以上の意味が無い。
 */
export const ReactionFull: Component<EventBodyProps> = (props) => {
  const ctx = useRender();
  const parsed = () => parseReaction(props.event);

  return (
    <Show when={parsed()}>
      {(reaction) => (
        <article data-testid="reaction" class="pt-1 pr-2 pb-1 pl-1 text-body">
          <p
            data-testid="reacted-by"
            class="c-secondary flex items-center gap-1 text-caption"
          >
            <ReactionMark content={reaction().content} />
            <Profile
              pubkey={props.event.pubkey}
              store={ctx.store}
              requests={ctx.profiles}
            />
            <span class="shrink-0">がリアクション</span>
          </p>
          <EventView id={reaction().targetId} variant="full" />
        </article>
      )}
    </Show>
  );
};

/**
 * kind:7 の小型表示。見出しだけで対象は描かない —— `NoteCompact` と同じ
 * 理由で、compact は関連イベントを一切要求しない。
 */
export const ReactionCompact: Component<EventBodyProps> = (props) => {
  const ctx = useRender();
  const parsed = () => parseReaction(props.event);

  return (
    <Show when={parsed()}>
      {(reaction) => (
        <article data-testid="reaction" class="text-caption">
          <p
            data-testid="reacted-by"
            class="c-secondary flex items-center gap-1"
          >
            <ReactionMark content={reaction().content} />
            <Profile
              pubkey={props.event.pubkey}
              store={ctx.store}
              requests={ctx.profiles}
            />
            <span class="shrink-0">がリアクション</span>
          </p>
        </article>
      )}
    </Show>
  );
};
```

`index.ts` に足す:

```ts
  defineRenderer({ kind: 7, full: ReactionFull, compact: ReactionCompact }),
```

- [ ] **Step 4: `Reaction.test.tsx` を書く**

`Note.test.tsx` の `mount` / `contextWith` / `signed` をそのまま真似ること。

| 主張 | 捕まえる変異 |
|---|---|
| 見出しと対象の `full` な `EventView` が出る | 対象を描かない / compact にする |
| `e` タグが無い kind:7 は何も描かない | 見出しだけ描く（意味の無い行が並ぶ） |
| `+` でハートアイコンが出る | 反応内容を見ずに常にテキストを出す |
| カスタム絵文字で `<img>` が出る | テキストのまま出す |
| compact は対象の `EventView` を出さない | compact でも対象を描く（関連イベント要求の規則が壊れる） |

- [ ] **Step 5: ゲートと変異検証、コミット**

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git commit -m "feat(v1): render reactions and give reposts their full target"
```

---

### Task 5: リアクション一覧

**Files:**
- Create: `src/routes/v1/ReactionList.tsx`
- Create: `src/routes/v1/ReactionList.test.tsx`
- Modify: `src/core/view/render-context.tsx`（`reactions: ReactionRequests` を足す）
- Modify: `src/routes/v1/renderers/Note.tsx`（本文の下に置く）
- Modify: `src/routes/v1.tsx` と `src/routes/debug/v1-section.tsx`（context へ配線）
- Modify: 既存のテストの `RenderContextValue` リテラル（**必須フィールドを足すと
  全部型エラーになる**。`Note.test.tsx` / `NoteContent.test.tsx` /
  `EventView.test.tsx` / `Avatar.test.tsx` / `ColumnItems.test.tsx` /
  `UnknownKind.test.tsx` を確認すること）

**Interfaces:**
- Consumes: `groupReactions` / `ReactionGroup`（Task 2）、`ReactionRequests`（Task 3）
- Produces: `ReactionList: Component<{ eventId: string }>`（default export）

**仕様 5 節がすべて。**

- [ ] **Step 1: `render-context.tsx` に `reactions` を足す**

```ts
export type RenderContextValue = {
  store: EventStore;
  events: EventRequests;
  profiles: ProfileRequests;
  reactions: ReactionRequests;
  renderers: readonly EventRenderer[];
};
```

**既存のテストがこの型のリテラルを書いているので、全部に `reactions` を足す。**
テスト用の最小実装はこの形:

```ts
const fakeReactions = (): ReactionRequests => ({
  request() {},
  reactionsOf() {
    return [];
  },
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});
```

- [ ] **Step 2: 失敗するテストを書く**

`ReactionList.test.tsx`。`reactionsOf` が値を返すテストダブルを渡す。

| 主張 | 捕まえる変異 |
|---|---|
| リアクションが 0 件なら何も描かない | 空でも枠を描く（0 件の枠が全ノートに並ぶ） |
| 同じ内容がまとまり件数が出る | グループ化せず 1 件 1 枠にする |
| マウント時に `request(eventId)` を呼ぶ | 呼ばない（一覧が永久に空） |
| 展開すると押した人が出る | 展開しても何も変わらない |

- [ ] **Step 3: `ReactionList.tsx` を書く**

v0 の `ReactionButtons.tsx` / `ReactionButton.tsx` の**描画部分**を写す。
**`+` の絵文字ピッカーと送信は書かない**（仕様 2 節、範囲外）。

- `<Show when={groups().length > 0}>` で包む
- 各グループ: `b-1 rounded p-0.5` の枠に「反応内容 + 件数」
- 展開トグル: `i-material-symbols:arrow-drop-down-rounded`、
  `group-not-hover/event:hidden` でホバー時だけ出す。展開中は `flex-col`
- 展開時は各グループの右に `@name, @name (2)`
- マウント時に `ctx.reactions.request(props.eventId)`、`ctx.reactions.subscribe`
  で再描画（`profile-data.ts` の `createEffect` の形を真似る。**effect の中で
  自分が set するシグナルを読まないこと** —— 無限ループになる）

`data-testid`: 一覧の器に `reaction-list`、1 グループに `reaction-group`、
件数に `reaction-count`、展開トグルに `reaction-expand`。

- [ ] **Step 4: `Note.tsx` に載せる**

`NoteBody` の `children`（今は引用カード）の**後**に置く。`NoteFull` からのみ渡す
—— **`NoteCompact` には出さない**（compact は関連イベントを一切要求しない）。

- [ ] **Step 5: `v1.tsx` と `debug/v1-section.tsx` を配線**

**`read-layer.ts` に持たせる。** `ProfileRequests` が既にそこで作られ、
`dispose()` もそこでまとめられているので、同じ場所に置くのが一貫している
(`createReadLayer` の戻り値に `reactions` を足し、`dispose` で
`reactions.dispose()` も呼ぶ)。`v1.tsx` と `debug/v1-section.tsx` は
`readLayer` から受け取って `RenderProvider` の値へ渡すだけになる。

- [ ] **Step 6: ゲートと変異検証、コミット**

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git commit -m "feat(v1): show the reactions on a note"
```

---

### Task 6: e2e と記録

**Files:**
- Modify: `e2e/fixtures/seed-preview.ts`（kind:7 を足す）
- Modify: `e2e/v1.spec.ts`
- Modify: `docs/design/read-layer-followups.md`

- [ ] **Step 1: フィクスチャに kind:7 を足す**

`seed-preview.ts` に、`previewQuoteTargetNoteText` のノートへの
リアクションを 3 件（`+` が 2 人、カスタム絵文字が 1 人）足す。
`previewAuthorOne` / `previewAuthorTwo` / `previewViewer` の鍵を使う。
**タイムラインに流れる kind:7 も 1 件**（`related` 列が kinds に 7 を含むよう
`seedRelatedEventsDeck` のフィルタへ 7 を足す）。

- [ ] **Step 2: e2e を足す**

`e2e/v1.spec.ts` の「reposts, quotes, and replies」のテストへ足すか、新しい
test にする。主張:

- **タイムラインに「@x がリアクション」と対象ノートが出る**
  捕まえる変異: kind:7 のレンダラを登録しない（`unknown-kind` に落ちる）
- **ノートに付いたリアクションが件数付きで出る**（`reaction-group` が 2 つ、
  `+` の山の `reaction-count` が `2`）
  捕まえる変異: 集計せず 1 件 1 枠にする
- **リポストの対象が `full` で出る**（`event-view[data-variant="full"]` が
  リポストの中にある）
  捕まえる変異: `compact` へ戻す

- [ ] **Step 3: 仕様 9 節の 3 問に答える**

`docs/design/read-layer-followups.md` に新しい節を作る。

- **問い 1（`#e` のコアレッサが 1 バッチで何件か）** は `lastBatchSize` /
  `maxBatchSize` を開発者モードへ出せば測れる。**出すところまでやる**
  （`v1.tsx` の診断に `profileBatch` と同じ形で `reactionBatch` を足す）
- **問い 2（リポストの対象を完全に描くと DOM がどれだけ増えるか）** と
  **問い 3（リアクションの多いノートで一覧が何行になるか）** は実鍵が要る。
  **「未取得」と書き、何を見れば答えられるかを書く。推測を書かない。**

- [ ] **Step 4: ゲート、コミット**

```bash
pnpm vitest run && pnpm typecheck && pnpm check
pnpm exec playwright test e2e/v1.spec.ts
git commit -m "test(v1): assert reactions render and group"
```

---

## 検証

完了時に人間へ依頼すること。

1. `pnpm dev` → `/v1` を実鍵で開き、**v0（`/`）と並べてリポスト・リアクションの
   見た目を比べる**
2. **リアクションの多いノートで一覧が読めるか**（カラム幅 400px）
3. **リポストの多いタイムラインで重くなっていないか** —— 直前のスライスで
   段階的レンダリングを入れたが、リポスト 1 件が 2 ノート分になる
4. 開発者モードの `reactionBatch` の最大値（`#e` のフィルタ長）
