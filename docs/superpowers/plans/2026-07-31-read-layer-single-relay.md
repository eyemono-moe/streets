# 読み取り層 — 単一リレーのセクション読み取り Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1 つのリレーを指定したセクションが、イベントを時系列降順で表示し、読み込み状態を報告できるようにする。あわせて NIP-11 のリレー情報を非 Nostr ソースとして扱えることを実証する。

**Architecture:** Nostr の高水準ライブラリを使わず、`@noble` / `@scure` のプリミティブだけを借りる（[ADR-0020](../../adr/0020-no-nostr-library-noble-primitives-only.md)）。`RelayConnection` は「1 つのリレーとだけ話す」薄い seam。その上に `SectionReader`（フレームワーク非依存の中核）を置き、SolidJS 向けの `createSection` は薄いラッパにする。Outbox ルーティング・needs の波状解決・ページネーション・永続化は後続の計画で足す。

**Tech Stack:** TypeScript / SolidJS / @noble/curves / @noble/hashes / @scure/base / Vitest / Playwright / Biome

## Global Constraints

- 用語は `CONTEXT.md` に従う。セクション・ソース・レンダラ・読み取り層・署名器などの語を勝手に言い換えない。
- 設計判断の理由は `docs/adr/` にある。ADR に反する実装をしない。
- **新しいコードで `nostr-tools` / `rx-nostr` / `rx-nostr-crypto` / `@rust-nostr/nostr-sdk` / `nostr-typedef` を import しない**（[ADR-0020](../../adr/0020-no-nostr-library-noble-primitives-only.md)）。既存コードは並存させたまま触らない。
- **暗号を自作しない。** 署名検証は `@noble/curves`、ハッシュは `@noble/hashes`。NIP-44 は署名器に委譲するため、この計画では一切扱わない。
- 受信イベントは**全件検証する**。id の再計算と schnorr 署名検証の両方（非機能要件・セキュリティ）。
- 1 セクションが保持するイベントは 500 件が上限（[ADR-0011](../../adr/0011-performance-budget.md)）。
- NIP-11 の取得は失敗しうる（CORS）。**失敗してもセクションは動き続けること。**
- 新しいファイルはケバブケース。Lint/format は Biome。コミット前に `pnpm fix` と `pnpm typecheck` を通す。
- テストコマンドは `pnpm exec vitest run <path>`。`pnpm test` は watch モードなので使わない。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/core/nostr/event.ts` | Nostr イベントの型、id の計算、署名検証 |
| `src/core/nostr/nip19.ts` | npub / nsec / note / nevent / naddr の bech32 エンコード・デコード |
| `src/core/relay/relay-connection.ts` | `RelayConnection` インターフェースと関連する型。実装を含まない |
| `src/core/relay/fake-relay-connection.ts` | テスト用アダプタ |
| `src/core/relay/websocket-relay-connection.ts` | NIP-01 を話す実アダプタ（自前 WebSocket） |
| `src/core/relay/relay-info.ts` | NIP-11 リレー情報の取得とキャッシュ |
| `src/core/read/event-store.ts` | 同期・メモリのイベント保管 |
| `src/core/read/source.ts` | `Source` / `Order` / `SectionStatus` の型 |
| `src/core/read/section-reader.ts` | セクション 1 つ分の読み取り中核。フレームワーク非依存 |
| `src/core/solid/create-section.ts` | `SectionReader` の SolidJS ラッパ |
| `src/routes/debug/v1-section.tsx` | 動作確認用デバッグルート |
| `e2e/v1-section.spec.ts` | ローカルリレーに対する e2e |

既存の `src/core/{transport,query,repository,store,view,solid}` はこの計画では**削除しない**。後続の計画でまとめて消す。並存中は新しいコードが古いコードを import しないことだけ守る。

---

### Task 1: Nostr プリミティブ（id 計算・署名検証・NIP-19）

**Files:**
- Modify: `package.json`（依存追加）
- Create: `src/core/nostr/event.ts`
- Create: `src/core/nostr/nip19.ts`
- Test: `src/core/nostr/event.test.ts`
- Test: `src/core/nostr/nip19.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `type NostrEvent = { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string }`
  - `type UnsignedEvent = Omit<NostrEvent, "id" | "sig">`
  - `function computeEventId(event: UnsignedEvent): string`
  - `function verifyEvent(event: NostrEvent): boolean` — id の一致と schnorr 署名の両方を検証
  - `function encodeBech32(prefix: string, dataHex: string): string`
  - `function decodeBech32(value: string): { prefix: string; dataHex: string }`

- [ ] **Step 1: 依存を追加**

`nostr-tools` 経由の推移的依存（`@noble/curves` 1.2.0）は古い。直接依存として入れ直す。

```bash
pnpm add @noble/curves @noble/hashes @scure/base
```

Run: `pnpm ls @noble/curves @noble/hashes @scure/base --depth 0`
Expected: それぞれ 2.x が直接依存として並ぶ

- [ ] **Step 2: 失敗するテストを書く**

`src/core/nostr/event.test.ts`:

テストベクタをハードコードしない。**その場で署名して自己整合的に検証する。** 実ネットワークとの相互運用性は Task 7 の e2e で担保する（ローカルリレーから届く実イベントが `verifyEvent` を通らなければ、セクションは空のままになり e2e が落ちる）。

`src/core/nostr/event.test.ts`:

```ts
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import {
  computeEventId,
  type NostrEvent,
  type UnsignedEvent,
  verifyEvent,
} from "./event";

// 決定的な秘密鍵。テストの再現性のため固定する。
const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const sign = (
  overrides: Partial<UnsignedEvent> = {},
): NostrEvent => {
  const unsigned: UnsignedEvent = {
    pubkey,
    created_at: 1_700_000_000,
    kind: 1,
    tags: [["e", "a".repeat(64)]],
    content: "hello nostr",
    ...overrides,
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(id, secretKey)) };
};

describe("computeEventId", () => {
  it("is stable for the same input", () => {
    const event = sign();
    const { id, sig, ...unsigned } = event;
    expect(computeEventId(unsigned)).toBe(id);
  });

  it("changes when any serialized field changes", () => {
    const { id, sig, ...unsigned } = sign();
    expect(computeEventId({ ...unsigned, content: "different" })).not.toBe(id);
    expect(computeEventId({ ...unsigned, kind: 7 })).not.toBe(id);
    expect(computeEventId({ ...unsigned, created_at: 1 })).not.toBe(id);
    expect(computeEventId({ ...unsigned, tags: [] })).not.toBe(id);
  });

  it("produces a 64 character lowercase hex string", () => {
    const { id } = sign();
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyEvent", () => {
  it("accepts a correctly signed event", () => {
    expect(verifyEvent(sign())).toBe(true);
  });

  it("rejects an event whose content was tampered with", () => {
    // content を変えると id が合わなくなる
    expect(verifyEvent({ ...sign(), content: "tampered" })).toBe(false);
  });

  it("rejects an event whose id does not match its fields", () => {
    expect(verifyEvent({ ...sign(), id: "0".repeat(64) })).toBe(false);
  });

  it("rejects an event signed by a different key", () => {
    const otherKey = Uint8Array.from({ length: 32 }, (_, i) => i + 2);
    const event = sign();
    const forged = { ...event, sig: bytesToHex(schnorr.sign(event.id, otherKey)) };
    expect(verifyEvent(forged)).toBe(false);
  });

  it("rejects an event with a malformed signature", () => {
    expect(verifyEvent({ ...sign(), sig: "zz" })).toBe(false);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm exec vitest run src/core/nostr/event.test.ts`
Expected: FAIL — `Failed to resolve import "./event"`

- [ ] **Step 4: `event.ts` を実装**

```ts
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type UnsignedEvent = Omit<NostrEvent, "id" | "sig">;

/**
 * NIP-01 の正規化シリアライズ。
 * [0, pubkey, created_at, kind, tags, content] を空白なしの JSON にして sha256。
 */
export const computeEventId = (event: UnsignedEvent): string => {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return bytesToHex(sha256(utf8ToBytes(serialized)));
};

/**
 * リレーは信用できない。id の再計算と schnorr 署名の両方を検証する。
 * 暗号は @noble/curves に委ねる (ADR-0020)。
 */
export const verifyEvent = (event: NostrEvent): boolean => {
  const { id, sig, ...unsigned } = event;
  if (computeEventId(unsigned) !== id) return false;
  try {
    return schnorr.verify(sig, id, event.pubkey);
  } catch {
    // 不正な長さや非16進の署名は例外になる
    return false;
  }
};
```

`@noble/curves` v2 のエクスポート名が異なる場合は次で確認する。
Run: `pnpm exec node --input-type=module -e "console.log(Object.keys(await import('@noble/curves/secp256k1.js')))"`

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm exec vitest run src/core/nostr/event.test.ts`
Expected: PASS（8 件）

- [ ] **Step 6: NIP-19 の失敗するテストを書く**

`src/core/nostr/nip19.test.ts`:

bech32 は `@scure/base` の実装をそのまま使うため、ここで検証するのは**ラッパの往復と形式**であって bech32 アルゴリズムそのものではない。実際の npub との相互運用は、アプリに実データが流れた時点で確認される。

```ts
import { describe, expect, it } from "vitest";
import { decodeBech32, encodeBech32 } from "./nip19";

const pubkeyHex =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

describe("nip19", () => {
  it("produces a value with the requested prefix", () => {
    const encoded = encodeBech32("npub", pubkeyHex);
    expect(encoded.startsWith("npub1")).toBe(true);
    expect(encoded).toMatch(/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/);
  });

  it("round-trips a public key", () => {
    expect(decodeBech32(encodeBech32("npub", pubkeyHex))).toEqual({
      prefix: "npub",
      dataHex: pubkeyHex,
    });
  });

  it("round-trips an arbitrary prefix", () => {
    expect(decodeBech32(encodeBech32("note", pubkeyHex))).toEqual({
      prefix: "note",
      dataHex: pubkeyHex,
    });
  });

  it("throws on a value with a broken checksum", () => {
    const encoded = encodeBech32("npub", pubkeyHex);
    expect(() =>
      decodeBech32(`${encoded.slice(0, -1)}${encoded.at(-1) === "q" ? "p" : "q"}`),
    ).toThrow();
  });
});
```

- [ ] **Step 7: `nip19.ts` を実装**

```ts
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { bech32 } from "@scure/base";

/** NIP-19 の bech32 は 5000 文字まで許容する（既定の 90 では naddr が入らない） */
const LIMIT = 5000;

export const encodeBech32 = (prefix: string, dataHex: string): string =>
  bech32.encode(prefix, bech32.toWords(hexToBytes(dataHex)), LIMIT);

export const decodeBech32 = (
  value: string,
): { prefix: string; dataHex: string } => {
  const { prefix, words } = bech32.decode(value, LIMIT);
  return { prefix, dataHex: bytesToHex(bech32.fromWords(words)) };
};
```

TLV 形式（`nevent` / `naddr` / `nprofile`）はこの計画では扱わない。単純な 32 バイト型（`npub` / `note`）のみ。TLV はリンク解決を実装する計画で足す。

- [ ] **Step 8: テストが通ることを確認**

Run: `pnpm exec vitest run src/core/nostr`
Expected: PASS（12 件）

- [ ] **Step 9: Lint と型チェック、コミット**

```bash
pnpm fix && pnpm typecheck
git add package.json pnpm-lock.yaml src/core/nostr
git commit -m "feat(nostr): add event id, signature verification and bech32 primitives"
```

---

### Task 2: `RelayConnection` インターフェースと fake アダプタ

**Files:**
- Create: `src/core/relay/relay-connection.ts`
- Create: `src/core/relay/fake-relay-connection.ts`
- Test: `src/core/relay/fake-relay-connection.test.ts`

**Interfaces:**
- Consumes: `NostrEvent`（Task 1）
- Produces:
  - `type RelayUrl = string`
  - `type RelayFilter = { ids?: string[]; authors?: string[]; kinds?: number[]; since?: number; until?: number; limit?: number; search?: string; [tag: \`#${string}\`]: string[] | number[] | number | string | undefined }`
  - `type RelaySubscriptionHandlers = { onEvent(event: NostrEvent): void; onEose(): void; onClosed(reason: string): void }`
  - `interface RelaySubscription { close(): void }`
  - `interface RelayConnection { readonly url: RelayUrl; subscribe(filters: RelayFilter[], handlers: RelaySubscriptionHandlers): RelaySubscription; publish(event: NostrEvent): Promise<void>; close(): void }`
  - `class FakeRelayConnection implements RelayConnection` — 追加で `emitEvent(subIndex, event)` / `emitEose(subIndex)` / `emitClosed(subIndex, reason)` / `readonly subscriptions: { filters: RelayFilter[]; closed: boolean }[]` / `readonly published: NostrEvent[]`

- [ ] **Step 1: `relay-connection.ts` を書く**

```ts
import type { NostrEvent } from "../nostr/event";

export type RelayUrl = string;

export type RelayFilter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
} & {
  [tag: `#${string}`]: string[] | undefined;
};

export type RelaySubscriptionHandlers = {
  onEvent: (event: NostrEvent) => void;
  onEose: () => void;
  onClosed: (reason: string) => void;
};

export interface RelaySubscription {
  close(): void;
}

/**
 * 1つのリレーとだけ話す。複数リレーへの同報も、
 * どのリレーを選ぶかの判断も含まない (ADR-0014)。
 */
export interface RelayConnection {
  readonly url: RelayUrl;
  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription;
  publish(event: NostrEvent): Promise<void>;
  close(): void;
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/core/relay/fake-relay-connection.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { FakeRelayConnection } from "./fake-relay-connection";

const event = (id: string): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: 100,
  kind: 1,
  tags: [],
  content: id,
  sig: `${id}-sig`,
});

describe("FakeRelayConnection", () => {
  it("records the filters each subscription was opened with", () => {
    const relay = new FakeRelayConnection("wss://fake");

    relay.subscribe([{ kinds: [1], limit: 20 }], {
      onEvent: vi.fn(),
      onEose: vi.fn(),
      onClosed: vi.fn(),
    });

    expect(relay.subscriptions).toHaveLength(1);
    expect(relay.subscriptions[0].filters).toEqual([{ kinds: [1], limit: 20 }]);
    expect(relay.subscriptions[0].closed).toBe(false);
  });

  it("delivers events and eose only to the targeted subscription", () => {
    const relay = new FakeRelayConnection("wss://fake");
    const first = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    const second = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    relay.subscribe([{ kinds: [1] }], first);
    relay.subscribe([{ kinds: [7] }], second);

    relay.emitEvent(0, event("note-1"));
    relay.emitEose(0);

    expect(first.onEvent).toHaveBeenCalledWith(event("note-1"));
    expect(first.onEose).toHaveBeenCalledTimes(1);
    expect(second.onEvent).not.toHaveBeenCalled();
    expect(second.onEose).not.toHaveBeenCalled();
  });

  it("stops delivering after the subscription is closed", () => {
    const relay = new FakeRelayConnection("wss://fake");
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    const sub = relay.subscribe([{ kinds: [1] }], handlers);
    sub.close();
    relay.emitEvent(0, event("note-1"));

    expect(relay.subscriptions[0].closed).toBe(true);
    expect(handlers.onEvent).not.toHaveBeenCalled();
  });

  it("reports published events in order", async () => {
    const relay = new FakeRelayConnection("wss://fake");

    await relay.publish(event("note-1"));
    await relay.publish(event("note-2"));

    expect(relay.published.map((e) => e.id)).toEqual(["note-1", "note-2"]);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm exec vitest run src/core/relay/fake-relay-connection.test.ts`
Expected: FAIL — `Failed to resolve import "./fake-relay-connection"`

- [ ] **Step 4: `fake-relay-connection.ts` を実装**

```ts
import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "./relay-connection";

type FakeSubscription = {
  filters: RelayFilter[];
  handlers: RelaySubscriptionHandlers;
  closed: boolean;
};

/**
 * テスト用の RelayConnection。
 * emitEvent / emitEose / emitClosed で任意のタイミングを再現する。
 */
export class FakeRelayConnection implements RelayConnection {
  readonly subscriptions: FakeSubscription[] = [];
  readonly published: NostrEvent[] = [];
  closed = false;

  constructor(readonly url: RelayUrl) {}

  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription {
    const index = this.subscriptions.length;
    this.subscriptions.push({ filters, handlers, closed: false });
    return {
      close: () => {
        this.subscriptions[index].closed = true;
      },
    };
  }

  async publish(event: NostrEvent): Promise<void> {
    this.published.push(event);
  }

  close(): void {
    this.closed = true;
    for (const sub of this.subscriptions) sub.closed = true;
  }

  emitEvent(subIndex: number, event: NostrEvent): void {
    const sub = this.subscriptions[subIndex];
    if (!sub || sub.closed) return;
    sub.handlers.onEvent(event);
  }

  emitEose(subIndex: number): void {
    const sub = this.subscriptions[subIndex];
    if (!sub || sub.closed) return;
    sub.handlers.onEose();
  }

  emitClosed(subIndex: number, reason: string): void {
    const sub = this.subscriptions[subIndex];
    if (!sub || sub.closed) return;
    sub.closed = true;
    sub.handlers.onClosed(reason);
  }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm exec vitest run src/core/relay/fake-relay-connection.test.ts`
Expected: PASS（4 件）

- [ ] **Step 6: Lint と型チェック、コミット**

```bash
pnpm fix && pnpm typecheck
git add src/core/relay/relay-connection.ts src/core/relay/fake-relay-connection.ts src/core/relay/fake-relay-connection.test.ts
git commit -m "feat(read): add single-relay RelayConnection seam with fake adapter"
```

---

### Task 3: 同期メモリ `EventStore`

**Files:**
- Create: `src/core/read/event-store.ts`
- Test: `src/core/read/event-store.test.ts`

`src/core/store/memory-event-store.ts` は旧 transport 型に依存しているため流用しない。この計画で不要なもの（置換可能イベントの解決・フィルタ照合）は入れない。後続の計画で必要になった時点で足す。

**Interfaces:**
- Consumes: `NostrEvent` / `verifyEvent`（Task 1）、`RelayUrl`（Task 2）
- Produces:
  - `type PutResult = "inserted" | "duplicate" | "rejected"`
  - `class EventStore` — `put(event: NostrEvent, relay: RelayUrl): PutResult` / `get(id: string): NostrEvent | undefined` / `seenRelays(id: string): RelayUrl[]` / `readonly size: number`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/event-store.test.ts`:

```ts
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { computeEventId, type NostrEvent } from "../nostr/event";
import { EventStore } from "./event-store";

// Task 1 と同じく、その場で署名して自己整合的なイベントを作る
const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const sign = (content = "hello nostr"): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content,
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(id, secretKey)) };
};

const validEvent = sign();

describe("EventStore", () => {
  it("stores a valid event once and tracks every relay that saw it", () => {
    const store = new EventStore();

    expect(store.put(validEvent, "wss://a")).toBe("inserted");
    expect(store.put(validEvent, "wss://b")).toBe("duplicate");

    expect(store.get(validEvent.id)).toEqual(validEvent);
    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a", "wss://b"]);
    expect(store.size).toBe(1);
  });

  it("does not record the same relay twice", () => {
    const store = new EventStore();

    store.put(validEvent, "wss://a");
    store.put(validEvent, "wss://a");

    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a"]);
  });

  it("rejects events whose signature does not verify", () => {
    const store = new EventStore();
    const tampered = { ...validEvent, content: "tampered" };

    expect(store.put(tampered, "wss://a")).toBe("rejected");
    expect(store.size).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run src/core/read/event-store.test.ts`
Expected: FAIL — `Failed to resolve import "./event-store"`

- [ ] **Step 3: `event-store.ts` を実装**

```ts
import { type NostrEvent, verifyEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";

export type StoredEvent = {
  event: NostrEvent;
  seenRelays: RelayUrl[];
};

export type PutResult = "inserted" | "duplicate" | "rejected";

/**
 * 同期・メモリのイベント保管。
 * IndexedDB による永続化は後続の計画で「背後の水和・退避層」として足す (ADR-0018)。
 */
export class EventStore {
  readonly #events = new Map<string, StoredEvent>();

  get size(): number {
    return this.#events.size;
  }

  put(event: NostrEvent, relay: RelayUrl): PutResult {
    const existing = this.#events.get(event.id);
    if (existing) {
      if (!existing.seenRelays.includes(relay)) existing.seenRelays.push(relay);
      return "duplicate";
    }

    // リレーは信用できない。全件検証する。
    if (!verifyEvent(event)) return "rejected";

    this.#events.set(event.id, { event, seenRelays: [relay] });
    return "inserted";
  }

  get(id: string): NostrEvent | undefined {
    return this.#events.get(id)?.event;
  }

  seenRelays(id: string): RelayUrl[] {
    return this.#events.get(id)?.seenRelays ?? [];
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm exec vitest run src/core/read/event-store.test.ts`
Expected: PASS（3 件）

- [ ] **Step 5: Lint と型チェック、コミット**

```bash
pnpm fix && pnpm typecheck
git add src/core/read/event-store.ts src/core/read/event-store.test.ts
git commit -m "feat(read): add synchronous in-memory EventStore with signature verification"
```

---

### Task 4: `SectionReader` — セクション 1 つ分の読み取り中核

**Files:**
- Create: `src/core/read/source.ts`
- Create: `src/core/read/section-reader.ts`
- Test: `src/core/read/section-reader.test.ts`

**Interfaces:**
- Consumes: `NostrEvent`（Task 1）、`RelayConnection` / `RelayFilter` / `RelayUrl`（Task 2）、`EventStore`（Task 3）
- Produces:
  - `type NostrSource = { type: "nostr"; filters: RelayFilter[]; relays?: RelayUrl[] }`
  - `type RelayInfoSource = { type: "relay-info"; url: RelayUrl }`（型のみ。実装は Task 6）
  - `type Source = NostrSource | RelayInfoSource`
  - `type Order = "created-at-desc" | "created-at-asc" | "thread-tree"`
  - `type SectionStatus = { phase: "initial" | "streaming" | "settled"; incomplete?: { unreachableRelays: number; unroutableAuthors: number } }`
  - `const MAX_ITEMS_PER_SECTION = 500`
  - `class SectionReader` — `constructor(options: { source: NostrSource; order: Order; store: EventStore; openRelay: (url: RelayUrl) => RelayConnection })` / `start()` / `stop()` / `subscribe(listener: () => void): () => void` / `get items(): NostrEvent[]` / `get status(): SectionStatus`

`order` は `"created-at-desc"` と `"created-at-asc"` のみ実装する。`"thread-tree"` はスレッドカラムの計画で足すため、それまでは降順として扱う。

- [ ] **Step 1: `source.ts` を書く**

```ts
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

export type NostrSource = {
  type: "nostr";
  filters: RelayFilter[];
  /** 指定した場合は Outbox ルーティングをバイパスする (ADR-0005) */
  relays?: RelayUrl[];
};

/** NIP-11。Nostr イベントですらない供給元 (ADR-0003) */
export type RelayInfoSource = {
  type: "relay-info";
  url: RelayUrl;
};

export type Source = NostrSource | RelayInfoSource;

export type Order = "created-at-desc" | "created-at-asc" | "thread-tree";

/**
 * セクション自身のリストについてのみ語る。
 * レンダラの遅延取得は含めない (ADR-0015)。
 */
export type SectionStatus = {
  phase: "initial" | "streaming" | "settled";
  incomplete?: {
    unreachableRelays: number;
    unroutableAuthors: number;
  };
};

/** ADR-0011 の性能予算 */
export const MAX_ITEMS_PER_SECTION = 500;
```

- [ ] **Step 2: 失敗するテストを書く**

`src/core/read/section-reader.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import { EventStore } from "./event-store";
import { SectionReader } from "./section-reader";
import { MAX_ITEMS_PER_SECTION } from "./source";

// 署名検証を通さずに SectionReader だけを試すため、EventStore を差し替える
class PassThroughStore extends EventStore {
  readonly #seen = new Set<string>();
  override put(event: NostrEvent): "inserted" | "duplicate" | "rejected" {
    if (this.#seen.has(event.id)) return "duplicate";
    this.#seen.add(event.id);
    return "inserted";
  }
}

const event = (id: string, createdAt: number): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: createdAt,
  kind: 1,
  tags: [],
  content: id,
  sig: "sig",
});

const setup = () => {
  const relay = new FakeRelayConnection("wss://a");
  const reader = new SectionReader({
    source: { type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://a"] },
    order: "created-at-desc",
    store: new PassThroughStore(),
    openRelay: () => relay,
  });
  return { relay, reader };
};

describe("SectionReader", () => {
  it("starts in the initial phase before anything arrives", () => {
    const { reader } = setup();
    reader.start();

    expect(reader.status.phase).toBe("initial");
    expect(reader.items).toEqual([]);
  });

  it("moves to streaming once the first event arrives", () => {
    const { relay, reader } = setup();
    reader.start();

    relay.emitEvent(0, event("first", 100));

    expect(reader.status.phase).toBe("streaming");
    expect(reader.items.map((e) => e.id)).toEqual(["first"]);
  });

  it("settles when every relay has sent eose", () => {
    const { relay, reader } = setup();
    reader.start();

    relay.emitEvent(0, event("first", 100));
    relay.emitEose(0);

    expect(reader.status.phase).toBe("settled");
  });

  it("orders items by created_at descending", () => {
    const { relay, reader } = setup();
    reader.start();

    relay.emitEvent(0, event("older", 100));
    relay.emitEvent(0, event("newer", 200));

    expect(reader.items.map((e) => e.id)).toEqual(["newer", "older"]);
  });

  it("does not list the same event twice when two relays deliver it", () => {
    const relayA = new FakeRelayConnection("wss://a");
    const relayB = new FakeRelayConnection("wss://b");
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://a", "wss://b"],
      },
      order: "created-at-desc",
      store: new PassThroughStore(),
      openRelay: (url) => (url === "wss://a" ? relayA : relayB),
    });
    reader.start();

    const shared = event("shared", 100);
    relayA.emitEvent(0, shared);
    relayB.emitEvent(0, shared);

    expect(reader.items).toHaveLength(1);
  });

  it("counts a closed relay as unreachable", () => {
    const { relay, reader } = setup();
    reader.start();

    relay.emitClosed(0, "blocked: rate limited");

    expect(reader.status.incomplete?.unreachableRelays).toBe(1);
  });

  it("keeps at most MAX_ITEMS_PER_SECTION items, dropping the oldest", () => {
    const { relay, reader } = setup();
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION + 10; i += 1) {
      relay.emitEvent(0, event(`note-${i}`, 1000 + i));
    }

    expect(reader.items).toHaveLength(MAX_ITEMS_PER_SECTION);
    expect(reader.items.at(-1)?.id).toBe("note-10");
  });

  it("notifies listeners when items change", () => {
    const { relay, reader } = setup();
    const listener = vi.fn();
    reader.subscribe(listener);
    reader.start();

    relay.emitEvent(0, event("first", 100));

    expect(listener).toHaveBeenCalled();
  });

  it("closes every relay subscription on stop", () => {
    const { relay, reader } = setup();
    reader.start();
    reader.stop();

    expect(relay.subscriptions[0].closed).toBe(true);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm exec vitest run src/core/read/section-reader.test.ts`
Expected: FAIL — `Failed to resolve import "./section-reader"`

- [ ] **Step 4: `section-reader.ts` を実装**

```ts
import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelaySubscription,
  RelayUrl,
} from "../relay/relay-connection";
import type { EventStore } from "./event-store";
import {
  MAX_ITEMS_PER_SECTION,
  type NostrSource,
  type Order,
  type SectionStatus,
} from "./source";

export type SectionReaderOptions = {
  source: NostrSource;
  order: Order;
  store: EventStore;
  openRelay: (url: RelayUrl) => RelayConnection;
};

type RelayState = {
  url: RelayUrl;
  subscription: RelaySubscription | null;
  eose: boolean;
  unreachable: boolean;
};

export class SectionReader {
  readonly #options: SectionReaderOptions;
  readonly #listeners = new Set<() => void>();
  readonly #ids = new Set<string>();
  #relays: RelayState[] = [];
  #items: NostrEvent[] = [];
  #started = false;

  constructor(options: SectionReaderOptions) {
    this.#options = options;
  }

  get items(): NostrEvent[] {
    return this.#items;
  }

  get status(): SectionStatus {
    const unreachableRelays = this.#relays.filter((r) => r.unreachable).length;
    const live = this.#relays.filter((r) => !r.unreachable);
    const allSettled = live.length > 0 && live.every((r) => r.eose);

    const phase: SectionStatus["phase"] = allSettled
      ? "settled"
      : this.#items.length > 0
        ? "streaming"
        : "initial";

    // unroutableAuthors は Outbox ルーティングを入れる計画で埋まる (ADR-0016)
    return unreachableRelays > 0
      ? { phase, incomplete: { unreachableRelays, unroutableAuthors: 0 } }
      : { phase };
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;

    for (const url of this.#options.source.relays ?? []) {
      const state: RelayState = {
        url,
        eose: false,
        unreachable: false,
        subscription: null,
      };
      this.#relays.push(state);

      const connection = this.#options.openRelay(url);
      state.subscription = connection.subscribe(this.#options.source.filters, {
        onEvent: (event) => this.#onEvent(event, url),
        onEose: () => {
          state.eose = true;
          this.#notify();
        },
        onClosed: () => {
          state.unreachable = true;
          this.#notify();
        },
      });
    }
  }

  stop(): void {
    for (const relay of this.#relays) relay.subscription?.close();
    this.#relays = [];
    this.#started = false;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #onEvent(event: NostrEvent, relay: RelayUrl): void {
    if (this.#options.store.put(event, relay) !== "inserted") return;
    if (this.#ids.has(event.id)) return;

    this.#ids.add(event.id);
    this.#items = this.#sorted([...this.#items, event]).slice(
      0,
      MAX_ITEMS_PER_SECTION,
    );

    // 上限を超えて落ちた分は id 集合からも外す
    if (this.#ids.size > this.#items.length) {
      const kept = new Set(this.#items.map((e) => e.id));
      for (const id of this.#ids) if (!kept.has(id)) this.#ids.delete(id);
    }

    this.#notify();
  }

  #sorted(events: NostrEvent[]): NostrEvent[] {
    // "thread-tree" はスレッドカラムの計画で足す。それまでは降順で扱う。
    const ascending = this.#options.order === "created-at-asc";
    return [...events].sort((a, b) =>
      ascending ? a.created_at - b.created_at : b.created_at - a.created_at,
    );
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm exec vitest run src/core/read/section-reader.test.ts`
Expected: PASS（9 件）

- [ ] **Step 6: Lint と型チェック、コミット**

```bash
pnpm fix && pnpm typecheck
git add src/core/read/source.ts src/core/read/section-reader.ts src/core/read/section-reader.test.ts
git commit -m "feat(read): add SectionReader with ordering, dedup, status phases and item cap"
```

---

### Task 5: `WebSocketRelayConnection` — 自前 NIP-01

**Files:**
- Create: `src/core/relay/websocket-relay-connection.ts`
- Test: `src/core/relay/websocket-relay-connection.test.ts`

NIP-01 のクライアント→リレーは `["REQ", subId, ...filters]` / `["CLOSE", subId]` / `["EVENT", event]`、リレー→クライアントは `["EVENT", subId, event]` / `["EOSE", subId]` / `["CLOSED", subId, reason]` / `["OK", eventId, ok, message]` / `["NOTICE", message]`。

WebSocket をコンストラクタで注入できる形にして、ネットワークなしで単体テストする。

**Interfaces:**
- Consumes: `NostrEvent`（Task 1）、`RelayConnection` 一式（Task 2）
- Produces:
  - `type WebSocketLike = { send(data: string): void; close(): void; onopen: (() => void) | null; onmessage: ((e: { data: string }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null; readyState: number }`
  - `class WebSocketRelayConnection implements RelayConnection` — `constructor(url: RelayUrl, socket: WebSocketLike)`
  - `function connectRelay(url: RelayUrl): RelayConnection` — ブラウザの `WebSocket` を使う既定の生成関数

接続確立前に呼ばれた `subscribe` はバッファし、`onopen` でまとめて送る。これにより `SectionReader.start()` が同期のままで済む。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/relay/websocket-relay-connection.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../nostr/event";
import {
  type WebSocketLike,
  WebSocketRelayConnection,
} from "./websocket-relay-connection";

const event = (id: string): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: 100,
  kind: 1,
  tags: [],
  content: id,
  sig: "sig",
});

const fakeSocket = () => {
  const sent: string[] = [];
  const socket: WebSocketLike = {
    readyState: 0,
    send: (data: string) => sent.push(data),
    close: vi.fn(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  return {
    socket,
    sent,
    open: () => {
      socket.readyState = 1;
      socket.onopen?.();
    },
    receive: (message: unknown) =>
      socket.onmessage?.({ data: JSON.stringify(message) }),
  };
};

describe("WebSocketRelayConnection", () => {
  it("buffers REQ until the socket opens, then sends it", () => {
    const { socket, sent, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);

    connection.subscribe([{ kinds: [1], limit: 5 }], {
      onEvent: vi.fn(),
      onEose: vi.fn(),
      onClosed: vi.fn(),
    });
    expect(sent).toHaveLength(0);

    open();

    expect(sent).toHaveLength(1);
    const message = JSON.parse(sent[0]);
    expect(message[0]).toBe("REQ");
    expect(typeof message[1]).toBe("string");
    expect(message[2]).toEqual({ kinds: [1], limit: 5 });
  });

  it("routes EVENT and EOSE to the matching subscription only", () => {
    const { socket, sent, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const first = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    const second = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    connection.subscribe([{ kinds: [1] }], first);
    connection.subscribe([{ kinds: [7] }], second);
    open();

    const firstSubId = JSON.parse(sent[0])[1];
    receive(["EVENT", firstSubId, event("note-1")]);
    receive(["EOSE", firstSubId]);

    expect(first.onEvent).toHaveBeenCalledWith(event("note-1"));
    expect(first.onEose).toHaveBeenCalledTimes(1);
    expect(second.onEvent).not.toHaveBeenCalled();
  });

  it("reports CLOSED with the relay's reason", () => {
    const { socket, sent, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    connection.subscribe([{ kinds: [1] }], handlers);
    open();
    receive(["CLOSED", JSON.parse(sent[0])[1], "blocked: pubkey banned"]);

    expect(handlers.onClosed).toHaveBeenCalledWith("blocked: pubkey banned");
  });

  it("reports the socket closing as a closed subscription", () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    connection.subscribe([{ kinds: [1] }], handlers);
    open();
    socket.onclose?.();

    expect(handlers.onClosed).toHaveBeenCalledWith("socket closed");
  });

  it("sends CLOSE when a subscription is closed", () => {
    const { socket, sent, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);

    const sub = connection.subscribe([{ kinds: [1] }], {
      onEvent: vi.fn(),
      onEose: vi.fn(),
      onClosed: vi.fn(),
    });
    open();
    const subId = JSON.parse(sent[0])[1];
    sub.close();

    expect(JSON.parse(sent[1])).toEqual(["CLOSE", subId]);
  });

  it("ignores malformed messages instead of throwing", () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    connection.subscribe([{ kinds: [1] }], {
      onEvent: vi.fn(),
      onEose: vi.fn(),
      onClosed: vi.fn(),
    });
    open();

    expect(() => socket.onmessage?.({ data: "not json" })).not.toThrow();
    expect(() => socket.onmessage?.({ data: "{}" })).not.toThrow();
  });

  it("resolves publish when the relay accepts the event", async () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();

    const published = connection.publish(event("note-1"));
    receive(["OK", "note-1", true, ""]);

    await expect(published).resolves.toBeUndefined();
  });

  it("rejects publish when the relay refuses the event", async () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();

    const published = connection.publish(event("note-1"));
    receive(["OK", "note-1", false, "invalid: bad signature"]);

    await expect(published).rejects.toThrow("invalid: bad signature");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run src/core/relay/websocket-relay-connection.test.ts`
Expected: FAIL — `Failed to resolve import "./websocket-relay-connection"`

- [ ] **Step 3: `websocket-relay-connection.ts` を実装**

```ts
import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "./relay-connection";

export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

const OPEN = 1;

type PendingPublish = {
  resolve: () => void;
  reject: (error: Error) => void;
};

/**
 * NIP-01 を話す 1 リレー専用の接続 (ADR-0014, ADR-0020)。
 * Nostr ライブラリには依存しない。
 */
export class WebSocketRelayConnection implements RelayConnection {
  readonly #socket: WebSocketLike;
  readonly #handlers = new Map<string, RelaySubscriptionHandlers>();
  readonly #publishes = new Map<string, PendingPublish>();
  readonly #outbox: string[] = [];
  #nextSubId = 0;

  constructor(
    readonly url: RelayUrl,
    socket: WebSocketLike,
  ) {
    this.#socket = socket;

    socket.onopen = () => {
      const queued = this.#outbox.splice(0);
      for (const message of queued) socket.send(message);
    };

    socket.onmessage = (event) => this.#onMessage(event.data);

    const fail = () => {
      for (const handlers of this.#handlers.values())
        handlers.onClosed("socket closed");
      this.#handlers.clear();
      for (const pending of this.#publishes.values())
        pending.reject(new Error("socket closed"));
      this.#publishes.clear();
    };
    socket.onclose = fail;
    socket.onerror = fail;
  }

  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription {
    const subId = `s${this.#nextSubId++}`;
    this.#handlers.set(subId, handlers);
    this.#send(JSON.stringify(["REQ", subId, ...filters]));

    return {
      close: () => {
        if (!this.#handlers.delete(subId)) return;
        this.#send(JSON.stringify(["CLOSE", subId]));
      },
    };
  }

  publish(event: NostrEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#publishes.set(event.id, { resolve, reject });
      this.#send(JSON.stringify(["EVENT", event]));
    });
  }

  close(): void {
    this.#socket.close();
  }

  #send(message: string): void {
    if (this.#socket.readyState === OPEN) this.#socket.send(message);
    else this.#outbox.push(message);
  }

  #onMessage(raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return; // 壊れたメッセージは黙って捨てる
    }
    if (!Array.isArray(message) || typeof message[0] !== "string") return;

    switch (message[0]) {
      case "EVENT": {
        const [, subId, event] = message as [string, string, NostrEvent];
        this.#handlers.get(subId)?.onEvent(event);
        return;
      }
      case "EOSE": {
        const [, subId] = message as [string, string];
        this.#handlers.get(subId)?.onEose();
        return;
      }
      case "CLOSED": {
        const [, subId, reason] = message as [string, string, string];
        const handlers = this.#handlers.get(subId);
        this.#handlers.delete(subId);
        handlers?.onClosed(reason ?? "closed");
        return;
      }
      case "OK": {
        const [, eventId, ok, reason] = message as [
          string,
          string,
          boolean,
          string,
        ];
        const pending = this.#publishes.get(eventId);
        if (!pending) return;
        this.#publishes.delete(eventId);
        ok ? pending.resolve() : pending.reject(new Error(reason || "rejected"));
        return;
      }
      default:
        // NOTICE / AUTH などはこの計画では扱わない
        return;
    }
  }
}

export const connectRelay = (url: RelayUrl): RelayConnection =>
  new WebSocketRelayConnection(url, new WebSocket(url) as WebSocketLike);
```

`ok ? pending.resolve() : ...` を Biome が式文として警告する場合は `if (ok) pending.resolve(); else pending.reject(...)` に書き換える。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm exec vitest run src/core/relay/websocket-relay-connection.test.ts`
Expected: PASS（8 件）

- [ ] **Step 5: Lint と型チェック、コミット**

```bash
pnpm fix && pnpm typecheck
git add src/core/relay/websocket-relay-connection.ts src/core/relay/websocket-relay-connection.test.ts
git commit -m "feat(relay): implement NIP-01 over a plain WebSocket without a nostr library"
```

---

### Task 6: NIP-11 リレー情報

**Files:**
- Create: `src/core/relay/relay-info.ts`
- Test: `src/core/relay/relay-info.test.ts`

`wss://` を `https://` に、`ws://` を `http://` に置換して `Accept: application/nostr+json` で GET する。**CORS で失敗しうるため、失敗は例外にせず `undefined` を返す。**

**Interfaces:**
- Consumes: `RelayUrl`（Task 2）
- Produces:
  - `type RelayInfo = { name?: string; description?: string; pubkey?: string; contact?: string; supported_nips?: number[]; software?: string; version?: string; icon?: string; limitation?: { max_limit?: number; max_subscriptions?: number; auth_required?: boolean; payment_required?: boolean } }`
  - `function relayInfoUrl(url: RelayUrl): string`
  - `class RelayInfoRegistry` — `constructor(fetchImpl?: typeof fetch)` / `get(url: RelayUrl): Promise<RelayInfo | undefined>` / `supportsNip(url: RelayUrl, nip: number): Promise<boolean>` / `maxLimit(url: RelayUrl): Promise<number | undefined>`

同じ URL への同時要求は 1 回の fetch に合流させる。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/relay/relay-info.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { RelayInfoRegistry, relayInfoUrl } from "./relay-info";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/nostr+json" },
  });

describe("relayInfoUrl", () => {
  it("swaps the websocket scheme for http", () => {
    expect(relayInfoUrl("wss://relay.example")).toBe("https://relay.example");
    expect(relayInfoUrl("ws://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  });
});

describe("RelayInfoRegistry", () => {
  it("requests the document with the NIP-11 accept header", async () => {
    const fetchImpl = vi.fn(async () => json({ name: "test relay" }));
    const registry = new RelayInfoRegistry(fetchImpl as unknown as typeof fetch);

    await registry.get("wss://relay.example");

    expect(fetchImpl).toHaveBeenCalledWith("https://relay.example", {
      headers: { Accept: "application/nostr+json" },
    });
  });

  it("returns the parsed document", async () => {
    const registry = new RelayInfoRegistry(
      (async () =>
        json({
          name: "test relay",
          supported_nips: [1, 11, 50],
          limitation: { max_limit: 500 },
        })) as unknown as typeof fetch,
    );

    await expect(registry.get("wss://relay.example")).resolves.toEqual({
      name: "test relay",
      supported_nips: [1, 11, 50],
      limitation: { max_limit: 500 },
    });
  });

  it("fetches each relay only once", async () => {
    const fetchImpl = vi.fn(async () => json({ name: "test relay" }));
    const registry = new RelayInfoRegistry(fetchImpl as unknown as typeof fetch);

    await Promise.all([
      registry.get("wss://relay.example"),
      registry.get("wss://relay.example"),
    ]);
    await registry.get("wss://relay.example");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when the request fails (CORS, offline, 404)", async () => {
    const registry = new RelayInfoRegistry(
      (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    );

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
  });

  it("returns undefined when the body is not valid json", async () => {
    const registry = new RelayInfoRegistry(
      (async () => new Response("<html>nope</html>", { status: 200 })) as unknown as typeof fetch,
    );

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
  });

  it("answers supportsNip from supported_nips", async () => {
    const registry = new RelayInfoRegistry(
      (async () => json({ supported_nips: [1, 11, 50] })) as unknown as typeof fetch,
    );

    await expect(registry.supportsNip("wss://a", 50)).resolves.toBe(true);
    await expect(registry.supportsNip("wss://a", 45)).resolves.toBe(false);
  });

  it("treats an unreachable relay as not supporting a nip", async () => {
    const registry = new RelayInfoRegistry(
      (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    );

    await expect(registry.supportsNip("wss://a", 50)).resolves.toBe(false);
  });

  it("exposes limitation.max_limit", async () => {
    const registry = new RelayInfoRegistry(
      (async () => json({ limitation: { max_limit: 250 } })) as unknown as typeof fetch,
    );

    await expect(registry.maxLimit("wss://a")).resolves.toBe(250);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run src/core/relay/relay-info.test.ts`
Expected: FAIL — `Failed to resolve import "./relay-info"`

- [ ] **Step 3: `relay-info.ts` を実装**

```ts
import type { RelayUrl } from "./relay-connection";

/** NIP-11 リレー情報ドキュメント。必要なフィールドだけを型にする。 */
export type RelayInfo = {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  icon?: string;
  posting_policy?: string;
  limitation?: {
    max_limit?: number;
    max_subscriptions?: number;
    auth_required?: boolean;
    payment_required?: boolean;
  };
};

export const relayInfoUrl = (url: RelayUrl): string =>
  url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

/**
 * NIP-11 の取得とキャッシュ。
 * ブラウザから relay のドメインへ直接 GET するため CORS で失敗しうる。
 * 失敗は例外にせず undefined を返し、呼び出し側は情報なしで動作を続ける (ADR-0020)。
 */
export class RelayInfoRegistry {
  readonly #fetch: typeof fetch;
  readonly #cache = new Map<RelayUrl, Promise<RelayInfo | undefined>>();

  constructor(fetchImpl: typeof fetch = fetch) {
    this.#fetch = fetchImpl;
  }

  get(url: RelayUrl): Promise<RelayInfo | undefined> {
    const cached = this.#cache.get(url);
    if (cached) return cached;

    const pending = this.#load(url);
    this.#cache.set(url, pending);
    return pending;
  }

  async supportsNip(url: RelayUrl, nip: number): Promise<boolean> {
    const info = await this.get(url);
    return info?.supported_nips?.includes(nip) ?? false;
  }

  async maxLimit(url: RelayUrl): Promise<number | undefined> {
    return (await this.get(url))?.limitation?.max_limit;
  }

  async #load(url: RelayUrl): Promise<RelayInfo | undefined> {
    try {
      const response = await this.#fetch(relayInfoUrl(url), {
        headers: { Accept: "application/nostr+json" },
      });
      if (!response.ok) return undefined;
      return (await response.json()) as RelayInfo;
    } catch {
      return undefined;
    }
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm exec vitest run src/core/relay/relay-info.test.ts`
Expected: PASS（10 件）

- [ ] **Step 5: Lint と型チェック、コミット**

```bash
pnpm fix && pnpm typecheck
git add src/core/relay/relay-info.ts src/core/relay/relay-info.test.ts
git commit -m "feat(relay): add NIP-11 relay information registry with graceful CORS failure"
```

---

### Task 7: SolidJS ラッパ、デバッグルート、ローカルリレーでの e2e

**Files:**
- Create: `src/core/solid/create-section.ts`
- Create: `src/routes/debug/v1-section.tsx`
- Modify: `src/router.tsx:70-73` 付近
- Test: `e2e/v1-section.spec.ts`

**Interfaces:**
- Consumes: `SectionReader` / `NostrSource` / `Order` / `SectionStatus`（Task 4）、`connectRelay`（Task 5）、`RelayInfoRegistry`（Task 6）
- Produces:
  - `function createSection(options: { source: Accessor<NostrSource>; order?: Order; store: EventStore; openRelay: (url: RelayUrl) => RelayConnection }): { items: Accessor<NostrEvent[]>; status: Accessor<SectionStatus>; loadMore: () => void }`

`loadMore` はこの計画では**何もしない空関数**。ページネーションは後続の計画で実装する。呼び出し側インターフェースを先に確定させることが目的。

- [ ] **Step 1: `create-section.ts` を実装**

```ts
import {
  type Accessor,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import type { NostrEvent } from "../nostr/event";
import type { EventStore } from "../read/event-store";
import { SectionReader } from "../read/section-reader";
import type { NostrSource, Order, SectionStatus } from "../read/source";
import type { RelayConnection, RelayUrl } from "../relay/relay-connection";

export type CreateSectionOptions = {
  source: Accessor<NostrSource>;
  order?: Order;
  store: EventStore;
  openRelay: (url: RelayUrl) => RelayConnection;
};

/**
 * 読み取り層の呼び出し側インターフェース (ADR-0014)。
 * 購読の開始・破棄・source 変更時の張り直しは内側で行う。
 */
export const createSection = (options: CreateSectionOptions) => {
  const [items, setItems] = createSignal<NostrEvent[]>([]);
  const [status, setStatus] = createSignal<SectionStatus>({ phase: "initial" });

  createEffect(() => {
    const reader = new SectionReader({
      source: options.source(),
      order: options.order ?? "created-at-desc",
      store: options.store,
      openRelay: options.openRelay,
    });

    const sync = () => {
      setItems(reader.items);
      setStatus(reader.status);
    };

    const unsubscribe = reader.subscribe(sync);
    reader.start();
    sync();

    onCleanup(() => {
      unsubscribe();
      reader.stop();
    });
  });

  return {
    items,
    status,
    // ページネーションは後続の計画で実装する
    loadMore: () => {},
  };
};
```

- [ ] **Step 2: デバッグルートを作る**

`src/routes/debug/v1-section.tsx`:

```tsx
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { EventStore } from "../../core/read/event-store";
import type { NostrSource } from "../../core/read/source";
import { RelayInfoRegistry } from "../../core/relay/relay-info";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { connectRelay } from "../../core/relay/websocket-relay-connection";
import { createSection } from "../../core/solid/create-section";

const DEFAULT_RELAY = "ws://127.0.0.1:8080";

const V1SectionDebug = () => {
  const [relayUrl] = createSignal<RelayUrl>(DEFAULT_RELAY);
  const store = new EventStore();
  const registry = new RelayInfoRegistry();

  // NIP-11 セクション: Nostr イベントですらない供給元 (ADR-0003)
  const [relayInfo] = createResource(relayUrl, (url) => registry.get(url));

  const source = createMemo<NostrSource>(() => ({
    type: "nostr",
    filters: [{ kinds: [1], limit: 50 }],
    relays: [relayUrl()],
  }));

  const section = createSection({ source, store, openRelay: connectRelay });

  return (
    <div style={{ padding: "16px", "font-family": "monospace" }}>
      <h1>/debug/v1-section</h1>

      <section data-testid="relay-info">
        <h2>relay-info section (NIP-11)</h2>
        <Show
          when={relayInfo()}
          fallback={<p data-testid="relay-info-missing">no relay info</p>}
        >
          {(info) => (
            <ul>
              <li data-testid="relay-name">name: {info().name ?? "-"}</li>
              <li data-testid="relay-nips">
                supported_nips: {(info().supported_nips ?? []).join(",")}
              </li>
              <li data-testid="relay-max-limit">
                max_limit: {info().limitation?.max_limit ?? "-"}
              </li>
            </ul>
          )}
        </Show>
      </section>

      <section>
        <h2>nostr section</h2>
        <p data-testid="phase">phase: {section.status().phase}</p>
        <p data-testid="unreachable">
          unreachableRelays:{" "}
          {section.status().incomplete?.unreachableRelays ?? 0}
        </p>
        <p data-testid="count">items: {section.items().length}</p>
        <ul data-testid="items">
          <For each={section.items()}>
            {(event) => (
              <li data-testid="item">
                {event.created_at} / {event.content}
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  );
};

export default V1SectionDebug;
```

- [ ] **Step 3: ルートを登録**

`src/router.tsx` の `/debug/v1-core` の直後に追加する。

```tsx
      {
        path: "/debug/v1-core",
        component: lazy(() => import("./routes/debug/v1-core")),
      },
      {
        path: "/debug/v1-section",
        component: lazy(() => import("./routes/debug/v1-section")),
      },
```

- [ ] **Step 4: 開発サーバとローカルリレーで目視確認**

```bash
docker compose up -d nostr-rs-relay postgres
pnpm dev:relay:reset
pnpm e2e:seed
pnpm dev
```

`http://localhost:5173/debug/v1-section` を開く。
Expected: `phase: settled`、`items:` が 1 以上、シードされたノート本文が並ぶ。`relay-info` セクションに `name` と `supported_nips` が出る（`nostr-rs-relay` は NIP-11 を返す）。

- [ ] **Step 5: e2e テストを書く**

`e2e/v1-section.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { seededNoteText } from "./fixtures/seed";

test("renders seeded notes from the local relay", async ({ page }) => {
  await page.goto("/debug/v1-section");

  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("unreachable")).toHaveText(
    "unreachableRelays: 0",
  );
  await expect(page.getByTestId("item").first()).toBeVisible();
  await expect(page.getByTestId("items")).toContainText(seededNoteText);
});

test("lists newest events first", async ({ page }) => {
  await page.goto("/debug/v1-section");
  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 15_000,
  });

  const timestamps = await page
    .getByTestId("item")
    .allTextContents()
    .then((texts) => texts.map((t) => Number(t.split(" / ")[0])));

  expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
});

test("shows the NIP-11 document of the local relay", async ({ page }) => {
  await page.goto("/debug/v1-section");

  await expect(page.getByTestId("relay-nips")).toContainText("1", {
    timeout: 15_000,
  });
});
```

- [ ] **Step 6: e2e を実行**

```bash
pnpm e2e:seed
pnpm e2e e2e/v1-section.spec.ts
```

Expected: PASS（3 件）

NIP-11 のテストが CORS で落ちる場合、`.local-dev/nostr-rs-relay-config.toml` の設定を確認する。`nostr-rs-relay` は NIP-11 を返すが、CORS ヘッダの扱いは設定とバージョンに依存する。落ちた場合は **実装ではなくテストを外し**、`relay-info-missing` が表示されることを検証するテストに置き換える（グレースフルな失敗が要件であり、CORS を通すことは要件ではない）。

- [ ] **Step 7: Lint と型チェック、コミット**

```bash
pnpm fix && pnpm typecheck
git add src/core/solid/create-section.ts src/routes/debug/v1-section.tsx src/router.tsx e2e/v1-section.spec.ts
git commit -m "feat(read): wire createSection and NIP-11 into a debug route verified against the local relay"
```

---

## この計画の完了条件

- `pnpm exec vitest run src/core/nostr src/core/relay src/core/read` が全て通る
- `pnpm e2e e2e/v1-section.spec.ts` がローカルリレーに対して通る
- 新しいコードが `nostr-tools` / `rx-nostr` / `@rust-nostr/nostr-sdk` / `nostr-typedef` / `src/core/{transport,query,repository,view,store}` を一切 import していない
- `Source` が Nostr フィルタと NIP-11 の両方を供給元にできることが実証されている（[ADR-0003](../../adr/0003-open-column-abstraction.md) の中核的主張）
- `/debug/v1-section` が [ADR-0002](../../adr/0002-v0-parity-before-cutover.md) の一括切替まで**唯一の生きた検証場所**として機能する

## 後続の計画（この計画には含まれない）

1. **Outbox ルーティング** — `RoutingTable`、ブートストラップ専用経路、ログイン時ウォームアップ、クエリのリレー別分割、`unroutableAuthors` の計上（ADR-0005 / ADR-0016）
2. **needs の波状解決とレンダラ登録** — `defineRenderer`、フォールバック表示、深さ上限 2 階層（ADR-0003 / ADR-0004 / ADR-0017）
3. **ページネーション・接続プール・再接続** — `loadMore` の実装、リレー別カーソル、`limitation.max_limit` の尊重、30 接続上限、**および再接続とバックオフ**（ADR-0005 / ADR-0011 / ADR-0021）
   - `loadMore` は `source` の変更として実装してはならない。`createSection` は `source()` の同一性が変わると `SectionReader` ごと作り直すため、全アイテムを捨ててソケットを張り直してしまう。`SectionReader.loadMore()` として、リレーごとに追加の後方購読を張って追記する形にする。
   - 再接続は接続プールと同じ計画に置く。**所有していない接続は再接続できない**ため、両者は同一の関心事。詳細は [ADR-0021](../../adr/0021-reconnection-policy.md)（proposed、実装前に確定させること）。
4. **永続化** — `EventPersistence`、IndexedDB、2 バケット、`kind:5` の永続化と水和時適用（ADR-0018 / ADR-0019）
5. **署名器と書き込み** — NIP-07 / NIP-46、楽観的更新、署名要求のデバウンス（ADR-0008 / ADR-0010）
6. **NIP-19 の TLV 対応** — `nevent` / `naddr` / `nprofile`、リンク解決
7. **セクション合成からデッキまで** — 複数セクションのカラム、デッキ、`kind:30078` 保存、既定デッキ（ADR-0009 / ADR-0013）
8. **旧実装の削除** — 削除対象は以下の通り。**新旧が同居しているディレクトリがあるため、ディレクトリ単位では消せない。**
   - `src/core/{transport,query,repository,view,store}` — ディレクトリごと
   - `src/core/solid/` のうち `provider.tsx` と `use-*.ts`（`create-section.ts` と `create-section.test.tsx` は**新**、残す）
   - `src/core/nostr/replaceable.ts` と `replaceable.test.ts`（`event.ts` / `nip19.ts` は**新**、残す）
   - `src/routes/debug/v1-core.tsx` と `v1-core.test.tsx`
   - `src/features/Column/libs/deckSchema/v0.ts`
   - `nostr-tools` / `rx-nostr` / `rx-nostr-crypto` / `@rust-nostr/nostr-sdk` / `nostr-typedef` / `nip07-awaiter` の依存
   - **注**: `e2e/fixtures/seed.ts` は `nostr-tools` を使うが、これはテスト用の共有インフラであり削除対象ではない。依存を落とす際は devDependency として残すか、`@noble` ベースに書き換えるかを決めること。

   この一覧は忘れると腐る。**同居を構造的に解消する**ため、次の計画の冒頭で新読み取り層を `src/core/solid/` `src/core/nostr/` から独立したディレクトリへ移すことを検討する（レビュー済み差分を動かすので、このスライスの中ではやらない）。
