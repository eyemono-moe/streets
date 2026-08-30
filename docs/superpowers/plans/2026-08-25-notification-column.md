# 通知カラム 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自分宛（`#p`）のイベントを集める通知カラムを追加し、`/v1` から作れるようにする。

**Architecture:** デッキには `{ kind: "notifications" }` という意図だけを保存し、`resolveSource` が「自分の read リレー（無ければ fallback）へ `{ kinds: [1,6,7], "#p": [自分] }` を投げるクエリ」へ展開する。自分が著者のイベントは NIP-01 のフィルタで表せないので、表示直前に純関数で捨てる。

**Tech Stack:** SolidJS / TypeScript / valibot / Vitest / Playwright / UnoCSS / pnpm

**Spec:** [`docs/superpowers/specs/2026-08-25-notification-column-design.md`](../specs/2026-08-25-notification-column-design.md)

## Global Constraints

- **通知が集める kind は `[1, 6, 7]`。** kind:16 は入れない（仕様 2.3 節）。
- **購読先は閲覧者の NIP-65 read リレー。0 本なら `FALLBACK_RELAYS`。** 空配列をそのまま `relays` に載せてはならない（「リレー 0 本の明示指定」になり永久に何も来ない）。
- **デッキに pubkey も read リレーも焼き込まない。** 保存するのは `{ kind: "notifications" }` のみ。
- **`resolveSource` は `readRelays()` を `kind === "notifications"` の分岐の中でだけ呼ぶ。** `literal` / `followees` の解決で呼ぶと、Solid の `createMemo` が warmUp のリソースを依存として記録し、ウォームアップが settle するたびに全カラムが再購読される。
- **自分の行動の除外は「イベントの著者が閲覧者か」の 1 条件。** kind ごとに分岐しない。
- **コメントは非自明な WHY だけ。** WHAT・変更履歴・タスク ID は書かない。
- **型検査は `pnpm typecheck`。** `pnpm exec tsc --noEmit` はルートの `tsconfig.json` が `files: []` + project references なので何も検査しない。
- **各タスクの終わりに `pnpm typecheck` と `pnpm exec vitest run` が緑であること。** 型を壊したまま次のタスクへ渡さない。
- **テストには「捕まえる変異」をコメントで書き、実際にその変異を入れて赤くなることを確認する。** 確認していないものを書かない。

---

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `src/core/deck/deck.ts` | `NOTIFICATION_KINDS` の定義、`ColumnSource` の variant、valibot スキーマ |
| `src/core/deck/resolve-source.ts` | 意図 → クエリの変換。`notifications` 分岐を足す |
| `src/core/deck/notification-filter.ts`（新規） | 自分の行動を落とす純関数 |
| `src/core/deck/column-alerts.ts` | 自分の kind:10002 が無いときの警告を足す |
| `src/routes/v1/column-presets.ts` | `buildColumn("notifications")` |
| `src/routes/v1/AddColumnForm.tsx` | 種別の選択肢に「通知」を足す |
| `src/routes/v1/DeckColumn.tsx` | `viewer` / `readRelays` の受け取り、除外の適用、警告の引数 |
| `src/routes/v1.tsx` | `viewer` / `readRelays` を `DeckColumn` へ渡す |
| `e2e/fixtures/seed-notification.ts`（新規） | 通知の e2e フィクスチャ |
| `e2e/notification.spec.ts`（新規） | 通知カラムの e2e |

---

## Task 1: 通知ソースの型と解決

デッキが `{ kind: "notifications" }` を保存でき、`resolveSource` がそれを read リレー付きのクエリへ展開する。**このタスクの終わりで型が通っている必要があるので、`ResolveContext` を広げたことによる既存の呼び出し側（テスト 9 箇所と `DeckColumn`）の更新まで含む。**

**Files:**
- Modify: `src/core/deck/deck.ts`
- Modify: `src/core/deck/resolve-source.ts`
- Modify: `src/core/deck/resolve-source.test.ts`
- Modify: `src/core/deck/deck.test.ts`
- Modify: `src/routes/v1/DeckColumn.tsx`
- Modify: `src/routes/v1.tsx`

**Interfaces:**
- Produces:
  - `NOTIFICATION_KINDS: readonly number[]`（`src/core/deck/deck.ts`）
  - `ColumnSource` に `| { kind: "notifications" }`
  - `ResolveContext = { followees: () => readonly string[]; viewer: string; readRelays: () => readonly RelayUrl[] }`
  - `DeckColumn` の props に `viewer: string` と `readRelays: () => readonly RelayUrl[]`

- [ ] **Step 1: `deck.ts` に `NOTIFICATION_KINDS` と variant を足す**

`TIMELINE_KINDS` の定義（`export const TIMELINE_KINDS: readonly number[] = [1, 6];`）の直後に足す:

```ts
/**
 * 通知カラムが集める kind (仕様 2 節)。
 *
 * kind:16 (汎用リポスト) を入れないのは、表示できないからではない ——
 * `Repost.tsx` は 16 で登録済みで、ここに 16 と書けばそれだけで並ぶ。
 * 対象が kind:1 以外 (長文など) で v1 はまだそれを作れず、開発中に自分で
 * 再現できないため e2e で動作を確かめられない
 * (`docs/design/read-layer-followups.md`「通知に kind:16 を含めること」)。
 *
 * `TIMELINE_KINDS` が 16 を外す理由 (短文の列へ長文を混ぜない) とは別の
 * 判断であることに注意 —— 通知は種類を混ぜる場所なので、あちらの理由は
 * ここには効かない。
 */
export const NOTIFICATION_KINDS: readonly number[] = [1, 6, 7];
```

`ColumnSource` を広げる:

```ts
export type ColumnSource =
  | { kind: "literal"; filters: RelayFilter[]; relays?: RelayUrl[] }
  | { kind: "followees"; kinds: number[] }
  | { kind: "notifications" };
```

`columnSourceSchema` の `v.variant("kind", [...])` の配列末尾に足す:

```ts
  v.object({
    kind: v.literal("notifications"),
  }),
```

`deckSchema` の `version` は **2 のまま**。variant が増えても既存の保存済みデッキは読めるので、上げると読めていたデッキを捨てることになる。

- [ ] **Step 2: スキーマの往復テストを書いて落ちることを見る**

`src/core/deck/deck.test.ts` の `describe("loadDeck / saveDeck", ...)` の中、`it("保存したものを読み戻せる", ...)` の直後に足す:

```ts
  it("notifications 列を読み戻せる", () => {
    // 捕まえる変異: columnSourceSchema に notifications の variant を
    // 足さない。保存はできてもリロードで **デッキ全体が** undefined になり
    // (valibot の variant は 1 つでも外れると全体が失敗)、通知カラムを
    // 足したユーザーは次の起動でカラムを全部失う。
    const withNotifications = {
      version: 2 as const,
      columns: [
        { id: "n", title: "通知", source: { kind: "notifications" as const } },
      ],
    };
    expect(loadDeck(saveDeck(withNotifications))).toEqual(withNotifications);
  });
```

Run: `pnpm exec vitest run src/core/deck/deck.test.ts`
Expected: Step 1 を先に入れてあれば PASS。**先にこのテストだけを書いて赤を見たい場合は Step 1 の `columnSourceSchema` への追記だけ戻して確認し、戻すこと。**

- [ ] **Step 3: `resolve-source.ts` の `ResolveContext` を広げる**

`resolve-source.ts` の冒頭の import に足す（`deck.ts` は `resolve-source.ts` を import していないので循環しない）:

```ts
import { FALLBACK_RELAYS } from "../read/default-relays";
import type { RelayUrl } from "../relay/relay-connection";
import { NOTIFICATION_KINDS, type ColumnSource } from "./deck";
```

`ResolveContext` を次に変える。**既存の doc コメント（`followees` を遅延アクセサにしている理由）はそのまま残し、`readRelays` の理由を足す。**

```ts
export type ResolveContext = {
  followees: () => readonly string[];
  /**
   * 現在の閲覧者。`notifications` の `#p` の値になる。
   *
   * 遅延アクセサにしないのは `followees` / `readRelays` と違ってこれが
   * 「変わる値」ではないため —— ログイン中は固定で、同期的に読めるので、
   * どの分岐で読んでも再購読を招かない。
   */
  viewer: string;
  /**
   * 閲覧者の NIP-65 read リレー。`followees` と同じ理由で遅延アクセサに
   * している —— これを `kind: "notifications"` の分岐の外で呼ぶと、
   * `literal` 列の解決でも warmUp のリソースを読んだことになり、
   * ウォームアップが settle するたびに全カラムが再購読される。
   */
  readRelays: () => readonly RelayUrl[];
};
```

- [ ] **Step 4: `resolveSource` に `notifications` 分岐を足す**

`if (source.kind === "followees") { ... }` のブロックの直後、`literal` へ落ちる `return` の前に足す:

```ts
  if (source.kind === "notifications") {
    // `#p` フィルタには `authors` が無いので Outbox でルーティングできない
    // (`query-plan.ts`: 著者を指定していないフィルタは fallback へ同報)。
    // NIP-65 は publish 側に「`#p` で指した相手の read リレーへも送る」を
    // SHOULD で求めているので、待ち受けるべきはそこ ——
    // `docs/design/notification-relay-selection.md` に原文と各クライアントの
    // 実態を残してある。
    const relays = context.readRelays();
    return {
      type: "nostr",
      filters: [{ kinds: [...NOTIFICATION_KINDS], "#p": [context.viewer] }],
      // 空を素通しにしない。`authors: []` と同じ罠で、空配列は「該当なし」
      // であって「未指定」ではない —— `relays: []` は「リレー 0 本の明示
      // 指定」として扱われ、通知が永久に来ない。
      relays: relays.length > 0 ? [...relays] : [...FALLBACK_RELAYS],
    };
  }
```

- [ ] **Step 5: `resolve-source.test.ts` を新しい `ResolveContext` に合わせ、通知のテストを足す**

ファイル冒頭の import を次に変える:

```ts
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_RELAYS } from "../read/default-relays";
import { type ResolveContext, resolveSource } from "./resolve-source";
```

`describe` の直前にヘルパを足す。**既存 9 箇所の呼び出しは `{ followees: () => [...] }` を `ctx({ followees: () => [...] })` に機械的に置き換える。**

```ts
const VIEWER = "f".repeat(64);

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  followees: () => [],
  viewer: VIEWER,
  readRelays: () => [],
  ...over,
});
```

そのうえで、`describe("resolveSource", ...)` の末尾に 3 本足す:

```ts
  it("notifications は自分宛を read リレーで待つ", () => {
    // 捕まえる変異: `#p` に viewer ではなく空配列を入れる (誰にもマッチ
    // しないカラムになる) / kinds を [1] だけにする (リアクションと
    // リポストの通知が丸ごと消える)
    expect(
      resolveSource(
        { kind: "notifications" },
        ctx({ readRelays: () => ["wss://inbox/"] }),
      ),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1, 6, 7], "#p": [VIEWER] }],
      relays: ["wss://inbox/"],
    });
  });

  it("read リレーが 0 本なら fallback へ落とす", () => {
    // 捕まえる変異: `relays: []` をそのまま載せる。空配列は
    // 「リレー 0 本の明示指定」として扱われるので、通知が永久に来ない
    // カラムが黙って出来上がる (`authors: []` と同じ罠)。
    expect(
      resolveSource({ kind: "notifications" }, ctx({ readRelays: () => [] })),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1, 6, 7], "#p": [VIEWER] }],
      relays: [...FALLBACK_RELAYS],
    });
  });

  it("readRelays は notifications の分岐でだけ呼ばれる", () => {
    // 捕まえる変異: 分岐の外 (関数の先頭など) で `context.readRelays()` を
    // 呼ぶ。**動作としては正しいままなので、他のどのテストも落ちない** ——
    // 落ちるのは実行時の挙動で、`literal` 列の source memo が warmUp の
    // リソースを依存として記録し、ウォームアップが settle するたびに
    // 全カラムの SectionReader が破棄・再作成される。同型の事故が
    // `followees` で一度起きている (resolve-source.ts のコメント参照)。
    const readRelays = vi.fn(() => []);

    resolveSource(
      { kind: "literal", filters: [{ kinds: [1] }] },
      ctx({ readRelays }),
    );
    expect(readRelays).not.toHaveBeenCalled();

    resolveSource({ kind: "followees", kinds: [1] }, ctx({ readRelays }));
    expect(readRelays).not.toHaveBeenCalled();

    resolveSource({ kind: "notifications" }, ctx({ readRelays }));
    expect(readRelays).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 6: テストを走らせて通ることを見る**

Run: `pnpm exec vitest run src/core/deck/`
Expected: PASS

- [ ] **Step 7: 変異を実際に入れて赤くなることを確認する**

3 つとも 1 つずつ入れて、狙ったテストだけが落ちることを見る。確認したら必ず戻す。

1. `resolveSource` の `notifications` 分岐で `relays: [...relays]`（fallback を消す）→「read リレーが 0 本なら fallback へ落とす」が落ちる
2. `NOTIFICATION_KINDS` を `[1]` にする →「notifications は自分宛を read リレーで待つ」が落ちる
3. `resolveSource` の関数先頭に `const _ = context.readRelays();` を足す →「readRelays は notifications の分岐でだけ呼ばれる」が落ちる

Run: 各変異ごとに `pnpm exec vitest run src/core/deck/resolve-source.test.ts`

- [ ] **Step 8: `DeckColumn` に props を足し、`resolveSource` の呼び出しを直す**

`src/routes/v1/DeckColumn.tsx` の props（`followees: () => readonly string[];` の直後）に足す:

```tsx
  /**
   * 現在の閲覧者。`source` が `kind: "notifications"` のとき
   * `resolveSource` がこれを `#p` へ展開する。
   */
  viewer: string;
  /**
   * 閲覧者の NIP-65 read リレー。通知カラムの購読先になる
   * (仕様 3 節)。デッキはこれを焼き込まないので、リレー設定を変えれば
   * 呼び出し元がこの関数を最新の値で呼び直すだけで反映される。
   */
  readRelays: () => readonly RelayUrl[];
```

`RelayUrl` の import が無ければ足す:

```tsx
import type { RelayUrl } from "../../core/relay/relay-connection";
```

`source` memo の `resolveSource` 呼び出しを直す。**既存コメント（`followees` を呼ばずに渡す理由）はそのまま残し、`readRelays` も同じ扱いであることを 1 行足す。**

```tsx
    const resolved = resolveSource(props.column.source, {
      followees: props.followees,
      viewer: props.viewer,
      readRelays: props.readRelays,
    });
```

- [ ] **Step 9: `v1.tsx` から渡す**

`src/routes/v1.tsx` の `<DeckColumn ... />`、`followees={() => warmUp()?.followees ?? []}` の直後に足す:

```tsx
                    viewer={pubkey() ?? ""}
                    readRelays={() => {
                      // `warmUp()` を読むのは依存を作るため ——
                      // `routing.readRelaysFor` は EventStore を同期的に
                      // 読むだけでシグナルではないので、これが無いと
                      // 自分の kind:10002 が届いてもこの memo が再計算
                      // されず、通知カラムは fallback を見たままになる。
                      warmUp();
                      const pk = pubkey();
                      return pk ? routing.readRelaysFor(pk) : [];
                    }}
```

`viewer={pubkey() ?? ""}` の `?? ""` は、この `<For>` が `<Show when={pubkey()}>` の中にあるので実際には到達しない。型を通すためのもの。

- [ ] **Step 10: 型検査と全テスト**

Run: `pnpm typecheck && pnpm exec vitest run`
Expected: 両方 PASS

- [ ] **Step 11: Commit**

```bash
git add src/core/deck/ src/routes/v1/DeckColumn.tsx src/routes/v1.tsx
git commit -m "feat(v1): 通知ソースを read リレーへ解決する"
```

---

## Task 2: 自分の行動を落とす

**Files:**
- Create: `src/core/deck/notification-filter.ts`
- Create: `src/core/deck/notification-filter.test.ts`
- Modify: `src/routes/v1/DeckColumn.tsx`

**Interfaces:**
- Consumes: `ColumnSource`（Task 1 で `notifications` variant が入っている）
- Produces: `excludeOwnActions(events: readonly NostrEvent[], viewer: string): NostrEvent[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/deck/notification-filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { excludeOwnActions } from "./notification-filter";

const VIEWER = "a".repeat(64);
const OTHER = "b".repeat(64);

const evt = (id: string, pubkey: string): NostrEvent =>
  ({
    id,
    pubkey,
    created_at: 1,
    kind: 1,
    tags: [],
    content: "",
    sig: "",
  }) as NostrEvent;

describe("excludeOwnActions", () => {
  it("閲覧者が著者のイベントだけを落とす", () => {
    // 捕まえる変異: 比較の向きを逆にする (他人の反応が全部消えてカラムが
    // 空になる) / 何も落とさない (自分の投稿に自分でリアクションすると
    // 通知に自分が並ぶ)
    expect(
      excludeOwnActions(
        [evt("mine", VIEWER), evt("theirs", OTHER)],
        VIEWER,
      ).map((event) => event.id),
    ).toEqual(["theirs"]);
  });

  it("順序を変えない", () => {
    // 捕まえる変異: sort や reverse を挟む。並び順はセクションが
    // created_at 降順で決めており、ここは通すだけの層である。
    expect(
      excludeOwnActions(
        [evt("c", OTHER), evt("a", OTHER), evt("b", OTHER)],
        VIEWER,
      ).map((event) => event.id),
    ).toEqual(["c", "a", "b"]);
  });
});
```

- [ ] **Step 2: 落ちることを見る**

Run: `pnpm exec vitest run src/core/deck/notification-filter.test.ts`
Expected: FAIL（`Failed to resolve import "./notification-filter"`）

- [ ] **Step 3: 実装する**

`src/core/deck/notification-filter.ts`:

```ts
import type { NostrEvent } from "../nostr/event";

/**
 * 自分の行動を通知から落とす (仕様 2.2 節)。
 *
 * NIP-01 のフィルタは「著者が自分**でない**」を表せない (`authors` は
 * 許可リストであって拒否リストではない) ので、リレーから届いたものを
 * 手元で捨てるしかない。
 *
 * kind ごとに分岐しないのは、返信者・リポストした人・リアクションした人が
 * いずれもそのイベントの著者だから —— 「誰がやったか」は kind:1/6/7 の
 * どれでも `pubkey` に出る。
 *
 * **UI から切り出しているのは、「誰を落とすか」をブラウザ無しで固定する
 * ため** (`column-presets.ts` と同じ理由)。
 */
export const excludeOwnActions = (
  events: readonly NostrEvent[],
  viewer: string,
): NostrEvent[] => events.filter((event) => event.pubkey !== viewer);
```

- [ ] **Step 4: 通ることを見る**

Run: `pnpm exec vitest run src/core/deck/notification-filter.test.ts`
Expected: PASS

- [ ] **Step 5: 変異を入れて赤くなることを確認する**

`event.pubkey !== viewer` を `event.pubkey === viewer` にして「閲覧者が著者のイベントだけを落とす」が落ちること、`.filter(...).sort((a, b) => a.id.localeCompare(b.id))` にして「順序を変えない」が落ちることを見る。確認したら戻す。

- [ ] **Step 6: `DeckColumn` で適用する**

`src/routes/v1/DeckColumn.tsx` の import に足す:

```tsx
import { excludeOwnActions } from "../../core/deck/notification-filter";
```

`items` memo の `return [...optimistic, ...fromSection];` を次に変える:

```tsx
    const merged = [...optimistic, ...fromSection];
    // 通知列でだけ自分の行動を落とす (仕様 2.2 節)。**捨てるのはセクションが
    // 保持した後**なので、保持上限 200 件は捨てる前の件数で数えている ——
    // 自分の行動が多いと見える件数がそのぶん減る。仕様 5.1 節がこの代償を
    // 受け入れた判断として記録している。
    return props.column.source.kind === "notifications"
      ? excludeOwnActions(merged, props.viewer)
      : merged;
```

- [ ] **Step 7: 型検査と全テスト**

Run: `pnpm typecheck && pnpm exec vitest run`
Expected: 両方 PASS

- [ ] **Step 8: Commit**

```bash
git add src/core/deck/notification-filter.ts src/core/deck/notification-filter.test.ts src/routes/v1/DeckColumn.tsx
git commit -m "feat(v1): 通知から自分の行動を落とす"
```

---

## Task 3: リレー設定が無いことを黙らせない

自分の kind:10002 が引けないと通知は fallback の 3 本を見ることになる。**通知は「届いていないこと」に気づきにくい**（誰も反応していないのか、見る場所が違うのか、画面から区別が付かない）ので、ADR-0011 に従って表に出す。

**Files:**
- Modify: `src/core/deck/column-alerts.ts`
- Modify: `src/core/deck/column-alerts.test.ts`
- Modify: `src/routes/v1/DeckColumn.tsx`

**Interfaces:**
- Consumes: `ColumnDef`, `SectionStatus`
- Produces: `columnAlerts(column: ColumnDef, status: SectionStatus, context: { viewerRelayListMissing: boolean }): ColumnAlert[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/deck/column-alerts.test.ts` の既存の 2 つの `ColumnDef` 定義の下に足す:

```ts
const notifications: ColumnDef = {
  id: "c",
  title: "通知",
  source: { kind: "notifications" },
};
```

`describe` の末尾に 3 本足す:

```ts
  it("通知列で自分のリレー設定が無ければ知らせる", () => {
    // 捕まえる変異: この警告を出さない。通知が来ないとき、誰も反応して
    // いないのか自分の kind:10002 が無くて fallback を見ているのか、
    // 画面からは区別が付かない (ADR-0011: 劣化を隠さない)。
    expect(
      columnAlerts(notifications, status(), { viewerRelayListMissing: true }),
    ).toHaveLength(1);
  });

  it("リレー設定が引けていれば知らせない", () => {
    // 捕まえる変異: context を見ずに常に出す (通知列を出した全員に
    // 意味の無い警告が付く)
    expect(
      columnAlerts(notifications, status(), { viewerRelayListMissing: false }),
    ).toEqual([]);
  });

  it("通知以外の列では出さない", () => {
    // 捕まえる変異: source.kind を見ない。ホーム列や明示リレー列は
    // 自分の kind:10002 を必要としないので、そこに出しても
    // ADR-0026 の「ユーザーが行動できるもの」にならない。
    expect(
      columnAlerts(routed, status(), { viewerRelayListMissing: true }),
    ).toEqual([]);
    expect(
      columnAlerts(explicit, status(), { viewerRelayListMissing: true }),
    ).toEqual([]);
  });
```

**既存の `columnAlerts(...)` 呼び出し（第 3 引数が無いもの）はすべて `, { viewerRelayListMissing: false }` を足す。**

- [ ] **Step 2: 落ちることを見る**

Run: `pnpm exec vitest run src/core/deck/column-alerts.test.ts`
Expected: FAIL（型エラー、または新しい 3 本が落ちる）

- [ ] **Step 3: 実装する**

`src/core/deck/column-alerts.ts` の関数シグネチャを変え、既存の `if` の後に足す:

```ts
export const columnAlerts = (
  column: ColumnDef,
  status: SectionStatus,
  context: { viewerRelayListMissing: boolean },
): ColumnAlert[] => {
```

```ts
  // 通知は「届いていないこと」に気づきにくい —— 誰も反応していないのか、
  // 見る場所が違うのか、画面からは区別が付かない。自分の kind:10002 が
  // 無いと fallback の 3 本を見ることになるので、そこは黙らせない
  // (ADR-0011)。リレー設定の publish はユーザーが取れる行動なので
  // ADR-0026 の条件も満たす。
  if (source.kind === "notifications" && context.viewerRelayListMissing) {
    alerts.push({
      message:
        "あなたのリレー設定 (kind:10002) が見つからないため、既定のリレーで待っています",
      action:
        "通知が届かない場合は、リレー設定を publish しているか確認してください",
    });
  }
```

- [ ] **Step 4: 通ることを見る**

Run: `pnpm exec vitest run src/core/deck/column-alerts.test.ts`
Expected: PASS

- [ ] **Step 5: 変異を入れて赤くなることを確認する**

`source.kind === "notifications" &&` を削って「通知以外の列では出さない」が落ちること、`context.viewerRelayListMissing` を `true` に固定して「リレー設定が引けていれば知らせない」が落ちることを見る。確認したら戻す。

- [ ] **Step 6: `DeckColumn` の呼び出しを直す**

`src/routes/v1/DeckColumn.tsx` の `alerts` memo:

```tsx
  const alerts = createMemo(() =>
    columnAlerts(props.column, activeSection().status(), {
      viewerRelayListMissing: props.readRelays().length === 0,
    }),
  );
```

**ここで `props.readRelays()` を呼ぶのは意図的で、`resolveSource` の制約とは別**。`alerts` memo が warmUp を依存に持つのは正しい（リレー設定が届いたら警告が消えるべき）。避けたいのは `source` memo が依存を持つこと（そちらは再購読を起こす）で、この memo は購読を作らない。

- [ ] **Step 7: 型検査と全テスト**

Run: `pnpm typecheck && pnpm exec vitest run`
Expected: 両方 PASS

- [ ] **Step 8: Commit**

```bash
git add src/core/deck/column-alerts.ts src/core/deck/column-alerts.test.ts src/routes/v1/DeckColumn.tsx
git commit -m "feat(v1): リレー設定が無いまま通知を待っていることを知らせる"
```

---

## Task 4: 通知カラムを追加できるようにする

**Files:**
- Modify: `src/routes/v1/column-presets.ts`
- Modify: `src/routes/v1/column-presets.test.ts`
- Modify: `src/routes/v1/AddColumnForm.tsx`

**Interfaces:**
- Consumes: `ColumnSource` の `notifications` variant（Task 1）
- Produces: `buildColumn("notifications", input)` が `{ id, title: "通知", source: { kind: "notifications" } }` を返す

- [ ] **Step 1: 失敗するテストを書く**

`src/routes/v1/column-presets.test.ts` の `describe("buildColumn", ...)` に足す:

```ts
  it("notifications は意図だけを保存する", () => {
    // 捕まえる変異: フィルタや pubkey を焼き込む。read リレーを焼き込むと
    // リレーを移したユーザーの通知列は作り直すまで古い場所を見続ける ——
    // 2026-08-06 に「フォローしてもホーム列が反映されない」として実際に
    // 起きた壊れ方と同型 (resolve-source.ts のコメント参照)。
    expect(buildColumn("notifications", "")?.source).toEqual({
      kind: "notifications",
    });
  });

  it("notifications は入力を見ずに成功する", () => {
    // 捕まえる変異: 入力を必須にする。AddColumnForm は NEEDS_INPUT が
    // false の種別に入力欄を出さないので、必須にすると「押しても何も
    // 起きないボタン」になる。
    expect(buildColumn("notifications", "")).toBeDefined();
    expect(buildColumn("notifications", "  ")).toBeDefined();
  });
```

- [ ] **Step 2: 落ちることを見る**

Run: `pnpm exec vitest run src/routes/v1/column-presets.test.ts`
Expected: FAIL（型エラー: `"notifications"` は `ColumnPresetKind` に無い）

- [ ] **Step 3: 実装する**

`src/routes/v1/column-presets.ts`:

```ts
export type ColumnPresetKind =
  | "home"
  | "user"
  | "hashtag"
  | "global"
  | "notifications";
```

`switch` の `case "global":` の後に足す:

```ts
    case "notifications":
      // フィールドを持たない —— pubkey も read リレーもデッキに焼き込まず、
      // `resolveSource` が解決のたびに最新の値で組み立てる (仕様 4.1 節)。
      return { id, title: "通知", source: { kind: "notifications" } };
```

- [ ] **Step 4: 通ることを見る**

Run: `pnpm exec vitest run src/routes/v1/column-presets.test.ts`
Expected: PASS

- [ ] **Step 5: `AddColumnForm` に選択肢を足す**

`src/routes/v1/AddColumnForm.tsx` の 3 箇所:

```tsx
const KIND_LABELS: Record<ColumnPresetKind, string> = {
  home: "ホーム",
  user: "ユーザー",
  hashtag: "ハッシュタグ",
  global: "グローバル",
  notifications: "通知",
};
```

```tsx
const NEEDS_INPUT: Record<ColumnPresetKind, boolean> = {
  home: false,
  user: true,
  hashtag: true,
  global: false,
  notifications: false,
};
```

```tsx
const KINDS: ColumnPresetKind[] = [
  "home",
  "notifications",
  "user",
  "hashtag",
  "global",
];
```

`notifications` を `home` の隣に置くのは、どちらも「自分の列」で、`user` 以降の「他人・話題を指定する列」と性質が違うため。

- [ ] **Step 6: 型検査と全テスト**

Run: `pnpm typecheck && pnpm exec vitest run`
Expected: 両方 PASS

- [ ] **Step 7: 変異を入れて赤くなることを確認する**

`buildColumn` の `notifications` を `return undefined;` にして「notifications は入力を見ずに成功する」が落ちることを見る。確認したら戻す。

- [ ] **Step 8: Commit**

```bash
git add src/routes/v1/column-presets.ts src/routes/v1/column-presets.test.ts src/routes/v1/AddColumnForm.tsx
git commit -m "feat(v1): 通知カラムを追加できるようにする"
```

---

## Task 5: e2e

read リレー経由で通知が届き、**自分の行動が除外される**ことを実画面で確かめる。

**Files:**
- Create: `e2e/fixtures/seed-notification.ts`
- Create: `e2e/notification.spec.ts`
- Modify: `e2e/global-setup.ts`
- Modify: `e2e/fixtures/fixture-pubkeys.test.ts`

**Interfaces:**
- Consumes: Task 1〜4 の全部
- Produces: `seedNotificationFixture()`, `notificationViewerPubkey`, `notificationAuthorPubkey`, `notificationRelayUrl`, および本文の定数

- [ ] **Step 1: フィクスチャを書く**

`e2e/fixtures/seed-notification.ts`:

```ts
import { type EventTemplate, Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const notificationRelayUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";

const now = 1_735_689_600;

// 秘密鍵は `((seed + i * 7) % 255) + 1` から決定的に組み立てる。
// **`% 255` によりシード空間の実効幅は 255 しかない** ので、既存
// フィクスチャと mod 255 が衝突しない値を選ぶ (110_000 % 255 = 95,
// 110_100 % 255 = 195 — どちらも使用済みの集合に無い)。
// fixture-pubkeys.test.ts が pairwise distinctness を機械的に検証する。
const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(110_000);
const authorSecretKey = secretKey(110_100);

export const notificationViewerPubkey = getPublicKey(viewerSecretKey);
export const notificationAuthorPubkey = getPublicKey(authorSecretKey);

export const notificationOwnNoteText = "streets notification e2e own note";
export const notificationReplyText = "streets notification e2e reply";
export const notificationRepostText = "streets notification e2e repost";

const publishAndReturn = async (
  relay: Relay,
  template: EventTemplate,
  key: Uint8Array,
) => {
  const event = finalizeEvent(template, key);
  await relay.publish(event);
  return event;
};

/**
 * 通知カラムのフィクスチャ。
 *
 * **閲覧者の kind:10002 をこのリレーへ read として置くのが要**。通知の
 * 購読先は閲覧者の NIP-65 read リレーなので (仕様 3 節)、これが無いと
 * fallback の実在リレーへ接続しにいき、CI が外部ネットワークを叩く。
 *
 * **閲覧者自身のリアクションを 1 件混ぜている**。「自分の行動が出ない」の
 * 主張は、他人の同じ形のリアクションが同じ画面に出ていることと対にして
 * 初めて証拠になる —— 片側だけだと、カラムが空でもテストが通る。
 */
export const seedNotificationFixture = async (): Promise<void> => {
  const relay = await Relay.connect(notificationRelayUrl);
  try {
    await publishAndReturn(
      relay,
      {
        kind: 10002,
        created_at: now,
        tags: [["r", notificationRelayUrl, "read"]],
        content: "",
      },
      viewerSecretKey,
    );

    const ownNote = await publishAndReturn(
      relay,
      {
        kind: 1,
        created_at: now + 1,
        tags: [],
        content: notificationOwnNoteText,
      },
      viewerSecretKey,
    );

    // 他人からの返信 (kind:1)
    await publishAndReturn(
      relay,
      {
        kind: 1,
        created_at: now + 2,
        tags: [
          ["e", ownNote.id, notificationRelayUrl, "root"],
          ["p", notificationViewerPubkey],
        ],
        content: notificationReplyText,
      },
      authorSecretKey,
    );

    // 他人からのリアクション (kind:7)
    await publishAndReturn(
      relay,
      {
        kind: 7,
        created_at: now + 3,
        tags: [
          ["e", ownNote.id, notificationRelayUrl],
          ["p", notificationViewerPubkey],
        ],
        content: "+",
      },
      authorSecretKey,
    );

    // 他人からのリポスト (kind:6)
    await publishAndReturn(
      relay,
      {
        kind: 6,
        created_at: now + 4,
        tags: [
          ["e", ownNote.id, notificationRelayUrl],
          ["p", notificationViewerPubkey],
        ],
        content: JSON.stringify(ownNote),
      },
      authorSecretKey,
    );

    // 閲覧者自身のリアクション —— 除外されるべきもの。
    await publishAndReturn(
      relay,
      {
        kind: 7,
        created_at: now + 5,
        tags: [
          ["e", ownNote.id, notificationRelayUrl],
          ["p", notificationViewerPubkey],
        ],
        content: "🚫",
      },
      viewerSecretKey,
    );
  } finally {
    relay.close();
  }
};
```

- [ ] **Step 2: `global-setup.ts` に登録する**

`e2e/global-setup.ts` の import に足す:

```ts
import { seedNotificationFixture } from "./fixtures/seed-notification.js";
```

`globalSetup` の中、`await seedThreadFixture();` の直後に足す:

```ts
  await seedNotificationFixture();
```

- [ ] **Step 3: `fixture-pubkeys.test.ts` に足す**

import に足す:

```ts
import {
  notificationAuthorPubkey,
  notificationViewerPubkey,
} from "./seed-notification.js";
```

pubkey を並べている配列に `notificationViewerPubkey` と `notificationAuthorPubkey` を足す。

Run: `pnpm exec vitest run e2e/fixtures/fixture-pubkeys.test.ts`
Expected: PASS（衝突していれば FAIL。落ちたらシードを変える）

- [ ] **Step 4: e2e を書く**

`e2e/notification.spec.ts`:

```ts
import { type Page, expect, test } from "@playwright/test";
import {
  notificationAuthorPubkey,
  notificationRelayUrl,
  notificationReplyText,
  notificationViewerPubkey,
} from "./fixtures/seed-notification.js";

/**
 * ログインは `getPublicKey()` しか呼ばない (`v1.tsx` の `login()`) ので、
 * 本物の署名は要らない。この spec は何も publish しない。
 */
const stubReadOnlySigner = async (page: Page) => {
  await page.addInitScript((viewerPubkey: string) => {
    (window as typeof window & { nostr: unknown }).nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: async (event: Record<string, unknown>) => ({
        ...event,
        id: "playwright-notification-mock-event-id",
        pubkey: viewerPubkey,
        sig: "playwright-notification-mock-signature",
      }),
    };
  }, notificationViewerPubkey);
};

test("通知カラムは自分宛だけを集め、自分の行動を出さない", async ({
  page,
}) => {
  await stubReadOnlySigner(page);
  await page.goto(`/v1?relays=${encodeURIComponent(notificationRelayUrl)}`);
  await page.getByTestId("login").click();

  // UI から実際に足す —— buildColumn / AddColumnForm の配線まで通す
  // (e2e/v1.spec.ts の global 列追加と同じ手順)。
  await page.getByTestId("add-column").click();
  await expect(page.getByTestId("add-column-form")).toBeVisible();
  await page.getByTestId("add-column-kind-notifications").click();
  await page.getByTestId("add-column-submit").click();

  const column = page
    .getByTestId("deck-column")
    .filter({ hasText: "通知" })
    .first();

  // 他人からの返信が出る。
  await expect(column).toContainText(notificationReplyText, {
    timeout: 20_000,
  });

  const items = column.getByTestId("item");

  // 対照: 他人のリアクション (+) が出ている。**この主張が無いと、下の
  // 「自分のリアクションが出ない」はカラムが空でも通ってしまう。**
  await expect(items.filter({ hasText: "+" })).not.toHaveCount(0);

  // 自分のリアクション (🚫) は出ない。
  await expect(items.filter({ hasText: "🚫" })).toHaveCount(0);
});
```

使う testid はすべて既存のもの: `add-column` / `add-column-form` / `add-column-kind-<種別>` / `add-column-submit`（`AddColumnForm.tsx`）、`deck-column`（`DeckColumn.tsx`）、`item`（`ColumnItems.tsx`）。**`add-column-kind-notifications` は Task 4 で `KINDS` に `"notifications"` を足したことで自動的に生える**（`data-testid={`add-column-kind-${k}`}`）ので、実装側に testid を足す必要は無い。

- [ ] **Step 5: e2e を走らせる**

Run: `pnpm exec playwright test e2e/notification.spec.ts`
Expected: PASS

**バックグラウンドで走らせないこと。** 前景で実行し、出力を最後まで見る。

- [ ] **Step 6: 除外が実際に効いていることを確認する**

`DeckColumn.tsx` の `excludeOwnActions(merged, props.viewer)` を `merged` に変え、e2e が**落ちる**ことを見る。確認したら戻す。

Run: `pnpm exec playwright test e2e/notification.spec.ts`
Expected（変異あり）: FAIL（🚫 が 1 件出る）

- [ ] **Step 7: 全部を走らせる**

Run: `pnpm typecheck && pnpm exec vitest run && pnpm exec playwright test`
Expected: すべて PASS

- [ ] **Step 8: Commit**

```bash
git add e2e/
git commit -m "test(e2e): 通知カラムが自分宛だけを集めることを確かめる"
```

---

## Self-Review

**仕様の網羅**

| 仕様 | タスク |
| --- | --- |
| 2 節 フィルタ `{ kinds:[1,6,7], "#p":[自分] }` | Task 1 |
| 2.1 巻き添えを間引かない | 実装しないことが要件 —— 返信先を引く処理をどのタスクにも入れていない |
| 2.2 自分の行動を落とす | Task 2 |
| 2.3 kind:16 を入れない | Task 1 Step 1（`NOTIFICATION_KINDS` のコメント）+ followups に記録済み |
| 3 節 read リレー / fallback | Task 1 Step 4 |
| 4.1 デッキには意図だけ | Task 1 Step 1、Task 4 Step 3 |
| 4.2 `readRelays` は分岐の中だけ | Task 1 Step 3〜5（呼び出し範囲のテスト込み） |
| 4.3 カラムを足す UI | Task 4 |
| 5 節 除外の置き場所 | Task 2 |
| 5.1 保持上限の代償 | Task 2 Step 6 のコメントに記録 |
| 6 節 劣化の見せ方 | Task 3 |
| 7.1 ユニットテスト一覧 | Task 1・2・3・4 に分散（表の 7 行すべてに対応するテストがある） |
| 7.2 e2e | Task 5 |

**型の一貫性**: `NOTIFICATION_KINDS`（Task 1）、`ResolveContext`（Task 1）、`excludeOwnActions`（Task 2）、`columnAlerts` の第 3 引数（Task 3）、`ColumnPresetKind`（Task 4）は、後続タスクで使う名前と一致している。

**e2e の testid はすべて既存のものを確認済み**（`add-column`、`add-column-form`、`add-column-kind-<種別>`、`add-column-submit`、`deck-column`、`item`）。`add-column-kind-notifications` は Task 4 の `KINDS` への追加で自動的に生えるので、実装側に testid を足す作業は無い。
