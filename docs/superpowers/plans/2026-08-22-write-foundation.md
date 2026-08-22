# 書き込みの土台 — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kind ごとのイベントビルダ（純関数）と `Writer` seam を作り、v1 が kind:1 の新規投稿以外を書けるようにする。

**Architecture:** kind 固有のタグ規則は `src/core/nostr/build/` の純関数に閉じ、署名・時刻・順序・再取得・巻き戻しは `src/core/write/writer.ts` 1 箇所に閉じる。`Writer` は kind を一切知らない（ADR-0004 の書き込み側）。置換可能イベントは write リレーから再取得してから差分適用する。

**Tech Stack:** TypeScript / SolidJS / Vitest / `@noble/curves` / `@noble/hashes`（ADR-0020: Nostr 用ライブラリは使わない）

**Spec:** [docs/superpowers/specs/2026-08-22-write-foundation-design.md](../specs/2026-08-22-write-foundation-design.md)

## Global Constraints

- **ADR-0020**: Nostr 用ライブラリを使わない。暗号は `@noble/curves` / `@noble/hashes` のみ。それ以外の領域（検証など）でのライブラリ使用はこの制約の対象外
- **ADR-0008**: アプリは秘密鍵を持たない。`signer.ts` と `nip07-signer.ts` には秘密鍵を表す変数名・引数名を一切書かない。NIP-44 の暗号化も署名器へ委譲する
- **ADR-0004**: kind 固有の知識は kind 側に置く。`Writer` は kind による分岐を 1 つも持たない
- **ADR-0011**: 劣化を隠さない。publish の失敗は握り潰さず `PublishResult.rejected` / 例外として表に出す
- **コメントは非自明な WHY だけ**。WHAT・変更履歴・タスク ID は書かない
- ビルダは**すべて純関数**。引数に `pubkey` / `created_at` を取らず、戻り値は `EventDraft`
- テストは**捕まえる変異を各テストに書き、その変異を入れて実際に落ちることを確認してから**次へ進む
- 型検査は `pnpm exec tsc --noEmit`、整形は `pnpm exec biome check --write <files>`、テストは `pnpm vitest run <file>`

---

## ファイル構成

| ファイル | 責務 |
|---|---|
| `src/core/nostr/build/draft.ts` | `EventDraft` 型と、全ビルダ共通の「未知のタグと content を保つ」ヘルパ |
| `src/core/nostr/build/note.ts` | `buildReply` / `buildQuote`（NIP-10 / 18 / 27） |
| `src/core/nostr/build/repost.ts` | `buildRepost`（NIP-18） |
| `src/core/nostr/build/reaction.ts` | `buildReaction`（NIP-25 / 30） |
| `src/core/nostr/build/deletion.ts` | `buildDeletion`（NIP-09） |
| `src/core/nostr/build/follow.ts` | `addFollow` / `removeFollow`（NIP-02） |
| `src/core/nostr/build/profile.ts` | `mergeProfile`（NIP-01） |
| `src/core/nostr/build/relay-list.ts` | `setRelayList`（NIP-65） |
| `src/core/nostr/build/list.ts` | 公開/非公開リストの共通部（NIP-51）。mute と bookmark が使う |
| `src/core/nostr/build/mute.ts` | `addMute` / `removeMute`（kind:10000） |
| `src/core/nostr/build/bookmark.ts` | `addBookmark` / `removeBookmark`（kind:10003） |
| `src/core/write/fetch-latest.ts` | write リレーから置換可能イベントの最新版を引く |
| `src/core/write/writer.ts` | 署名・時刻・順序・再取得・巻き戻し |
| `src/core/read/event-store.ts` | `remove()` を追加 |
| `src/core/read/event-persistence.ts` | `delete()` を seam に追加 |
| `src/core/read/indexeddb-persistence.ts` | `delete()` の実装 |
| `src/core/signer/signer.ts` | `nip44?` を追加 |
| `src/core/signer/nip07-signer.ts` | `window.nostr.nip44` を通す |
| `src/routes/v1.tsx` | compose を `Writer` 経由へ差し替え |

タスク 1〜5 が土台、6〜13 がビルダ（互いに独立）、14 が配線。

---

## Task 1: `EventDraft` 型と `EventStore.remove()`

**Files:**
- Create: `src/core/nostr/build/draft.ts`
- Modify: `src/core/read/event-store.ts`（`#events` / `#replaceable` / `#byTag` を持つクラス）
- Test: `src/core/read/event-store.test.ts`（既存に追記）

**Interfaces:**
- Consumes: なし
- Produces: `EventDraft`（`{ kind: number; tags: string[][]; content: string }`）、`EventStore.remove(id: string): boolean`

### 罠 —— 置換可能イベントを消すと直前の版が索引から消える

`#replaceable` は `${kind}:${pubkey}` → **1 つの id** しか持たない。新しい kind:3 を楽観挿入すると索引はそれを指し、巻き戻しで単に索引ごと消すと、**まだ `#events` に残っている直前の版が二度と `latestReplaceable()` から見えなくなる**。フォローリストが丸ごと消えたように見える。

消した後に `#events` を舐めて同じ `kind:pubkey` の最良の版を張り直す。走査は O(n) だが、`remove()` が呼ばれるのは publish 全滅の巻き戻しと明示的な削除だけで、毎イベント通る経路ではない。

- [ ] **Step 1: `EventDraft` を作る**

```ts
// src/core/nostr/build/draft.ts

/**
 * ビルダが返すもの。**`pubkey` と `created_at` を持たない。**
 *
 * その 2 つを押すのは `Writer` の責務 (spec 4 節)。ビルダに持たせると
 * 時計の取り方が 9 ファイルに散り、`created_at` を付け忘れたビルダが
 * 1 つ混ざっても型が通る。持てない形にしてあるので押し忘れは型で落ちる。
 */
export type EventDraft = {
  kind: number;
  tags: string[][];
  content: string;
};
```

- [ ] **Step 2: 失敗するテストを書く**

`src/core/read/event-store.test.ts` の末尾に足す（既存のヘルパ `sign` / `keyFor` を使う。無ければ `src/core/write/publisher.test.ts` の同名ヘルパをこのファイルへ写す）。

```ts
describe("remove", () => {
  it("索引から完全に外す", () => {
    // 捕まえる変異: #events からだけ消して #byTag を放置する
    const store = new EventStore();
    const event = sign(1, {
      kind: 1,
      created_at: 1_700_000_000,
      tags: [["e", "abc"]],
      content: "hi",
    });
    store.put(event, "wss://a.example");

    expect(store.remove(event.id)).toBe(true);
    expect(store.get(event.id)).toBeUndefined();
    expect(store.eventsByTag("e", "abc")).toEqual([]);
    expect(store.size).toBe(0);
  });

  it("知らない id は false を返し、何も壊さない", () => {
    // 捕まえる変異: 存在しない id で例外を投げる
    const store = new EventStore();
    const event = sign(1, {
      kind: 1,
      created_at: 1_700_000_000,
      tags: [],
      content: "hi",
    });
    store.put(event, "wss://a.example");

    expect(store.remove("0".repeat(64))).toBe(false);
    expect(store.get(event.id)).toBe(event);
  });

  it("置換可能イベントを消すと、直前の版が再び最新になる", () => {
    // 捕まえる変異: #replaceable のエントリを消すだけで張り直さない。
    // これを見逃すと、フォローリストの巻き戻しで既存のフォローが
    // 丸ごと消えたように見える。
    const store = new EventStore();
    const older = sign(1, {
      kind: 3,
      created_at: 1_700_000_000,
      tags: [["p", "aa"]],
      content: "",
    });
    const newer = sign(1, {
      kind: 3,
      created_at: 1_700_000_100,
      tags: [["p", "aa"], ["p", "bb"]],
      content: "",
    });
    store.put(older, "wss://a.example");
    store.put(newer, "wss://a.example");
    expect(store.latestReplaceable(3, newer.pubkey)).toBe(newer);

    store.remove(newer.id);

    expect(store.latestReplaceable(3, older.pubkey)).toBe(older);
  });

  it("永続層へ削除を転送する", () => {
    // 捕まえる変異: persistence.delete を呼ばない。呼ばないと publish に
    // 失敗したイベントが IndexedDB に残り、次回起動の水和で戻ってくる。
    const deleted: string[][] = [];
    const store = new EventStore({
      persistence: {
        load: async () => ({ events: [], deletedIds: [] }),
        save: () => {},
        saveDeletions: () => {},
        delete: (ids) => deleted.push([...ids]),
        dispose: () => {},
      },
    });
    const event = sign(1, {
      kind: 1,
      created_at: 1_700_000_000,
      tags: [],
      content: "hi",
    });
    store.put(event, "wss://a.example");

    store.remove(event.id);

    expect(deleted).toEqual([[event.id]]);
  });
});
```

- [ ] **Step 3: 落ちることを確認する**

Run: `pnpm vitest run src/core/read/event-store.test.ts`
Expected: FAIL（`store.remove is not a function`、および `EventPersistence` に `delete` が無いという型エラー）

- [ ] **Step 4: `EventPersistence` に `delete` を足す**

`src/core/read/event-persistence.ts` の `EventPersistence` 型に追加する。

```ts
  /**
   * 指定した id を永続層から取り除く。`saveDeletions` (NIP-09 の削除依頼を
   * 記録し、水和時にその対象を弾く) とは**別物**であり、混同しないこと ——
   * こちらは「この id のレコードそのものを消す」。
   *
   * 呼ばれるのは `EventStore.remove()` からだけ。
   */
  delete(ids: readonly string[]): void;
```

- [ ] **Step 5: `EventStore.remove()` を実装する**

`latestReplaceable()` の直前に足す。

```ts
  /**
   * 索引から完全に外す。`invalidate()` (取得時刻だけ 0 に戻し、値は残す)
   * とは別物。
   *
   * 使う場所は 2 つ。publish が 1 本も通らなかった書き込みの巻き戻し
   * (`src/core/write/writer.ts`) と、自分のイベントを NIP-09 で削除した
   * ときのローカル反映。どちらも「このイベントは無かったことにする」
   * であり、serveWhileRevalidating が古い値を出す余地は要らない。
   */
  remove(id: string): boolean {
    const stored = this.#events.get(id);
    if (!stored) return false;
    const { event } = stored;
    this.#events.delete(id);

    for (const tag of event.tags) {
      const name = tag[0];
      const value = tag[1];
      if (!name || name.length !== 1 || !value) continue;
      const byValue = this.#byTag.get(name);
      const ids = byValue?.get(value);
      if (!ids || !byValue) continue;
      ids.delete(id);
      if (ids.size === 0) byValue.delete(value);
      if (byValue.size === 0) this.#byTag.delete(name);
    }

    const key = `${event.kind}:${event.pubkey}`;
    if (this.#replaceable.get(key) === id) {
      // **索引を消すだけでは足りない。** まだ #events に残っている直前の
      // 版が二度と latestReplaceable() から見えなくなり、フォローリストの
      // 巻き戻しで既存のフォローが丸ごと消えたように見える。
      //
      // 走査は O(n) だが、remove() が呼ばれるのは巻き戻しと明示的な削除
      // だけで、毎イベント通る経路ではない。
      this.#replaceable.delete(key);
      for (const candidate of this.#events.values()) {
        if (candidate.event.kind !== event.kind) continue;
        if (candidate.event.pubkey !== event.pubkey) continue;
        this.#indexReplaceable(candidate.event);
      }
    }

    this.#persistence?.delete([id]);
    return true;
  }
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `pnpm vitest run src/core/read/event-store.test.ts`
Expected: PASS

- [ ] **Step 7: 各テストの「捕まえる変異」を実際に入れて落ちることを確認する**

4 つのテストそれぞれについて、コメントに書いた変異を `event-store.ts` に入れて `pnpm vitest run src/core/read/event-store.test.ts` を走らせ、**そのテストが落ちること**を目で確認してから元に戻す。落ちなければテストが弱いので、落ちるまで主張を強くする。

- [ ] **Step 8: 既存の `EventPersistence` 実装をすべて直す**

`delete` を型に足したので、実装しているものが全部型エラーになる。`pnpm exec tsc --noEmit` で列挙し、テスト内のインラインな偽実装には `delete: () => {}` を足す。`indexeddb-persistence.ts` は Task 2 で実装するので、ここでは `delete(_ids) {}` と空にしておく。

Run: `pnpm exec tsc --noEmit`
Expected: エラー 0

- [ ] **Step 9: 整形して全体テストを走らせる**

```bash
pnpm exec biome check --write src/core/read/event-store.ts src/core/read/event-persistence.ts src/core/nostr/build/draft.ts src/core/read/event-store.test.ts
pnpm vitest run
```
Expected: 全件 PASS

- [ ] **Step 10: Commit**

```bash
git add src/core/nostr/build/draft.ts src/core/read/event-store.ts src/core/read/event-persistence.ts src/core/read/event-store.test.ts
git commit -m "feat(v1): EventStore.remove と EventDraft"
```

---

## Task 2: IndexedDB の `delete()`

**Files:**
- Modify: `src/core/read/indexeddb-persistence.ts`
- Test: `src/core/read/indexeddb-persistence.test.ts`（既存に追記）

**Interfaces:**
- Consumes: `EventPersistence.delete(ids: readonly string[]): void`（Task 1）
- Produces: `createIndexedDbPersistence` が `delete` を実装する

`save` / `saveDeletions` は `pendingEvents` / `pendingDeletionIds` に積んで `scheduleFlush()` するバッチ方式。`delete` も同じ形にする —— **同じトランザクションで処理する**ことで、同一 flush 内で「保存してから削除」の順序が保たれる。

- [ ] **Step 1: 失敗するテストを書く**

既存のテストが使っているインメモリ IndexedDB のセットアップ（`fake-indexeddb` など）に合わせる。既存テストの冒頭を読んで同じ手筋を使うこと。

```ts
it("delete した id は load で戻ってこない", async () => {
  // 捕まえる変異: delete を no-op のままにする。放置すると publish に
  // 失敗して巻き戻したイベントが次回起動の水和で戻ってくる。
  const persistence = createIndexedDbPersistence({ scheduler, dbName });
  persistence.save([entryFor(eventA), entryFor(eventB)]);
  await flush();

  persistence.delete([eventA.id]);
  await flush();

  const { events } = await persistence.load();
  expect(events.map((e) => e.event.id)).toEqual([eventB.id]);
});

it("同じ flush の中で save した直後の id も消える", async () => {
  // 捕まえる変異: delete を save とは別のトランザクションで先に流す。
  // 巻き戻しは put の直後に来るので、両者が同じ flush に入るのが通常経路。
  const persistence = createIndexedDbPersistence({ scheduler, dbName });
  persistence.save([entryFor(eventA)]);
  persistence.delete([eventA.id]);
  await flush();

  const { events } = await persistence.load();
  expect(events).toEqual([]);
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm vitest run src/core/read/indexeddb-persistence.test.ts`
Expected: FAIL（2 件目で `eventA` が残る、または 1 件目で削除されない）

- [ ] **Step 3: 実装する**

`pendingDeletionIds` の隣に `pendingRemovalIds` を足し、`writeBatch` の引数と本体に通す。

```ts
// モジュール先頭の可変状態のところ
let pendingRemovalIds: string[] = [];
```

`writeBatch` のシグネチャに `removalIds: readonly string[]` を足し、**`retained` の書き込みループの後**にこれを回す。

```ts
    // **保存より後に回す。** 巻き戻しは put() の直後に来るので、同じ
    // flush の中に「保存」と「削除」が両方入る。先に削除すると、その後の
    // put が書き戻して消えない。
    for (const id of removalIds) eventsStore.delete(id);
```

返り値のオブジェクトに追加する。

```ts
    delete(ids) {
      if (disposed) return;
      pendingRemovalIds.push(...ids);
      scheduleFlush();
    },
```

`dispose()` と flush 後のリセットで `pendingRemovalIds = []` を忘れないこと（`pendingEvents` / `pendingDeletionIds` と同じ場所）。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/core/read/indexeddb-persistence.test.ts`
Expected: PASS

- [ ] **Step 5: 「捕まえる変異」を確認する**

2 つの変異（`delete` を no-op にする / 削除を保存より前に回す）をそれぞれ入れて、対応するテストが落ちることを確認してから戻す。

- [ ] **Step 6: 整形・全体テスト・Commit**

```bash
pnpm exec biome check --write src/core/read/indexeddb-persistence.ts src/core/read/indexeddb-persistence.test.ts
pnpm vitest run
git add src/core/read/indexeddb-persistence.ts src/core/read/indexeddb-persistence.test.ts
git commit -m "feat(v1): 永続層の delete"
```

---

## Task 3: `Writer.publish`

**Files:**
- Create: `src/core/write/writer.ts`
- Test: `src/core/write/writer.test.ts`

**Interfaces:**
- Consumes: `EventDraft`（Task 1）、`EventStore.remove`（Task 1）、既存の `Publisher`（`src/core/write/publisher.ts`）、既存の `Signer`（`src/core/signer/signer.ts`）
- Produces:

```ts
export type WriteResult = {
  event: NostrEvent;
  accepted: RelayUrl[];
  rejected: { relay: RelayUrl; reason: string }[];
  replaced?: NostrEvent;
};
export type WriteHooks = { onOptimisticInsert?: (event: NostrEvent) => void };
export class WriteFailedError extends Error {
  readonly rejected: { relay: RelayUrl; reason: string }[];
}
export type CreateWriterOptions = {
  signer: Signer;
  store: EventStore;
  publisher: Publisher;
  pubkey: () => string;
  now?: () => number;
};
export const createWriter: (options: CreateWriterOptions) => Writer;
```

`now` は**秒**を返す（既定 `() => Math.floor(Date.now() / 1000)`）。テストが `created_at` を決めるために注入する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/core/write/writer.test.ts
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { EventStore } from "../read/event-store";
import { createFakeSigner } from "../signer/fake-signer";
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { PublishResult } from "./publisher";
import { WriteFailedError, createWriter } from "./writer";

const SK = Uint8Array.from(Array.from({ length: 32 }, (_, i) => i + 1));
const PUBKEY = bytesToHex(schnorr.getPublicKey(SK));

const setup = (publishResult: PublishResult) => {
  const calls: string[] = [];
  const store = new EventStore();
  const putSpy = vi.spyOn(store, "put");
  const removeSpy = vi.spyOn(store, "remove");
  putSpy.mockImplementation(function (this: EventStore, ...args) {
    calls.push("put");
    return EventStore.prototype.put.apply(this, args);
  });
  removeSpy.mockImplementation(function (this: EventStore, ...args) {
    calls.push("remove");
    return EventStore.prototype.remove.apply(this, args);
  });
  const signer = createFakeSigner(SK);
  const signSpy = vi.spyOn(signer, "signEvent");
  const originalSign = signer.signEvent;
  signer.signEvent = async (t) => {
    calls.push("sign");
    return originalSign(t);
  };
  const publisher = {
    publish: async (): Promise<PublishResult> => {
      calls.push("publish");
      return publishResult;
    },
  };
  const writer = createWriter({
    signer,
    store,
    publisher,
    pubkey: () => PUBKEY,
    now: () => 1_700_000_000,
  });
  return { writer, store, calls, signSpy };
};

const ok: PublishResult = { accepted: ["wss://a.example" as RelayUrl], rejected: [] };
const allFailed: PublishResult = {
  accepted: [],
  rejected: [{ relay: "wss://a.example" as RelayUrl, reason: "refused" }],
};

describe("publish", () => {
  it("署名 → 楽観挿入 → publish の順に進む", async () => {
    // 捕まえる変異: put を publish の後に動かす。そうすると楽観挿入が
    // リレーの応答を待つことになり、ADR-0011 の 100ms 予算が崩れる。
    const { writer, calls } = setup(ok);
    await writer.publish({ kind: 1, tags: [], content: "hi" });
    expect(calls).toEqual(["sign", "put", "publish"]);
  });

  it("pubkey と created_at を押す", async () => {
    // 捕まえる変異: created_at を押さず undefined のまま署名へ渡す
    const { writer } = setup(ok);
    const result = await writer.publish({ kind: 1, tags: [], content: "hi" });
    expect(result.event.pubkey).toBe(PUBKEY);
    expect(result.event.created_at).toBe(1_700_000_000);
  });

  it("署名が拒否されたら挿入も publish もしない", async () => {
    // 捕まえる変異: signEvent を try の外へ出す (= 例外の後も put が走る)
    const { writer, store, calls } = setup(ok);
    // biome-ignore lint/suspicious/noExplicitAny: テスト専用の差し替え
    (writer as any).__neverUsed;
    const signer = createFakeSigner(SK);
    signer.signEvent = async () => {
      throw new Error("user rejected");
    };
    const w = createWriter({
      signer,
      store,
      publisher: { publish: async () => ok },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
    });
    await expect(w.publish({ kind: 1, tags: [], content: "hi" })).rejects.toThrow(
      "user rejected",
    );
    expect(store.size).toBe(0);
    expect(calls).not.toContain("publish");
  });

  it("accepted が空なら巻き戻して WriteFailedError を投げる", async () => {
    // 捕まえる変異: 巻き戻さずに WriteResult を返す
    const { writer, store, calls } = setup(allFailed);
    await expect(
      writer.publish({ kind: 1, tags: [], content: "hi" }),
    ).rejects.toBeInstanceOf(WriteFailedError);
    expect(store.size).toBe(0);
    expect(calls).toEqual(["sign", "put", "publish", "remove"]);
  });

  it("1 本でも accepted なら残す", async () => {
    // 捕まえる変異: rejected が 1 件でもあれば巻き戻す
    const partial: PublishResult = {
      accepted: ["wss://a.example" as RelayUrl],
      rejected: [{ relay: "wss://b.example" as RelayUrl, reason: "refused" }],
    };
    const { writer, store } = setup(partial);
    const result = await writer.publish({ kind: 1, tags: [], content: "hi" });
    expect(store.get(result.event.id)).toBeDefined();
    expect(result.rejected).toHaveLength(1);
  });

  it("onOptimisticInsert は put の直後・publish の前に同期的に呼ばれる", async () => {
    // 捕まえる変異: await の後に呼ぶ。ADR-0011 の optimisticInsertMs は
    // signEvent を含めないことが本質なので、publish の後に呼ぶと
    // 計測しているものが変わってしまう。
    const { writer, calls } = setup(ok);
    await writer.publish({ kind: 1, tags: [], content: "hi" }, {
      onOptimisticInsert: () => calls.push("hook"),
    });
    expect(calls).toEqual(["sign", "put", "hook", "publish"]);
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm vitest run src/core/write/writer.test.ts`
Expected: FAIL（`Cannot find module './writer'`）

- [ ] **Step 3: 実装する**

```ts
// src/core/write/writer.ts
import type { EventDraft } from "../nostr/build/draft";
import type { NostrEvent, UnsignedEvent } from "../nostr/event";
import type { EventStore } from "../read/event-store";
import type { RelayUrl } from "../relay/relay-connection";
import type { Signer } from "../signer/signer";
import type { Publisher } from "./publisher";

export type WriteResult = {
  event: NostrEvent;
  accepted: RelayUrl[];
  rejected: { relay: RelayUrl; reason: string }[];
  /** `replace` のときだけ入る、再取得した直前の版。 */
  replaced?: NostrEvent;
};

/**
 * 楽観挿入を UI へ映す方法は書き込む側ごとに違う —— compose はカラムへ
 * 重ねる必要があり、リアクションは `ReactionList` が
 * `store.eventsByTag` から自動で拾うので何も要らない。`Writer` が
 * 一般化しようとすると、どちらにも合わない中途半端な形になる。
 */
export type WriteHooks = {
  onOptimisticInsert?: (event: NostrEvent) => void;
};

/** publish が 1 本も通らなかった。挿入は巻き戻し済み。 */
export class WriteFailedError extends Error {
  readonly rejected: { relay: RelayUrl; reason: string }[];
  constructor(rejected: { relay: RelayUrl; reason: string }[]) {
    super(`publish rejected by all ${rejected.length} relay(s)`);
    this.name = "WriteFailedError";
    this.rejected = rejected;
  }
}

export type Writer = {
  publish(draft: EventDraft, hooks?: WriteHooks): Promise<WriteResult>;
};

export type CreateWriterOptions = {
  signer: Signer;
  store: EventStore;
  publisher: Publisher;
  /** 現在の閲覧者。ログアウト・切替で変わるので値ではなく関数で受ける。 */
  pubkey: () => string;
  /** 秒。テストが `created_at` を決めるために注入する。 */
  now?: () => number;
};

export const createWriter = ({
  signer,
  store,
  publisher,
  pubkey,
  now = () => Math.floor(Date.now() / 1000),
}: CreateWriterOptions): Writer => {
  const send = async (
    unsigned: UnsignedEvent,
    hooks: WriteHooks | undefined,
    replaced: NostrEvent | undefined,
  ): Promise<WriteResult> => {
    // 署名の例外はそのまま伝播させる。ここで包み直すと、呼び出し側が
    // 「拡張機能が無い」と「リレーが全部落ちている」を別の文言で
    // 出せなくなる。**この行より前では何も挿入していない。**
    const signed = await signer.signEvent(unsigned);

    // "local" は実在するリレー URL ではない —— 手元での挿入だという印。
    store.put(signed, "local" as RelayUrl);
    hooks?.onOptimisticInsert?.(signed);

    const result = await publisher.publish(signed);
    if (result.accepted.length === 0) {
      // 1 本も通っていない。store にも永続層にも残さない —— 残すと
      // 「送れていないのに送れたように見えるノート」が次回起動でも
      // 復活する。**戻す先 (本文をフォームへ、押下状態を元へ) は
      // 呼び出し側の責務**で、ここでは扱わない (spec 5.1 節)。
      store.remove(signed.id);
      throw new WriteFailedError(result.rejected);
    }
    return { event: signed, ...result, replaced };
  };

  return {
    publish: (draft, hooks) =>
      send({ ...draft, pubkey: pubkey(), created_at: now() }, hooks, undefined),
  };
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/core/write/writer.test.ts`
Expected: PASS

- [ ] **Step 5: 「捕まえる変異」を 6 つとも確認する**

各テストのコメントに書いた変異を `writer.ts` に入れ、**そのテストだけが落ちること**を確認して戻す。特に `onOptimisticInsert` を `await publisher.publish(...)` の後に動かしたとき、順序テストが落ちることを必ず見ること。

- [ ] **Step 6: 整形・全体テスト・Commit**

```bash
pnpm exec biome check --write src/core/write/writer.ts src/core/write/writer.test.ts
pnpm vitest run
git add src/core/write/writer.ts src/core/write/writer.test.ts
git commit -m "feat(v1): Writer.publish (署名・楽観挿入・巻き戻し)"
```

---

## Task 4: `fetchLatest`

**Files:**
- Create: `src/core/write/fetch-latest.ts`
- Test: `src/core/write/fetch-latest.test.ts`

**Interfaces:**
- Consumes: `collect`（`src/core/read/collect.ts`）、`ConnectionPool`、`RoutingTable`、`EventStore`
- Produces:

```ts
export class RefetchFailedError extends Error {
  readonly relays: RelayUrl[];
}
export type FetchLatestOptions = {
  pool: ConnectionPool;
  routing: RoutingTable;
  store: EventStore;
  fallbackRelays: readonly RelayUrl[];
  timeoutMs?: number;
};
export const fetchLatest: (
  options: FetchLatestOptions,
  kind: number,
  identifier: string | undefined,
  pubkey: string,
) => Promise<NostrEvent | undefined>;
```

### `collect` の使い方

`collect(pool, urls, filters, store, timeoutMs, open, options)` は**届いたイベントを `EventStore` に入れるだけで返さない**。したがって collect の後に `store.latestReplaceable(kind, pubkey)` を読む。「`created_at` が最大のものを採る」は `#indexReplaceable` が既に行っているので再実装しない。

`answered` は `CollectOptions.onRelaySettled` から導き、**`reason === "eose"` だけを数える**。`"closed"` はリレーがフィルタを拒否した場合を含み（`bootstrap.ts` が実際に `blocked: filters must specify at least one kind` を踏んでいる）、不在の証明にならない。`"rejected"`（予算切れ）と `"timeout"` も同じ。

`reserved` は**渡さない**（`collect.ts` のコメント通り `warmUpRouting` 専用）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/write/publisher.test.ts` の `poolWithFakes` と `sign` / `keyFor` を写して使う。`FakeRelayConnection` は EOSE の送出と CLOSED を制御できるので、その API を実際に読んで合わせること。

```ts
describe("fetchLatest", () => {
  it("write リレーから引いて最新版を返す", async () => {
    // 捕まえる変異: read リレーから引く。自分が最後に書いた版がまだ
    // 伝播していないと、自分で自分の変更を消す。
  });

  it("全リレーが EOSE を返さなければ RefetchFailedError", async () => {
    // 捕まえる変異: undefined を返して呼び出し側に続行させる。
    // 「取れなかった」を「無い」と取り違えると、既存のフォローリストを
    // 1 件だけのリストで丸ごと上書きする。
  });

  it("CLOSED だけでは応答と数えない", async () => {
    // 捕まえる変異: reason を見ずに settle をすべて応答と数える
  });

  it("1 本が EOSE を返し、当該イベントが無ければ undefined", async () => {
    // 捕まえる変異: 空でも RefetchFailedError にする。
    // 初めてフォローリストを作るときに永久に書けなくなる。
  });

  it("write リレーが分からなければ fallbackRelays を使う", async () => {
    // 捕まえる変異: 空配列へ投げて黙って undefined を返す
  });

  it("identifier を渡すと投げる", async () => {
    // 捕まえる変異: 黙って d を無視する。latestReplaceable の索引は
    // kind:pubkey だけを鍵にしていて d を見ないので、間違った版を返す。
    await expect(
      fetchLatest(options, 30078, "streets", PUBKEY),
    ).rejects.toThrow(/identifier/);
  });
});
```

**各テストの本体は実装者が書く。** 上のコメント（捕まえる変異）が主張の定義であり、それを満たすアサーションを置くこと。`FakeRelayConnection` の使い方は `src/core/read/bootstrap.test.ts` が最も近い先例なので、そこを読んで揃える。

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm vitest run src/core/write/fetch-latest.test.ts`
Expected: FAIL（`Cannot find module './fetch-latest'`）

- [ ] **Step 3: 実装する**

```ts
// src/core/write/fetch-latest.ts
import type { NostrEvent } from "../nostr/event";
import { collect } from "../read/collect";
import type { ConnectionPool, PooledSubscription } from "../read/connection-pool";
import type { EventStore } from "../read/event-store";
import type { RoutingTable } from "../read/routing-table";
import type { RelayUrl } from "../relay/relay-connection";

/** 置換可能イベントの再取得が全リレーで失敗した。何も書いていない。 */
export class RefetchFailedError extends Error {
  readonly relays: RelayUrl[];
  constructor(relays: RelayUrl[]) {
    super(`no relay answered for the current version (${relays.length} tried)`);
    this.name = "RefetchFailedError";
    this.relays = relays;
  }
}

/** `connection-pool.ts` の PUBLISH_TIMEOUT_MS と同じ値。 */
const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchLatestOptions = {
  pool: ConnectionPool;
  routing: RoutingTable;
  store: EventStore;
  fallbackRelays: readonly RelayUrl[];
  timeoutMs?: number;
};

/**
 * 置換可能イベントの最新版を **write リレーから** 引く。
 *
 * read リレーから引いてはならない —— 自分が最後に書いた版がまだ
 * 伝播していない可能性があり、それに気づかず差分を当てると
 * **自分で自分の変更を消す**。publish 先と読み取り元を同じにすることで
 * これが起きない。
 */
export const fetchLatest = async (
  { pool, routing, store, fallbackRelays, timeoutMs = DEFAULT_TIMEOUT_MS }: FetchLatestOptions,
  kind: number,
  identifier: string | undefined,
  pubkey: string,
): Promise<NostrEvent | undefined> => {
  if (identifier !== undefined) {
    // `latestReplaceable` の索引は `kind:pubkey` だけを鍵にしていて `d` を
    // 見ない。射程内の kind (0/3/10000/10002/10003) はすべて非アドレス可能
    // なので今は問題にならないが、kind:30078 を載せる時点で EventStore 側に
    // `d` を含む索引が要る。**黙って間違った版を返すより投げる。**
    throw new Error(
      "fetchLatest: identifier (d タグ) は未対応。EventStore の置換可能索引が d を見ていない",
    );
  }

  const writeRelays = routing.writeRelaysFor(pubkey);
  const urls = writeRelays.length > 0 ? writeRelays : [...fallbackRelays];

  const answered: RelayUrl[] = [];
  const open = new Map<RelayUrl, PooledSubscription>();
  await collect(
    pool,
    urls,
    [{ kinds: [kind], authors: [pubkey] }],
    store,
    timeoutMs,
    open,
    {
      // **EOSE だけを「応答した」と数える。** CLOSED はリレーがフィルタを
      // 拒否した場合を含み (bootstrap.ts が実際に踏んでいる)、不在の証明に
      // ならない。rejected (予算切れ) と timeout も同じ。
      onRelaySettled: (settle) => {
        if (settle.reason === "eose") answered.push(settle.url);
      },
    },
  );

  if (answered.length === 0) throw new RefetchFailedError(urls);
  return store.latestReplaceable(kind, pubkey);
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/core/write/fetch-latest.test.ts`
Expected: PASS

- [ ] **Step 5: 「捕まえる変異」を 6 つとも確認する**

- [ ] **Step 6: 整形・全体テスト・Commit**

```bash
pnpm exec biome check --write src/core/write/fetch-latest.ts src/core/write/fetch-latest.test.ts
pnpm vitest run
git add src/core/write/fetch-latest.ts src/core/write/fetch-latest.test.ts
git commit -m "feat(v1): 置換可能イベントの再取得"
```

---

## Task 5: `Writer.replace`

**Files:**
- Modify: `src/core/write/writer.ts`
- Test: `src/core/write/writer.test.ts`（既存に追記）

**Interfaces:**
- Consumes: `fetchLatest` / `RefetchFailedError`（Task 4）、Task 3 の `send`
- Produces: `Writer.replace(kind, identifier, mutate, hooks?)`。`CreateWriterOptions` に `fetchLatest: (kind: number, identifier: string | undefined, pubkey: string) => Promise<NostrEvent | undefined>` を追加する（関数として注入することでテストがネットワークを組み立てずに済み、`writer.ts` が `ConnectionPool` に依存しなくなる）

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe("replace", () => {
  const setupReplace = (
    current: NostrEvent | undefined,
    options?: { refetchThrows?: Error },
  ) => {
    const calls: string[] = [];
    const store = new EventStore();
    const signer = createFakeSigner(SK);
    const originalSign = signer.signEvent;
    signer.signEvent = async (t) => {
      calls.push("sign");
      return originalSign(t);
    };
    const writer = createWriter({
      signer,
      store,
      publisher: {
        publish: async () => {
          calls.push("publish");
          return ok;
        },
      },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => {
        calls.push("fetch");
        if (options?.refetchThrows) throw options.refetchThrows;
        return current;
      },
    });
    return { writer, store, calls };
  };

  it("再取得 → mutate → 署名 の順に進む", async () => {
    // 捕まえる変異: store の値で mutate する (再取得を待たない)。
    // 古いコピーに差分を当てると他端末の変更を消す。
    const { writer, calls } = setupReplace(undefined);
    await writer.replace(3, undefined, () => ({ kind: 3, tags: [], content: "" }));
    expect(calls).toEqual(["fetch", "sign", "publish"]);
  });

  it("mutate は再取得した版を受け取る", async () => {
    // 捕まえる変異: mutate に undefined を渡す
    const current = sign(1, {
      kind: 3,
      created_at: 1_600_000_000,
      tags: [["p", "aa"]],
      content: "",
    });
    const { writer } = setupReplace(current);
    const seen: (NostrEvent | undefined)[] = [];
    await writer.replace(3, undefined, (c) => {
      seen.push(c);
      return { kind: 3, tags: c?.tags ?? [], content: "" };
    });
    expect(seen).toEqual([current]);
  });

  it("再取得が失敗したら何も書かない", async () => {
    // 捕まえる変異: current = undefined で続行する。既存のフォローリストを
    // 1 件だけのリストで丸ごと上書きする巻き戻せない破壊になる。
    const { writer, store, calls } = setupReplace(undefined, {
      refetchThrows: new RefetchFailedError([]),
    });
    await expect(
      writer.replace(3, undefined, () => ({ kind: 3, tags: [], content: "" })),
    ).rejects.toBeInstanceOf(RefetchFailedError);
    expect(calls).toEqual(["fetch"]);
    expect(store.size).toBe(0);
  });

  it("created_at が現在の版以下なら +1 に繰り上げる", async () => {
    // 捕まえる変異: 常に now() を使う。リレーは created_at で新旧を決める
    // ので、同一秒内の 2 回目の更新が黙って捨てられる。
    const current = sign(1, {
      kind: 3,
      created_at: 1_700_000_000, // now() と同値
      tags: [],
      content: "",
    });
    const { writer } = setupReplace(current);
    const result = await writer.replace(3, undefined, () => ({
      kind: 3,
      tags: [],
      content: "",
    }));
    expect(result.event.created_at).toBe(1_700_000_001);
  });

  it("現在の版より新しければ now() をそのまま使う", async () => {
    // 捕まえる変異: 無条件に +1 する
    const current = sign(1, {
      kind: 3,
      created_at: 1_600_000_000,
      tags: [],
      content: "",
    });
    const { writer } = setupReplace(current);
    const result = await writer.replace(3, undefined, () => ({
      kind: 3,
      tags: [],
      content: "",
    }));
    expect(result.event.created_at).toBe(1_700_000_000);
  });

  it("再取得した版を replaced に載せる", async () => {
    // 捕まえる変異: replaced を落とす。UI が競合を警告する材料が無くなる。
    const current = sign(1, {
      kind: 3,
      created_at: 1_600_000_000,
      tags: [],
      content: "",
    });
    const { writer } = setupReplace(current);
    const result = await writer.replace(3, undefined, () => ({
      kind: 3,
      tags: [],
      content: "",
    }));
    expect(result.replaced).toBe(current);
  });
});
```

Task 3 のテストの `setup()` にも `fetchLatest: async () => undefined` を足すこと（必須プロパティになるため）。

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm vitest run src/core/write/writer.test.ts`
Expected: FAIL（`writer.replace is not a function`）

- [ ] **Step 3: 実装する**

`CreateWriterOptions` に足す。

```ts
  /**
   * 置換可能イベントの現在の版を **write リレーから** 引く
   * (`src/core/write/fetch-latest.ts`)。関数として注入するのは、
   * `Writer` を `ConnectionPool` から独立させ、テストがネットワークを
   * 組み立てずに済むようにするため。
   */
  fetchLatest: (
    kind: number,
    identifier: string | undefined,
    pubkey: string,
  ) => Promise<NostrEvent | undefined>;
```

`send` に `createdAt` を渡せるようにし、`replace` を足す。

```ts
    replace: async (kind, identifier, mutate, hooks) => {
      const author = pubkey();
      // 再取得が投げたらここで止まる —— **何も署名していないし挿入もして
      // いない**。「取れなかった」を「無い」と取り違えると、既存のリストを
      // 1 件だけのリストで丸ごと上書きする巻き戻せない破壊になる。
      const current = await fetchLatest(kind, identifier, author);
      const draft = mutate(current);

      // リレーは置換可能イベントの新旧を created_at で決める (NIP-01)。
      // 同一秒内の 2 回目の更新は「古くない」だけで**新しくもない**ので、
      // リレーの実装次第で黙って捨てられる。繰り上げてそれを防ぐ。
      const stamped = now();
      const createdAt =
        current && stamped <= current.created_at
          ? current.created_at + 1
          : stamped;

      return send(
        { ...draft, pubkey: author, created_at: createdAt },
        hooks,
        current,
      );
    },
```

`Writer` 型にも `replace` を足す。

```ts
export type Writer = {
  publish(draft: EventDraft, hooks?: WriteHooks): Promise<WriteResult>;
  replace(
    kind: number,
    identifier: string | undefined,
    mutate: (current: NostrEvent | undefined) => EventDraft,
    hooks?: WriteHooks,
  ): Promise<WriteResult>;
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/core/write/writer.test.ts`
Expected: PASS（Task 3 の 6 件 + Task 5 の 6 件）

- [ ] **Step 5: 「捕まえる変異」を 6 つとも確認する**

- [ ] **Step 6: 整形・全体テスト・Commit**

```bash
pnpm exec biome check --write src/core/write/writer.ts src/core/write/writer.test.ts
pnpm vitest run
git add src/core/write/writer.ts src/core/write/writer.test.ts
git commit -m "feat(v1): Writer.replace (再取得つき read-modify-write)"
```

---

## Task 6: `buildReply`（NIP-10）

**Files:**
- Create: `src/core/nostr/build/note.ts`
- Test: `src/core/nostr/build/note.test.ts`

**Interfaces:**
- Consumes: `EventDraft`（Task 1）、`RelayUrl`
- Produces: `buildReply(parent: NostrEvent, content: string, options?: { relayHint?: RelayUrl }): EventDraft`

### NIP-10 の条文（[10.md](https://github.com/nostr-protocol/nips/blob/master/10.md)）

- マーカー付き `e` タグの位置要素: `["e", <event-id>, <relay-url>, <marker>, <pubkey>]`
- *"A direct reply to the root of a thread should have a single marked 'e' tag of type 'root'."*
- *"When replying to a text event E the reply event's 'p' tags should contain all of E's 'p' tags as well as the pubkey of the event being replied to."*

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/core/nostr/build/note.test.ts
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../event";
import { buildReply } from "./note";

const evt = (fields: Partial<NostrEvent>): NostrEvent =>
  ({
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: "",
    sig: "c".repeat(128),
    ...fields,
  }) as NostrEvent;

describe("buildReply", () => {
  it("根への返信は root マーカー 1 本だけ", () => {
    // 捕まえる変異: reply マーカーも足す。NIP-10 は
    // "should have a single marked 'e' tag of type 'root'" と定めている。
    const parent = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReply(parent, "hi", { relayHint: "wss://a.example" });
    const e = draft.tags.filter((t) => t[0] === "e");
    expect(e).toEqual([
      ["e", "1".repeat(64), "wss://a.example", "root", "9".repeat(64)],
    ]);
  });

  it("返信への返信は親の root を引き継ぎ、root と reply の 2 本を持つ", () => {
    // 捕まえる変異: 親だけを指して root を引き継がない。スレッドの根が
    // 失われ、他クライアントで会話が分断される。
    const parent = evt({
      id: "2".repeat(64),
      pubkey: "9".repeat(64),
      tags: [["e", "1".repeat(64), "wss://r.example", "root", "8".repeat(64)]],
    });
    const draft = buildReply(parent, "hi", { relayHint: "wss://a.example" });
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "wss://r.example", "root", "8".repeat(64)],
      ["e", "2".repeat(64), "wss://a.example", "reply", "9".repeat(64)],
    ]);
  });

  it("p は親の著者を先頭に、親の p を出現順で続ける", () => {
    // 捕まえる変異: 親の p を引き継がない。会話の参加者に通知が行かなくなる。
    const parent = evt({
      pubkey: "9".repeat(64),
      tags: [
        ["p", "7".repeat(64)],
        ["p", "6".repeat(64)],
      ],
    });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "9".repeat(64)],
      ["p", "7".repeat(64)],
      ["p", "6".repeat(64)],
    ]);
  });

  it("p の重複を落とす", () => {
    // 捕まえる変異: 無条件に concat する
    const parent = evt({
      pubkey: "9".repeat(64),
      tags: [["p", "9".repeat(64)], ["p", "7".repeat(64)]],
    });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "9".repeat(64)],
      ["p", "7".repeat(64)],
    ]);
  });

  it("relayHint が無ければ位置要素を空文字で埋める", () => {
    // 捕まえる変異: 3 番目を省略して ["e", id, "root", pubkey] にする。
    // マーカーが relay-url の位置に来て、読む側が「root」というリレーへ
    // 接続しようとする。
    const parent = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "", "root", "9".repeat(64)],
    ]);
  });

  it("kind と content をそのまま載せる", () => {
    const draft = buildReply(evt({}), "本文");
    expect(draft.kind).toBe(1);
    expect(draft.content).toBe("本文");
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm vitest run src/core/nostr/build/note.test.ts`
Expected: FAIL（`Cannot find module './note'`）

- [ ] **Step 3: 実装する**

```ts
// src/core/nostr/build/note.ts
import type { NostrEvent } from "../event";
import type { RelayUrl } from "../../relay/relay-connection";
import type { EventDraft } from "./draft";

/** 親が持つ `root` マーカー付きの `e` タグ。無ければ親自身が根。 */
const rootTagOf = (parent: NostrEvent): string[] | undefined =>
  parent.tags.find((tag) => tag[0] === "e" && tag[3] === "root");

/**
 * NIP-10 の返信。**マーカー付きの `e` タグ**を使う (positional 形式は
 * NIP-10 が deprecated としている)。位置要素は
 * `["e", <event-id>, <relay-url>, <marker>, <pubkey>]` の 5 つで、
 * relay-url が無くても**空文字で埋める** —— 省略するとマーカーが
 * relay-url の位置に来て、読む側が "root" というリレーへ繋ごうとする。
 */
export const buildReply = (
  parent: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const hint = options?.relayHint ?? "";
  const root = rootTagOf(parent);

  // NIP-10: "A direct reply to the root of a thread should have a single
  // marked 'e' tag of type 'root'."
  const e = root
    ? [root, ["e", parent.id, hint, "reply", parent.pubkey]]
    : [["e", parent.id, hint, "root", parent.pubkey]];

  // NIP-10: "the reply event's 'p' tags should contain all of E's 'p' tags
  // as well as the pubkey of the event being replied to."
  const pubkeys = new Set<string>([parent.pubkey]);
  for (const tag of parent.tags) {
    if (tag[0] === "p" && tag[1]) pubkeys.add(tag[1]);
  }

  return {
    kind: 1,
    tags: [...e, ...[...pubkeys].map((pubkey) => ["p", pubkey])],
    content,
  };
};
```

**注意:** 自分自身を `p` から落とす処理はここに入れない —— ビルダは `pubkey` を受け取らないので誰が自分か知らない。spec 7.1 節の「自分自身は落とす」は、`Writer` でもビルダでもなく**呼び出し側**が `mutate` 相当の後処理で行うか、`buildReply` に `viewerPubkey` を渡す設計に変える必要がある。この計画では**落とさない**方を採る（自分への通知は他クライアントも普通に付けており、害が小さい）。spec 7.1 節のこの一文は実装と食い違うので、Task 6 の最後に spec を直す。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/core/nostr/build/note.test.ts`
Expected: PASS

- [ ] **Step 5: 「捕まえる変異」を 5 つとも確認する**

- [ ] **Step 6: spec の食い違いを直す**

`docs/superpowers/specs/2026-08-22-write-foundation-design.md` の 7.1 節から「自分自身は落とす —— 自分への通知になる。」を削り、代わりに次を書く。

> 自分自身を落とす処理は入れない。ビルダは `pubkey` を受け取らないので誰が自分か知らない。自分への通知は他クライアントも普通に付けており、害が小さい。

- [ ] **Step 7: 整形・全体テスト・Commit**

```bash
pnpm exec biome check --write src/core/nostr/build/note.ts src/core/nostr/build/note.test.ts
pnpm vitest run
git add src/core/nostr/build/note.ts src/core/nostr/build/note.test.ts docs/superpowers/specs/2026-08-22-write-foundation-design.md
git commit -m "feat(v1): buildReply (NIP-10)"
```

---

## Task 7: `buildQuote`（NIP-18 / NIP-27）

**Files:**
- Modify: `src/core/nostr/build/note.ts`
- Test: `src/core/nostr/build/note.test.ts`（既存に追記）

**Interfaces:**
- Consumes: `encodeBech32`（`src/core/nostr/nip19.ts`、`encodeBech32(prefix: string, dataHex: string): string`）
- Produces: `buildQuote(target: NostrEvent, content: string, options?: { relayHint?: RelayUrl }): EventDraft`

### NIP-18 の条文

- `q` タグの形: `["q", "<event-id> or <event-address>", "<relay-url>", "<pubkey-if-a-regular-event>"]`
- *"This ensures that quote reposts will not be shown in the feed as replies"* —— **`e` タグを立てない**

`nevent`（TLV）は使わない。`src/core/nostr/nip19.ts` に TLV の符号化器が無く、`note` でも参照としては一意に定まる。リレーヒントは `q` タグの 3 番目が持つ。

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe("buildQuote", () => {
  it("q タグを立て、e タグは立てない", () => {
    // 捕まえる変異: e タグも立てる。NIP-18 が明示的に禁じており、
    // 立てると引用が返信としてタイムラインに出る。
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildQuote(target, "これ面白い", {
      relayHint: "wss://a.example",
    });
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([]);
    expect(draft.tags.filter((t) => t[0] === "q")).toEqual([
      ["q", "1".repeat(64), "wss://a.example", "9".repeat(64)],
    ]);
  });

  it("引用先の著者に p タグを立てる", () => {
    // 捕まえる変異: p を落とす。引用されたことが相手に通知されない。
    const target = evt({ pubkey: "9".repeat(64) });
    const draft = buildQuote(target, "これ面白い");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "9".repeat(64)],
    ]);
  });

  it("本文に nostr: が無ければ末尾に note1 を足す", () => {
    // 捕まえる変異: 本文をそのまま使う。q タグだけでは NIP-27 に対応した
    // クライアントが本文中に引用を描けない。
    const target = evt({ id: "1".repeat(64) });
    const draft = buildQuote(target, "これ面白い");
    expect(draft.content).toBe(
      `これ面白い\n\nnostr:${encodeBech32("note", "1".repeat(64))}`,
    );
  });

  it("本文に既に nostr: があればそのまま使う", () => {
    // 捕まえる変異: 無条件に末尾へ足す。同じ引用が 2 回描かれる。
    const target = evt({ id: "1".repeat(64) });
    const uri = `nostr:${encodeBech32("note", "1".repeat(64))}`;
    const draft = buildQuote(target, `${uri} これ面白い`);
    expect(draft.content).toBe(`${uri} これ面白い`);
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm vitest run src/core/nostr/build/note.test.ts`
Expected: FAIL（`buildQuote is not a function`）

- [ ] **Step 3: 実装する**

```ts
/**
 * NIP-18 の引用。**`e` タグを立てない** —— NIP-18 は
 * "This ensures that quote reposts will not be shown in the feed as replies"
 * と明示しており、立てると引用が返信としてタイムラインに出る。
 *
 * `nevent` (リレーヒントと著者を TLV で持つ形) は使わない ——
 * `src/core/nostr/nip19.ts` は復号と素の bech32 しか持たず、TLV の
 * 符号化器がまだ無い。`note` でも参照としては一意に定まり、リレーヒントは
 * `q` タグの 3 番目が持つ。
 */
export const buildQuote = (
  target: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const uri = `nostr:${encodeBech32("note", target.id)}`;
  return {
    kind: 1,
    tags: [
      ["q", target.id, options?.relayHint ?? "", target.pubkey],
      ["p", target.pubkey],
    ],
    content: content.includes(uri) ? content : `${content}\n\n${uri}`,
  };
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/core/nostr/build/note.test.ts`
Expected: PASS

- [ ] **Step 5: 「捕まえる変異」を 4 つとも確認する**

- [ ] **Step 6: 整形・全体テスト・Commit**

```bash
pnpm exec biome check --write src/core/nostr/build/note.ts src/core/nostr/build/note.test.ts
pnpm vitest run
git add src/core/nostr/build/note.ts src/core/nostr/build/note.test.ts
git commit -m "feat(v1): buildQuote (NIP-18/27)"
```

---

## Task 8: `buildRepost`（NIP-18）

**Files:**
- Create: `src/core/nostr/build/repost.ts`
- Test: `src/core/nostr/build/repost.test.ts`

**Interfaces:**
- Produces: `buildRepost(target: NostrEvent, options?: { relayHint?: RelayUrl }): EventDraft | undefined`

### NIP-18 の条文

- *"The `content` of a repost event is the stringified JSON of the reposted note."*
- `e` タグは**リレー URL を 3 番目に置く**（*"and a relay URL as the third entry"*）
- `p` タグに元の著者

`target.kind !== 1` なら `undefined`。kind:16（汎用リポスト）は射程外で、kind:6 に kind:1 以外を入れるのは NIP-18 違反。

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe("buildRepost", () => {
  it("content は対象の JSON", () => {
    // 捕まえる変異: 空文字にする。NIP-18 は "MAY also be empty, but that is
    // not recommended" と言う。空だと受け手が対象を取りに行くまで何も出せない。
    const target = evt({ id: "1".repeat(64), content: "hi" });
    const draft = buildRepost(target);
    expect(JSON.parse(draft!.content)).toEqual(target);
  });

  it("e タグはリレー URL を 3 番目に持つ", () => {
    // 捕まえる変異: ["e", id] の 2 要素にする。NIP-18 はリレー URL を
    // 3 番目に置くよう定めており、無いと受け手が対象を引く先を失う。
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildRepost(target, { relayHint: "wss://a.example" });
    expect(draft!.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "wss://a.example", "", "9".repeat(64)],
    ]);
  });

  it("元の著者に p タグを立てる", () => {
    // 捕まえる変異: p を落とす
    const target = evt({ pubkey: "9".repeat(64) });
    expect(buildRepost(target)!.tags).toContainEqual(["p", "9".repeat(64)]);
  });

  it("kind は 6", () => {
    expect(buildRepost(evt({}))!.kind).toBe(6);
  });

  it("kind:1 以外は undefined", () => {
    // 捕まえる変異: kind を見ずに常に kind:6 を作る。kind:6 に kind:1 以外を
    // 入れるのは NIP-18 違反 (そちらは kind:16)。
    expect(buildRepost(evt({ kind: 30023 }))).toBeUndefined();
  });
});
```

- [ ] **Step 2〜6: Task 6 と同じ手順**

実装:

```ts
// src/core/nostr/build/repost.ts
import type { RelayUrl } from "../../relay/relay-connection";
import type { NostrEvent } from "../event";
import type { EventDraft } from "./draft";

/**
 * NIP-18 のリポスト。
 *
 * `kind:1` 以外は `undefined` を返す —— NIP-18 はそれ用に kind:16 を
 * 別に定めており、kind:6 に他の kind を入れるのは違反。kind:16 は
 * リポストする面がまだ無いので作らない。
 */
export const buildRepost = (
  target: NostrEvent,
  options?: { relayHint?: RelayUrl },
): EventDraft | undefined => {
  if (target.kind !== 1) return undefined;
  return {
    kind: 6,
    // NIP-18: "The content of a repost event is the stringified JSON of
    // the reposted note."
    content: JSON.stringify(target),
    tags: [
      // NIP-18 はリレー URL を**3 番目**に置くよう定めている。マーカーの
      // 位置 (4 番目) は空文字で埋めて、著者を 5 番目に置く。
      ["e", target.id, options?.relayHint ?? "", "", target.pubkey],
      ["p", target.pubkey],
    ],
  };
};
```

Commit: `feat(v1): buildRepost (NIP-18)`

---

## Task 9: `buildReaction`（NIP-25 / NIP-30）

**Files:**
- Create: `src/core/nostr/build/reaction.ts`
- Test: `src/core/nostr/build/reaction.test.ts`

**Interfaces:**
- Consumes: `parseReaction`（`src/core/nostr/reaction.ts`）—— 往復テストに使う
- Produces:

```ts
export type ReactionInput =
  | { type: "like" }
  | { type: "text"; content: string }
  | { type: "emoji"; shortcode: string; url: string };
export const buildReaction: (target: NostrEvent, input: ReactionInput) => EventDraft;
```

### NIP-25 の条文

- *"There MUST be always an `e` tag set to the `id` of the event that is being reacted to."*
- *"There SHOULD be a `p` tag set to the `pubkey` of the event being reacted to."*
- *"The reaction event MAY include a `k` tag with the stringified kind number"* —— 読み取り側の `parseReaction` が既に見ているので**必ず入れる**
- カスタム絵文字: *"The content can be set only one `:shortcode:`. And emoji tag should be one."*

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe("buildReaction", () => {
  it("like は content が + で、e/p/k を持つ", () => {
    // 捕まえる変異: k タグを落とす。読み取り側の parseReaction が
    // 既に見ているので、落とすと自分が書いたものを自分で読めなくなる。
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64), kind: 1 });
    const draft = buildReaction(target, { type: "like" });
    expect(draft.kind).toBe(7);
    expect(draft.content).toBe("+");
    expect(draft.tags).toEqual([
      ["e", "1".repeat(64)],
      ["p", "9".repeat(64)],
      ["k", "1"],
    ]);
  });

  it("カスタム絵文字は emoji タグ 1 つと :shortcode: 1 つ", () => {
    // 捕まえる変異: content に飾りを足す (":x: すごい" など)。NIP-25 は
    // "The content can be set only one :shortcode:" と定めており、
    // 足すと他クライアントが素のテキストとして描く。
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReaction(target, {
      type: "emoji",
      shortcode: "streetsparrot",
      url: "https://example.invalid/p.png",
    });
    expect(draft.content).toBe(":streetsparrot:");
    expect(draft.tags.filter((t) => t[0] === "emoji")).toEqual([
      ["emoji", "streetsparrot", "https://example.invalid/p.png"],
    ]);
  });

  it("text はそのまま content に載り、emoji タグを持たない", () => {
    // 捕まえる変異: text にも emoji タグを付ける
    const draft = buildReaction(evt({}), { type: "text", content: "🎉" });
    expect(draft.content).toBe("🎉");
    expect(draft.tags.filter((t) => t[0] === "emoji")).toEqual([]);
  });

  it("往復: buildReaction で作ったものを parseReaction が読み戻せる", () => {
    // 捕まえる変異: どちらか一方だけを NIP に沿わせる。書いたものを自分で
    // 読めないのは、同じ NIP を 2 箇所で別々に解釈している証拠。
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    for (const input of [
      { type: "like" } as const,
      { type: "text", content: "🎉" } as const,
      {
        type: "emoji",
        shortcode: "streetsparrot",
        url: "https://example.invalid/p.png",
      } as const,
    ]) {
      const draft = buildReaction(target, input);
      const parsed = parseReaction({
        ...draft,
        id: "f".repeat(64),
        pubkey: "e".repeat(64),
        created_at: 1_700_000_000,
        sig: "d".repeat(128),
      } as NostrEvent);
      expect(parsed?.targetId).toBe(target.id);
      if (input.type === "like") expect(parsed?.content.type).toBe("like");
      if (input.type === "text") expect(parsed?.content.type).toBe("text");
      if (input.type === "emoji") expect(parsed?.content.type).toBe("emoji");
    }
  });
});
```

**注意:** `parseReaction` の戻り値の形（`ParsedReaction` / `ReactionContent`）は `src/core/nostr/reaction.ts` を読んで実際のフィールド名に合わせること。上のアサーションは形が一致しなければ書き換えてよいが、**「3 種類とも往復する」という主張は落とさない**。

- [ ] **Step 2〜6: Task 6 と同じ手順**

実装:

```ts
// src/core/nostr/build/reaction.ts
import type { NostrEvent } from "../event";
import type { EventDraft } from "./draft";

export type ReactionInput =
  | { type: "like" }
  | { type: "text"; content: string }
  | { type: "emoji"; shortcode: string; url: string };

/**
 * NIP-25 のリアクション。
 *
 * `k` タグは NIP-25 上は MAY だが**必ず入れる** —— 読み取り側の
 * `parseReaction` (`src/core/nostr/reaction.ts`) が既に見ており、
 * 落とすと自分で書いたものを自分で読めなくなる。
 */
export const buildReaction = (
  target: NostrEvent,
  input: ReactionInput,
): EventDraft => {
  const tags: string[][] = [
    ["e", target.id],
    ["p", target.pubkey],
    ["k", String(target.kind)],
  ];
  if (input.type === "emoji") {
    tags.push(["emoji", input.shortcode, input.url]);
  }
  return {
    kind: 7,
    tags,
    content:
      input.type === "like"
        ? "+"
        : input.type === "text"
          ? input.content
          : // NIP-25: "The content can be set only one `:shortcode:`."
            // 飾りを足すと他クライアントが素のテキストとして描く。
            `:${input.shortcode}:`,
  };
};
```

Commit: `feat(v1): buildReaction (NIP-25/30)`

---

## Task 10: `buildDeletion`（NIP-09）

**Files:**
- Create: `src/core/nostr/build/deletion.ts`
- Test: `src/core/nostr/build/deletion.test.ts`

**Interfaces:**
- Produces: `buildDeletion(target: NostrEvent, reason?: string): EventDraft`

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe("buildDeletion", () => {
  it("e と k を持つ kind:5", () => {
    // 捕まえる変異: k を落とす。NIP-09 は SHOULD と言うが、無いとリレーが
    // 置換可能イベントの削除を正しく扱えない実装がある。
    const target = evt({ id: "1".repeat(64), kind: 1 });
    const draft = buildDeletion(target);
    expect(draft.kind).toBe(5);
    expect(draft.tags).toEqual([["e", "1".repeat(64)], ["k", "1"]]);
    expect(draft.content).toBe("");
  });

  it("理由を content に載せる", () => {
    // 捕まえる変異: reason を捨てる
    expect(buildDeletion(evt({}), "誤爆").content).toBe("誤爆");
  });
});
```

- [ ] **Step 2〜6: Task 6 と同じ手順**

実装:

```ts
// src/core/nostr/build/deletion.ts
import type { NostrEvent } from "../event";
import type { EventDraft } from "./draft";

/**
 * NIP-09 の削除依頼。
 *
 * **`target.pubkey` が閲覧者本人でないときに呼んではならない。** リレーは
 * pubkey が一致しない削除依頼を無視するので送っても無害だが、ビルダは
 * `pubkey` を受け取らないので自分のものかどうかを知らない。この検査は
 * `Writer` でもなく**呼び出し側**の責務。
 */
export const buildDeletion = (
  target: NostrEvent,
  reason?: string,
): EventDraft => ({
  kind: 5,
  tags: [
    ["e", target.id],
    ["k", String(target.kind)],
  ],
  content: reason ?? "",
});
```

Commit: `feat(v1): buildDeletion (NIP-09)`

---

## Task 11: `addFollow` / `removeFollow`（NIP-02）

**Files:**
- Create: `src/core/nostr/build/follow.ts`
- Test: `src/core/nostr/build/follow.test.ts`

**Interfaces:**
- Produces:

```ts
export type Mutation = (current: NostrEvent | undefined) => EventDraft;
export const addFollow: (
  pubkey: string,
  options?: { relay?: RelayUrl; petname?: string },
) => Mutation;
export const removeFollow: (pubkey: string) => Mutation;
```

`Mutation` は `Writer.replace` の第 3 引数に**そのまま渡せる形**。`draft.ts` に置いて Task 12/13 と共有する。

### NIP-02 の条文

- `p` タグの位置要素: `["p", <32-bytes hex key>, <main relay URL>, <petname>]`
- *"The `.content` is not used."*
- *"clients should append them to maintain chronological order"*

### 全置換ビルダの共通規則（Task 11〜13 に共通）

- **`current` の対象タグの順序を保つ。**追加は末尾
- **対象外のタグを保つ。**他クライアントが立てた未知のタグを消さない
- **`content` を保つ。**`current` が無いときだけ空文字

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe("addFollow", () => {
  it("末尾に追加し、既存の p の順序を保つ", () => {
    // 捕まえる変異: 新しい配列をソートして作り直す。NIP-02 は
    // "clients should append them to maintain chronological order" と定めており、
    // 並べ替えると全クライアントのフォロー順が壊れる。
    const current = evt({
      kind: 3,
      tags: [["p", "aa"], ["p", "bb"]],
      content: "",
    });
    const draft = addFollow("cc")(current);
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "aa"],
      ["p", "bb"],
      ["p", "cc", "", ""],
    ]);
  });

  it("対象外のタグと content を保つ", () => {
    // 捕まえる変異: tags を p だけで作り直し、content を空にする。
    // 他クライアントがリレーリストの JSON を content に入れており、
    // 消すとその端末の設定が飛ぶ。
    const current = evt({
      kind: 3,
      tags: [["p", "aa"], ["t", "nostr"]],
      content: '{"wss://a.example":{"read":true,"write":true}}',
    });
    const draft = addFollow("cc")(current);
    expect(draft.tags).toContainEqual(["t", "nostr"]);
    expect(draft.content).toBe(current.content);
  });

  it("既に居る pubkey は重複させない", () => {
    // 捕まえる変異: 無条件に push する
    const current = evt({ kind: 3, tags: [["p", "aa"]], content: "" });
    const draft = addFollow("aa")(current);
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([["p", "aa"]]);
  });

  it("current が無ければ 1 件だけのリストを作る", () => {
    // 捕まえる変異: current 無しで例外を投げる。初めてフォローするときに
    // 永久に書けなくなる。
    const draft = addFollow("cc")(undefined);
    expect(draft.kind).toBe(3);
    expect(draft.tags).toEqual([["p", "cc", "", ""]]);
    expect(draft.content).toBe("");
  });

  it("relay と petname を位置要素に載せる", () => {
    // 捕まえる変異: petname を relay の位置に入れる
    const draft = addFollow("cc", {
      relay: "wss://a.example",
      petname: "あいもの",
    })(undefined);
    expect(draft.tags).toEqual([["p", "cc", "wss://a.example", "あいもの"]]);
  });
});

describe("removeFollow", () => {
  it("該当する p だけを落とす", () => {
    // 捕まえる変異: 最初の p を落とす / 全部落とす
    const current = evt({
      kind: 3,
      tags: [["p", "aa"], ["p", "bb"], ["t", "nostr"]],
      content: "x",
    });
    const draft = removeFollow("aa")(current);
    expect(draft.tags).toEqual([["p", "bb"], ["t", "nostr"]]);
    expect(draft.content).toBe("x");
  });

  it("居ない pubkey を消しても失敗しない", () => {
    // 捕まえる変異: 見つからなければ投げる
    const current = evt({ kind: 3, tags: [["p", "aa"]], content: "" });
    expect(removeFollow("zz")(current).tags).toEqual([["p", "aa"]]);
  });

  it("current が無ければ空のリスト", () => {
    expect(removeFollow("zz")(undefined).tags).toEqual([]);
  });
});
```

- [ ] **Step 2〜6: Task 6 と同じ手順**

実装（`Mutation` は `draft.ts` に足す）:

```ts
// src/core/nostr/build/draft.ts に追記
import type { NostrEvent } from "../event";

/**
 * 置換可能イベントの差分適用。`Writer.replace` の第 3 引数に
 * そのまま渡せる形。**`current` を破壊しない。**
 */
export type Mutation = (current: NostrEvent | undefined) => EventDraft;

/**
 * 全置換ビルダの共通規則。`name` のタグだけを `next` へ差し替え、
 * **それ以外のタグと `content` は `current` のまま保つ。**
 *
 * 保つ理由: 他クライアントが立てた未知のタグを消すと、その端末の設定が
 * 黙って飛ぶ。NIP-02 は `.content` を "not used" と言うが、レガシーな
 * クライアントはリレーリストの JSON をそこに入れている。
 */
export const replaceTags = (
  current: NostrEvent | undefined,
  kind: number,
  name: string,
  next: (existing: string[][]) => string[][],
): EventDraft => {
  const tags = current?.tags ?? [];
  const existing = tags.filter((tag) => tag[0] === name);
  const others = tags.filter((tag) => tag[0] !== name);
  return { kind, tags: [...next(existing), ...others], content: current?.content ?? "" };
};
```

```ts
// src/core/nostr/build/follow.ts
import type { RelayUrl } from "../../relay/relay-connection";
import { type Mutation, replaceTags } from "./draft";

const FOLLOW_KIND = 3;

/**
 * NIP-02 のフォロー追加。位置要素は
 * `["p", <32-bytes hex key>, <main relay URL>, <petname>]`。
 *
 * **末尾へ追加する。** NIP-02 は "clients should append them to maintain
 * chronological order" と定めており、並べ替えると全クライアントで
 * フォロー順が壊れる。
 */
export const addFollow = (
  pubkey: string,
  options?: { relay?: RelayUrl; petname?: string },
): Mutation =>
  (current) =>
    replaceTags(current, FOLLOW_KIND, "p", (existing) =>
      existing.some((tag) => tag[1] === pubkey)
        ? existing
        : [...existing, ["p", pubkey, options?.relay ?? "", options?.petname ?? ""]],
    );

export const removeFollow = (pubkey: string): Mutation =>
  (current) =>
    replaceTags(current, FOLLOW_KIND, "p", (existing) =>
      existing.filter((tag) => tag[1] !== pubkey),
    );
```

**注意:** `replaceTags` は対象タグを**先頭**にまとめるので、`removeFollow` のテストで `["t", "nostr"]` が後ろに来る。テストの期待値はこの順序に合わせること。順序の入れ替えが問題になる NIP は無い（`p` 同士の相対順だけが NIP-02 の関心事で、それは保たれる）。

Commit: `feat(v1): addFollow/removeFollow (NIP-02)`

---

## Task 12: `mergeProfile`（NIP-01）と `setRelayList`（NIP-65）

**Files:**
- Create: `src/core/nostr/build/profile.ts`, `src/core/nostr/build/relay-list.ts`
- Test: `src/core/nostr/build/profile.test.ts`, `src/core/nostr/build/relay-list.test.ts`

**Interfaces:**
- Consumes: `Mutation` / `replaceTags`（Task 11）、`RelayListEntry` と `parseRelayList`（`src/core/read/relay-list.ts`）
- Produces:

```ts
export const mergeProfile: (changes: Record<string, unknown>) => Mutation;
export const setRelayList: (entries: readonly RelayListEntry[]) => Mutation;
```

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe("mergeProfile", () => {
  it("current に有って changes に無いキーを残す", () => {
    // 捕まえる変異: changes だけで content を作り直す。他クライアントが
    // 入れた lud16 (Zap の宛先) などが黙って消える。
    const current = evt({
      kind: 0,
      tags: [],
      content: JSON.stringify({ name: "a", lud16: "a@b.example" }),
    });
    const draft = mergeProfile({ name: "b" })(current);
    expect(JSON.parse(draft.content)).toEqual({
      name: "b",
      lud16: "a@b.example",
    });
  });

  it("current の content が壊れていれば changes だけにする", () => {
    // 捕まえる変異: 例外を投げる。壊れた JSON でプロフィールが
    // 永久に編集できなくなる。
    const current = evt({ kind: 0, tags: [], content: "not json" });
    const draft = mergeProfile({ name: "b" })(current);
    expect(JSON.parse(draft.content)).toEqual({ name: "b" });
  });

  it("current が無ければ changes だけ", () => {
    expect(JSON.parse(mergeProfile({ name: "b" })(undefined).content)).toEqual({
      name: "b",
    });
  });

  it("タグを保つ", () => {
    // 捕まえる変異: tags を空にする
    const current = evt({ kind: 0, tags: [["alt", "profile"]], content: "{}" });
    expect(mergeProfile({ name: "b" })(current).tags).toEqual([
      ["alt", "profile"],
    ]);
  });
});

describe("setRelayList", () => {
  it("read と write の両方ならマーカーを付けない", () => {
    // 捕まえる変異: 常に 2 本の r タグ (read と write) を出す。NIP-65 は
    // マーカー無しを「両方」と定めており、冗長なだけでなく他クライアントの
    // 表示で 2 本に見える。
    const draft = setRelayList([
      { url: "wss://a.example" as RelayUrl, read: true, write: true },
    ])(undefined);
    expect(draft.tags).toEqual([["r", "wss://a.example"]]);
  });

  it("片方だけならマーカーを付ける", () => {
    // 捕まえる変異: read/write を取り違える
    const draft = setRelayList([
      { url: "wss://a.example" as RelayUrl, read: true, write: false },
      { url: "wss://b.example" as RelayUrl, read: false, write: true },
    ])(undefined);
    expect(draft.tags).toEqual([
      ["r", "wss://a.example", "read"],
      ["r", "wss://b.example", "write"],
    ]);
  });

  it("read も write も false のエントリは落とす", () => {
    // 捕まえる変異: マーカー無しで出す (= 両方の意味になる)
    const draft = setRelayList([
      { url: "wss://a.example" as RelayUrl, read: false, write: false },
    ])(undefined);
    expect(draft.tags).toEqual([]);
  });

  it("往復: setRelayList で作ったものを parseRelayList が読み戻せる", () => {
    // 捕まえる変異: どちらか一方だけを NIP に沿わせる
    const entries: RelayListEntry[] = [
      { url: "wss://a.example" as RelayUrl, read: true, write: true },
      { url: "wss://b.example" as RelayUrl, read: true, write: false },
      { url: "wss://c.example" as RelayUrl, read: false, write: true },
    ];
    const draft = setRelayList(entries)(undefined);
    const parsed = parseRelayList({
      ...draft,
      id: "f".repeat(64),
      pubkey: "e".repeat(64),
      created_at: 1_700_000_000,
      sig: "d".repeat(128),
    } as NostrEvent);
    expect(parsed).toEqual(entries);
  });

  it("r 以外のタグと content を保つ", () => {
    // 捕まえる変異: tags を r だけで作り直す
    const current = evt({ kind: 10002, tags: [["alt", "relays"]], content: "x" });
    const draft = setRelayList([])(current);
    expect(draft.tags).toEqual([["alt", "relays"]]);
    expect(draft.content).toBe("x");
  });
});
```

- [ ] **Step 2〜6: Task 6 と同じ手順**

実装:

```ts
// src/core/nostr/build/profile.ts
import type { EventDraft, Mutation } from "./draft";

const PROFILE_KIND = 0;

/**
 * kind:0 の差分更新。**`current` に有って `changes` に無いキーを残す** ——
 * 他クライアントが入れた `lud16` (Zap の宛先) などを消さない。
 *
 * `current.content` が JSON として読めなければ `changes` だけにする。
 * 壊れた JSON を保っても誰も得をせず、投げるとプロフィールが永久に
 * 編集できなくなる。
 */
export const mergeProfile =
  (changes: Record<string, unknown>): Mutation =>
  (current): EventDraft => {
    let base: Record<string, unknown> = {};
    if (current) {
      try {
        const parsed: unknown = JSON.parse(current.content);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          base = parsed as Record<string, unknown>;
        }
      } catch {
        // 壊れた JSON。changes だけで作り直す。
      }
    }
    return {
      kind: PROFILE_KIND,
      tags: current?.tags ?? [],
      content: JSON.stringify({ ...base, ...changes }),
    };
  };
```

```ts
// src/core/nostr/build/relay-list.ts
import type { RelayListEntry } from "../../read/relay-list";
import { type Mutation, replaceTags } from "./draft";

const RELAY_LIST_KIND = 10002;

/**
 * NIP-65 の kind:10002。read と write の両方ならマーカーを付けない ——
 * NIP-65 はマーカー無しを「両方」と定めており、`read` と `write` の
 * 2 本に分けると他クライアントの表示で 2 本のリレーに見える。
 *
 * read も write も false のエントリは落とす。意味を持たない。
 */
export const setRelayList =
  (entries: readonly RelayListEntry[]): Mutation =>
  (current) =>
    replaceTags(current, RELAY_LIST_KIND, "r", () =>
      entries.flatMap((entry) => {
        if (entry.read && entry.write) return [["r", entry.url]];
        if (entry.read) return [["r", entry.url, "read"]];
        if (entry.write) return [["r", entry.url, "write"]];
        return [];
      }),
    );
```

Commit: `feat(v1): mergeProfile と setRelayList (NIP-01/65)`

---

## Task 13: `Signer.nip44` とリスト系（NIP-51）

**Files:**
- Modify: `src/core/signer/signer.ts`, `src/core/signer/nip07-signer.ts`
- Create: `src/core/nostr/build/list.ts`, `src/core/nostr/build/mute.ts`, `src/core/nostr/build/bookmark.ts`
- Test: `src/core/nostr/build/mute.test.ts`, `src/core/nostr/build/bookmark.test.ts`

**Interfaces:**
- Consumes: `Mutation` / `replaceTags`（Task 11）
- Produces:

```ts
// signer.ts
export type Signer = {
  getPublicKey(): Promise<string>;
  signEvent(template: UnsignedEvent): Promise<NostrEvent>;
  nip44?: {
    encrypt(peerPubkey: string, plaintext: string): Promise<string>;
    decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
  };
};
export class Nip44UnavailableError extends Error {}

// mute.ts
export type MuteTarget =
  | { type: "pubkey"; value: string }
  | { type: "hashtag"; value: string }
  | { type: "word"; value: string }
  | { type: "thread"; value: string };
export const addMute: (target: MuteTarget) => Mutation;
export const removeMute: (target: MuteTarget) => Mutation;

// bookmark.ts
export type BookmarkTarget =
  | { type: "note"; value: string }
  | { type: "article"; value: string };
export const addBookmark: (target: BookmarkTarget) => Mutation;
export const removeBookmark: (target: BookmarkTarget) => Mutation;
```

### 非公開項目はこのスライスでは書かない

NIP-51 は非公開項目を *"stringified and encrypted using the same scheme from NIP-44"* と定める。NIP-44 は ECDH に秘密鍵を要求し、[ADR-0008](../../adr/0008-signer-only-key-handling.md) によりアプリは鍵を持たないので、署名器へ委譲するしかない。

**このタスクで書くのは公開項目（`tags`）だけ。** `Signer` に `nip44?` を足し、`Nip44UnavailableError` を定義するところまでを行い、`content` の暗号化を使う経路は作らない —— 使う面（設定画面のミュート）がまだ無いので、テストで守れない実装を先に置かない。

`Nip44UnavailableError` は非公開項目を書こうとした呼び出し側が使うために**先に定義だけしておく**。**公開項目として黙って書き換える経路を作ってはならない** —— 非公開のつもりのものが公開されるのは巻き戻せない。

### タグの対応

| `MuteTarget.type` | タグ名 | 備考 |
|---|---|---|
| `pubkey` | `p` | |
| `hashtag` | `t` | |
| `word` | `word` | **小文字化する**（NIP-51 は "lowercase strings"） |
| `thread` | `e` | |

| `BookmarkTarget.type` | タグ名 |
|---|---|
| `note` | `e` |
| `article` | `a` |

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe("addMute", () => {
  it("種別ごとに正しいタグ名を使う", () => {
    // 捕まえる変異: 全部 p タグにする。ハッシュタグや単語のミュートが
    // 「その pubkey をミュート」として他クライアントに読まれる。
    expect(addMute({ type: "pubkey", value: "aa" })(undefined).tags).toEqual([
      ["p", "aa"],
    ]);
    expect(addMute({ type: "hashtag", value: "nostr" })(undefined).tags).toEqual(
      [["t", "nostr"]],
    );
    expect(addMute({ type: "thread", value: "bb" })(undefined).tags).toEqual([
      ["e", "bb"],
    ]);
  });

  it("word は小文字化する", () => {
    // 捕まえる変異: そのまま入れる。NIP-51 は "lowercase strings" と定めており、
    // 大文字のまま入れると読む側の突き合わせが一致しない。
    expect(addMute({ type: "word", value: "Nostr" })(undefined).tags).toEqual([
      ["word", "nostr"],
    ]);
  });

  it("kind は 10000", () => {
    expect(addMute({ type: "pubkey", value: "aa" })(undefined).kind).toBe(10000);
  });

  it("同じ種別の他のタグと content を保つ", () => {
    // 捕まえる変異: p を差し替えるときに t まで消す
    const current = evt({
      kind: 10000,
      tags: [["p", "aa"], ["t", "spam"]],
      content: "encrypted-blob",
    });
    const draft = addMute({ type: "pubkey", value: "bb" })(current);
    expect(draft.tags).toContainEqual(["t", "spam"]);
    expect(draft.tags).toContainEqual(["p", "aa"]);
    expect(draft.tags).toContainEqual(["p", "bb"]);
    expect(draft.content).toBe("encrypted-blob");
  });

  it("重複させない", () => {
    // 捕まえる変異: 無条件に push する
    const current = evt({ kind: 10000, tags: [["p", "aa"]], content: "" });
    expect(
      addMute({ type: "pubkey", value: "aa" })(current).tags.filter(
        (t) => t[0] === "p",
      ),
    ).toEqual([["p", "aa"]]);
  });
});

describe("removeMute", () => {
  it("該当するタグだけを落とす", () => {
    // 捕まえる変異: 同じ値の別種別まで落とす
    const current = evt({
      kind: 10000,
      tags: [["p", "aa"], ["t", "aa"]],
      content: "",
    });
    expect(removeMute({ type: "pubkey", value: "aa" })(current).tags).toEqual([
      ["t", "aa"],
    ]);
  });
});

describe("addBookmark / removeBookmark", () => {
  it("note は e、article は a", () => {
    // 捕まえる変異: 両方 e にする
    expect(addBookmark({ type: "note", value: "aa" })(undefined).tags).toEqual([
      ["e", "aa"],
    ]);
    expect(
      addBookmark({ type: "article", value: "30023:pk:d" })(undefined).tags,
    ).toEqual([["a", "30023:pk:d"]]);
  });

  it("kind は 10003", () => {
    expect(addBookmark({ type: "note", value: "aa" })(undefined).kind).toBe(
      10003,
    );
  });

  it("削除は該当するタグだけを落とす", () => {
    const current = evt({
      kind: 10003,
      tags: [["e", "aa"], ["e", "bb"]],
      content: "",
    });
    expect(removeBookmark({ type: "note", value: "aa" })(current).tags).toEqual([
      ["e", "bb"],
    ]);
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `pnpm vitest run src/core/nostr/build/mute.test.ts src/core/nostr/build/bookmark.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: `Signer` を拡張する**

`src/core/signer/signer.ts`:

```ts
export type Signer = {
  getPublicKey(): Promise<string>;
  signEvent(template: UnsignedEvent): Promise<NostrEvent>;
  /**
   * NIP-07 の `window.nostr.nip44`。**実装しない署名器がある**ので省略可能。
   *
   * NIP-51 の非公開リスト項目は NIP-44 で暗号化する。NIP-44 は ECDH に
   * 秘密鍵を要求するので、鍵を持たないこのアプリ (ADR-0008) は署名器へ
   * 委譲するしかない。
   */
  nip44?: {
    encrypt(peerPubkey: string, plaintext: string): Promise<string>;
    decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
  };
};

/**
 * 署名器が NIP-44 を実装していない。
 *
 * **これを握り潰して公開項目として書いてはならない。** 非公開のつもりの
 * ミュート対象が公開されるのは巻き戻せない。
 */
export class Nip44UnavailableError extends Error {
  constructor(message = "signer does not implement NIP-44") {
    super(message);
    this.name = "Nip44UnavailableError";
  }
}
```

`src/core/signer/nip07-signer.ts` は、既存の `window.nostr` を「今」読む手筋のまま `nip44` を通す。`window.nostr.nip44` が無ければ `nip44` プロパティ自体を生やさない（`undefined` にする）。

- [ ] **Step 4: `list.ts` と 2 つのビルダを実装する**

```ts
// src/core/nostr/build/list.ts
import { type Mutation, replaceTags } from "./draft";

/**
 * NIP-51 のリスト共通。1 つのタグ名の中で値を足す／落とす。
 *
 * **このモジュールは公開項目 (`tags`) だけを扱う。** 非公開項目は
 * `content` を NIP-44 で暗号化する必要があり (NIP-51)、鍵を持たない
 * このアプリでは署名器への委譲が要る (`Nip44UnavailableError`)。使う面が
 * まだ無いので、テストで守れない実装を先に置かない。
 */
export const addToList = (
  kind: number,
  name: string,
  value: string,
): Mutation =>
  (current) =>
    replaceTags(current, kind, name, (existing) =>
      existing.some((tag) => tag[1] === value)
        ? existing
        : [...existing, [name, value]],
    );

export const removeFromList = (
  kind: number,
  name: string,
  value: string,
): Mutation =>
  (current) =>
    replaceTags(current, kind, name, (existing) =>
      existing.filter((tag) => tag[1] !== value),
    );
```

```ts
// src/core/nostr/build/mute.ts
import { type Mutation } from "./draft";
import { addToList, removeFromList } from "./list";

const MUTE_KIND = 10000;

export type MuteTarget =
  | { type: "pubkey"; value: string }
  | { type: "hashtag"; value: string }
  | { type: "word"; value: string }
  | { type: "thread"; value: string };

/**
 * `word` だけ小文字化する —— NIP-51 が "lowercase strings" と定めており、
 * 大文字のまま入れると読む側の突き合わせが一致しない。
 */
const tagOf = (target: MuteTarget): { name: string; value: string } => {
  switch (target.type) {
    case "pubkey":
      return { name: "p", value: target.value };
    case "hashtag":
      return { name: "t", value: target.value };
    case "word":
      return { name: "word", value: target.value.toLowerCase() };
    case "thread":
      return { name: "e", value: target.value };
  }
};

export const addMute = (target: MuteTarget): Mutation => {
  const { name, value } = tagOf(target);
  return addToList(MUTE_KIND, name, value);
};

export const removeMute = (target: MuteTarget): Mutation => {
  const { name, value } = tagOf(target);
  return removeFromList(MUTE_KIND, name, value);
};
```

```ts
// src/core/nostr/build/bookmark.ts
import { type Mutation } from "./draft";
import { addToList, removeFromList } from "./list";

const BOOKMARK_KIND = 10003;

export type BookmarkTarget =
  | { type: "note"; value: string }
  | { type: "article"; value: string };

const tagOf = (target: BookmarkTarget): { name: string; value: string } =>
  target.type === "note"
    ? { name: "e", value: target.value }
    : { name: "a", value: target.value };

export const addBookmark = (target: BookmarkTarget): Mutation => {
  const { name, value } = tagOf(target);
  return addToList(BOOKMARK_KIND, name, value);
};

export const removeBookmark = (target: BookmarkTarget): Mutation => {
  const { name, value } = tagOf(target);
  return removeFromList(BOOKMARK_KIND, name, value);
};
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm vitest run src/core/nostr/build/`
Expected: PASS

- [ ] **Step 6: 「捕まえる変異」を確認する**

`word` の小文字化を外したときにテストが落ちること、種別のタグ名を取り違えたときに落ちることは必ず目で見る。

- [ ] **Step 7: 整形・全体テスト・Commit**

```bash
pnpm exec biome check --write src/core/signer/ src/core/nostr/build/
pnpm exec tsc --noEmit
pnpm vitest run
git add src/core/signer/ src/core/nostr/build/
git commit -m "feat(v1): NIP-51 のリスト系と Signer の NIP-44"
```

---

## Task 14: `v1.tsx` の配線

**Files:**
- Modify: `src/routes/v1.tsx`（`handlePost` と、`publisher` を組み立てているあたり）
- Test: `e2e/v1.spec.ts`（変更しない。既存が回帰テストになる）

**Interfaces:**
- Consumes: `createWriter`（Task 3/5）、`fetchLatest`（Task 4）

### 壊してはならないもの

`optimisticInsertMs` は `store.put()` から `setOptimisticEvents()` までを `performance.now()` で挟んで測っている（[ADR-0011](../../adr/0011-performance-budget.md) の 100ms 予算、仕様 10 節 問い 3）。**`signEvent` を含めないことが本質**なので、`Writer` の `onOptimisticInsert` フックの中で計測を完結させる。

- [ ] **Step 1: `writer` を組み立てる**

`publisher` を作っている場所のすぐ下に足す。

```ts
  const writer = createWriter({
    signer: createNip07Signer(),
    store,
    publisher,
    pubkey: () => {
      const pk = pubkey();
      if (!pk) throw new SignerUnavailableError();
      return pk;
    },
    fetchLatest: (kind, identifier, author) =>
      fetchLatest(
        {
          pool: manager.pool,
          routing,
          store,
          fallbackRelays: RELAYS_OVERRIDE ?? FALLBACK_RELAYS,
        },
        kind,
        identifier,
        author,
      ),
  });
```

`routing` / `manager` / `store` の実際の変数名は `v1.tsx` を読んで合わせること。`RELAYS_OVERRIDE` の扱いは、既存の `publisher` の `fallbackRelays` と**同じ式**を使う。

- [ ] **Step 2: `handlePost` を差し替える**

```ts
    try {
      let optimisticStart = 0;
      const result = await writer.publish(
        { kind: 1, tags: [], content: text },
        {
          onOptimisticInsert: (signed) => {
            // ここは store.put() の直後に**同期的に**呼ばれる。
            // signEvent を含めずに測るという性質はこの位置に依存する
            // (ADR-0011、仕様 10 節 問い 3)。
            optimisticStart = performance.now();
            setOptimisticEvents((prev) => [signed, ...prev]);
            setOptimisticInsertMs(performance.now() - optimisticStart);
          },
        },
      );
      setContent("");
      setPublishResult(result);
    } catch (error) {
      if (error instanceof WriteFailedError) {
        // Writer が store と永続層から取り除いているので、こちらは
        // 表示中の楽観リストと本文を戻す (spec 5.1 節: 戻す先は
        // 書き込む側ごとに違うので Writer は扱わない)。
        setOptimisticEvents((prev) => prev.filter((e) => e.content !== text));
        setPostError(
          `どのリレーにも届きませんでした (${error.rejected.length} 本が拒否)`,
        );
      } else if (error instanceof SignerUnavailableError) {
        setPostError("拡張機能が見つかりません。");
      } else {
        setPostError(
          `投稿に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      setPosting(false);
    }
```

**注意:** `verifyOptimisticInsert(store.put(...))` は `Writer` の中へ移すか、ここで落とすかを決める必要がある。`Writer` は `store.put()` の戻り値を今は捨てている —— **`writer.ts` の `store.put` を `verifyOptimisticInsert(store.put(...))` に変え、Task 3 のテストに「検証に落ちる署名は例外になる」を 1 件足す**こと。`verify-optimistic-insert.ts` のコメントに理由が書いてある。

- [ ] **Step 3: 型検査**

Run: `pnpm exec tsc --noEmit`
Expected: エラー 0

- [ ] **Step 4: ユニットテストと e2e を走らせる**

```bash
pnpm vitest run
pnpm exec playwright test
```
Expected: 両方とも全件 PASS。特に `e2e/v1.spec.ts` の「投稿が自分のカラムに出る」「リロードで残る」「optimisticInsertMs が出る」が通ること。

- [ ] **Step 5: 巻き戻しを手で確かめる**

`writer.publish` の中で `publisher.publish` の戻り値を一時的に `{ accepted: [], rejected: [{ relay: "wss://x", reason: "test" }] }` に固定し、`pnpm dev` で投稿して次を目で見る。

1. 投稿がカラムに一瞬出て消える
2. エラー文言が出る
3. リロードしても投稿が復活しない（永続層からも消えている）

確認したら固定を戻す。**これはこのスライスで唯一「巻き戻しが本当に効くか」を実測する経路**なので飛ばさない。

- [ ] **Step 6: 整形・Commit**

```bash
pnpm exec biome check --write src/routes/v1.tsx src/core/write/writer.ts
git add src/routes/v1.tsx src/core/write/writer.ts src/core/write/writer.test.ts
git commit -m "feat(v1): compose を Writer 経由にする"
```

---

## Task 15: 記録の更新

**Files:**
- Modify: `docs/design/v1-feature-inventory.md`, `docs/design/read-layer-followups.md`

- [ ] **Step 1: 棚卸しの 1.1 / 1.2 を消化済みにする**

`v1-feature-inventory.md` の「1.1 イベントビルダ」「1.2 書き込みの共通経路」に、このスライスで作ったものと**残したもの**を書く。残ったのは:

- NIP-46（1.3）
- kind:30078（デッキの NIP-78 保存）
- 署名要求のデバウンス
- 非公開リスト項目（NIP-44 の暗号化経路）
- 削除の表示への反映

- [ ] **Step 2: followups にスライスの記録を足す**

`read-layer-followups.md` の末尾に「書き込みの土台（2026-08-22）」の節を作り、実装中に分かったことを書く。最低限、次の 2 つは記録する。

- `EventStore.remove()` で置換可能イベントの索引を張り直す必要があったこと（直前の版が見えなくなる罠）
- `fetchLatest` が `identifier` を投げること、と kind:30078 を載せる前に `EventStore` の置換可能索引へ `d` を足す必要があること

- [ ] **Step 3: Commit**

```bash
git add docs/design/
git commit -m "docs: 書き込みの土台の記録"
```

---

## 自己レビュー

**spec 網羅:** spec 1 節の「含む」6 項目に対し、ビルダ = Task 6〜13、`Writer` = Task 3/5、read-modify-write = Task 5、`EventStore.remove` / `EventPersistence.delete` = Task 1/2、`Signer` の NIP-44 = Task 13、`v1.tsx` の配線 = Task 14。spec 10.4 節「新しい e2e は書かない」は Task 14 Step 4 で既存 e2e を回すことに対応。

**spec との食い違いを 1 つ検出した。** spec 7.1 節が `p` タグから「自分自身は落とす」と書いているが、ビルダは `pubkey` を受け取らない設計なので実装できない。Task 6 Step 6 で spec 側を直すことにした。

**型の一貫性:** `EventDraft`（Task 1）と `Mutation`（Task 11）はどちらも `draft.ts`。`Mutation` を使うのは Task 11/12/13 で、いずれも `Writer.replace` の第 3 引数の型（`(current: NostrEvent | undefined) => EventDraft`）と一致する。`replaceTags` は Task 11 で導入し Task 12/13 が使う。

**残った既知の粗さ:** Task 4 のテストは主張（捕まえる変異）だけを与えて本体を実装者に書かせている。`FakeRelayConnection` の API を計画側で固定すると、実際の API と食い違ったときに実装者が計画に引きずられるため。`src/core/read/bootstrap.test.ts` を先例として指している。
