# Outbox ルーティングと購読管理システムの器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** セクションが「どのリレーから取るか」を自分で決めるのをやめ、NIP-65 に基づいて著者ごとに取得先リレーを選ぶ。リレー接続は単一の購読管理システムが所有し、同じリレー URL への接続は全セクションで共有される。

**Architecture:** `kind:10002` から導出したルーティング表で、1 つの論理クエリを「リレーごとに担当著者の異なる N 本の実クエリ」へ分割する（[ADR-0005](../../adr/0005-outbox-model-from-v1.md)）。ルーティング表は専用の永続化を持たず `EventStore` から導出する（[ADR-0016](../../adr/0016-routing-bootstrap.md)）。接続の所有はセクションから購読管理システムへ移る（[ADR-0023](../../adr/0023-centralized-subscription-manager.md)）。**この計画は器だけを作る。購読マージと 30 接続上限は後続 #3。**

**Tech Stack:** TypeScript / SolidJS / @noble/curves / @noble/hashes / @scure/base / Vitest / Playwright / Biome / Docker Compose (nostr-rs-relay ×2)

## Global Constraints

- **新しいコードで `nostr-tools` / `rx-nostr` / `rx-nostr-crypto` / `@rust-nostr/nostr-sdk` / `nostr-typedef` を import しない**（[ADR-0020](../../adr/0020-no-nostr-library-noble-primitives-only.md)）。`pnpm check` の `check:read-layer` が機械的に検査する。**例外**: `e2e/fixtures/seed.ts` は既存のテスト用共有インフラであり `nostr-tools` を使ってよい。
- **`src/core/{transport,query,repository,view,store}` から import しない**（旧実装）。
- **暗号を自作しない。** 署名検証は既存の `verifyEvent`。
- **この計画でやらないこと**（実装したら "Extra" の指摘対象）: 購読のマージ、30 接続上限、`max_subscriptions` の尊重、再接続・バックオフ、ページネーション、レンダラの `needs` 解決、IndexedDB 永続化、署名器。
- **`SectionStatus` の形は変えない**（[ADR-0015](../../adr/0015-section-status-excludes-renderer-fetches.md)）。`phase` と `incomplete { unreachableRelays, unroutableAuthors }`。
- **`createSection` の呼び出し側インターフェースを変えない。** `{ items, status, loadMore }` のまま。`loadMore` は引き続き no-op。
- **イベント本体は `EventStore` が持ち、セクションはメンバーシップだけを持つ**（[ADR-0024](../../adr/0024-shared-bodies-per-section-membership.md)）。セクションが並べるのはリレーが送ってきたオブジェクトではなく `store.get(id)` の検証済みコピー。
- 新しいファイルはケバブケース。Biome。`pnpm fix && pnpm typecheck && pnpm check` をコミット前に通す。
- 単体テストは `pnpm exec vitest run <path>`。**`pnpm test` は watch モードなので使わない。**
- e2e は `pnpm e2e <spec>`。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `.local-dev/nostr-rs-relay-2-config.toml` | 2 本目のローカルリレーの設定（SQLite） |
| `compose.yaml` | 2 本目のリレーサービス（ポート 8081） |
| `e2e/fixtures/seed-outbox.ts` | 2 リレーにまたがる Outbox 検証用シード |
| `src/core/relay/relay-url.ts` | リレー URL の正規化。接続の重複排除の基準 |
| `src/core/read/relay-list.ts` | NIP-65 `kind:10002` の解釈（read/write マーカー） |
| `src/core/read/default-relays.ts` | `BOOTSTRAP_INDEXERS` / `FALLBACK_RELAYS` |
| `src/core/read/routing-table.ts` | pubkey → write relay。`EventStore` から導出 |
| `src/core/read/query-plan.ts` | 論理クエリ → リレー別フィルタ（純粋関数） |
| `src/core/read/subscription-manager.ts` | 接続の所有・共有、購読、配信 |
| `src/core/read/bootstrap.ts` | フォローリストと `kind:10002` のウォームアップ |
| `src/core/read/section-reader.ts` | 配線替え（`openRelay` → manager） |
| `src/core/solid/create-section.ts` | 配線替え |
| `src/routes/debug/v1-section.tsx` | ルーティング表と Outbox の可視化 |
| `e2e/v1-section.spec.ts` | 2 リレーに対する Outbox の e2e |

---

### Task 1: 2 本目のローカルリレーと Outbox 検証用シード

**Files:**
- Create: `.local-dev/nostr-rs-relay-2-config.toml`
- Create: `e2e/fixtures/seed-outbox.ts`
- Modify: `compose.yaml`
- Modify: `package.json`（スクリプト追加）

**Interfaces:**
- Consumes: なし
- Produces:
  - `e2e/fixtures/seed-outbox.ts` が export する:
    - `const relayOneUrl: string` = `process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080"`
    - `const relayTwoUrl: string` = `process.env.STREETS_E2E_RELAY_2_URL ?? "ws://127.0.0.1:8081"`
    - `const outboxAuthorAPubkey: string` / `const outboxAuthorBPubkey: string`（16 進 64 桁）
    - `const outboxViewerPubkey: string`
    - `const outboxNoteAText: string` = `"outbox author A note"`
    - `const outboxNoteBText: string` = `"outbox author B note"`
    - `async function seedOutboxFixture(): Promise<void>`

**シードが作る状態**（これが Outbox の証明になる）:

| どこに | 何が |
|---|---|
| リレー1 (8080) | 著者 A と B の **`kind:10002`**、著者 A の `kind:1`、閲覧者の `kind:3`（A と B をフォロー） |
| リレー2 (8081) | **著者 B の `kind:1` だけ** |

著者 A の `kind:10002` は「write = リレー1」、著者 B は「write = リレー2」と宣言する。**ルーティングが効いていなければ、著者 B の投稿はどこからも取得できない**（リレー1 にしか繋がないため）。

- [ ] **Step 1: 2 本目のリレー設定を作る**

`.local-dev/nostr-rs-relay-2-config.toml`:

```toml
[info]
relay_url = "ws://localhost:8081/"
name = "nostr-rs-relay-2"
description = "Second local relay for Outbox routing tests."

[database]
engine = "sqlite"
data_directory = "/usr/src/app/db"

[network]
address = "0.0.0.0"
port = 8080

[options]
reject_future_seconds = 1800

[limits]
limit_scrapers = false
```

1 本目は postgres を使っているが、2 本目は **SQLite** にして postgres サービスを増やさない。コンテナ内のポートは 8080 のままで、ホスト側で 8081 に割り当てる。

- [ ] **Step 2: compose.yaml にサービスを追加**

`compose.yaml` の `nostr-rs-relay` サービス定義の直後に追加する。

```yaml
  nostr-rs-relay-2:
    image: scsibug/nostr-rs-relay:latest
    sysctls:
      net.core.somaxconn: 8128
    restart: unless-stopped
    volumes:
      - type: bind
        source: ./.local-dev/nostr-rs-relay-2-config.toml
        target: /usr/src/app/config.toml
      - ./data/nostr-rs-relay-2/db:/usr/src/app/db
    ports:
      - "8081:8080"
    networks:
      - relay
```

- [ ] **Step 3: 起動して 2 本とも応答することを確認**

```bash
mkdir -p data/nostr-rs-relay-2/db
docker compose up -d nostr-rs-relay nostr-rs-relay-2 postgres
sleep 5
curl -s -H "Accept: application/nostr+json" -H "Origin: http://localhost" http://127.0.0.1:8080 | head -c 120; echo
curl -s -H "Accept: application/nostr+json" -H "Origin: http://localhost" http://127.0.0.1:8081 | head -c 120; echo
```

Expected: 1 本目が `nostr-rs-relay`、2 本目が `nostr-rs-relay-2` を名乗る JSON を返す。

- [ ] **Step 4: Outbox 用シードを書く**

`e2e/fixtures/seed-outbox.ts`:

```ts
import { type EventTemplate, Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const relayOneUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";
export const relayTwoUrl =
  process.env.STREETS_E2E_RELAY_2_URL ?? "ws://127.0.0.1:8081";

export const outboxNoteAText = "outbox author A note";
export const outboxNoteBText = "outbox author B note";

const now = 1_735_689_600;

const secretKey = (seed: number) =>
  Uint8Array.from(Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1));

const viewerSecretKey = secretKey(11);
const authorASecretKey = secretKey(101);
const authorBSecretKey = secretKey(211);

export const outboxViewerPubkey = getPublicKey(viewerSecretKey);
export const outboxAuthorAPubkey = getPublicKey(authorASecretKey);
export const outboxAuthorBPubkey = getPublicKey(authorBSecretKey);

const publish = async (
  relay: Relay,
  template: EventTemplate,
  key: Uint8Array,
) => {
  await relay.publish(finalizeEvent(template, key));
};

export const seedOutboxFixture = async (): Promise<void> => {
  const one = await Relay.connect(relayOneUrl);
  const two = await Relay.connect(relayTwoUrl);

  // 著者 A の kind:10002 — write は リレー1
  await publish(
    one,
    {
      kind: 10002,
      created_at: now,
      tags: [["r", relayOneUrl, "write"]],
      content: "",
    },
    authorASecretKey,
  );

  // 著者 B の kind:10002 — write は リレー2。これが無いと B は取れない
  await publish(
    one,
    {
      kind: 10002,
      created_at: now,
      tags: [["r", relayTwoUrl, "write"]],
      content: "",
    },
    authorBSecretKey,
  );

  // 閲覧者のフォローリスト
  await publish(
    one,
    {
      kind: 3,
      created_at: now,
      tags: [
        ["p", outboxAuthorAPubkey],
        ["p", outboxAuthorBPubkey],
      ],
      content: "",
    },
    viewerSecretKey,
  );

  // 著者 A の投稿はリレー1 だけ
  await publish(
    one,
    { kind: 1, created_at: now + 10, tags: [], content: outboxNoteAText },
    authorASecretKey,
  );

  // 著者 B の投稿はリレー2 だけ。ルーティングが効かなければ取得できない
  await publish(
    two,
    { kind: 1, created_at: now + 20, tags: [], content: outboxNoteBText },
    authorBSecretKey,
  );

  one.close();
  two.close();
  console.log(`[streets seed:outbox] relay1=${relayOneUrl} relay2=${relayTwoUrl}`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedOutboxFixture();
}
```

- [ ] **Step 5: package.json にスクリプトを追加**

`"e2e:seed": "tsx e2e/fixtures/seed.ts",` の直後に:

```json
    "e2e:seed:outbox": "tsx e2e/fixtures/seed-outbox.ts",
```

- [ ] **Step 6: シードを流して両リレーに入ることを確認**

```bash
pnpm e2e:seed:outbox
STREETS_E2E_RELAY_URL=ws://127.0.0.1:8081 pnpm dev:relay:inspect
```

Expected: `pnpm e2e:seed:outbox` が両リレー URL を出力し、リレー2 の `kind:1` 件数が **1 件**（著者 B の投稿だけ）。リレー1 側（`pnpm dev:relay:inspect`）は既存シード + 1 件増える。

- [ ] **Step 7: Lint と型チェック、コミット**

```bash
pnpm fix && pnpm typecheck && pnpm check
git add .local-dev/nostr-rs-relay-2-config.toml compose.yaml e2e/fixtures/seed-outbox.ts package.json
git commit -m "test(e2e): add a second local relay and an Outbox routing fixture"
```

---

### Task 2: リレー URL の正規化と NIP-65 リレーリストの解釈

**Files:**
- Create: `src/core/relay/relay-url.ts`
- Create: `src/core/read/relay-list.ts`
- Test: `src/core/relay/relay-url.test.ts`
- Test: `src/core/read/relay-list.test.ts`

**Interfaces:**
- Consumes: `NostrEvent`（`src/core/nostr/event`）、`RelayUrl`（`src/core/relay/relay-connection`）
- Produces:
  - `function normalizeRelayUrl(url: string): RelayUrl | undefined`
  - `type RelayListEntry = { url: RelayUrl; read: boolean; write: boolean }`
  - `function parseRelayList(event: NostrEvent): RelayListEntry[]`

正規化が要るのは、`kind:10002` の URL 表記が揺れるため（末尾スラッシュの有無、大文字小文字）。**接続の重複排除は正規化後の URL を基準にする。**

- [ ] **Step 1: URL 正規化の失敗するテストを書く**

`src/core/relay/relay-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeRelayUrl } from "./relay-url";

describe("normalizeRelayUrl", () => {
  it("adds a trailing slash to a bare host", () => {
    expect(normalizeRelayUrl("wss://relay.example")).toBe("wss://relay.example/");
  });

  it("treats a trailing slash as equivalent", () => {
    expect(normalizeRelayUrl("wss://relay.example/")).toBe("wss://relay.example/");
  });

  it("lowercases the host but preserves the path", () => {
    expect(normalizeRelayUrl("wss://Relay.Example/Inbox")).toBe(
      "wss://relay.example/Inbox",
    );
  });

  it("keeps a port", () => {
    expect(normalizeRelayUrl("ws://127.0.0.1:8081")).toBe("ws://127.0.0.1:8081/");
  });

  it("rejects non-websocket schemes", () => {
    expect(normalizeRelayUrl("https://relay.example")).toBeUndefined();
  });

  it("rejects garbage", () => {
    expect(normalizeRelayUrl("not a url")).toBeUndefined();
    expect(normalizeRelayUrl("")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/relay/relay-url.test.ts`
Expected: FAIL — `Failed to resolve import "./relay-url"`

- [ ] **Step 3: 実装**

`src/core/relay/relay-url.ts`:

```ts
import type { RelayUrl } from "./relay-connection";

/**
 * リレー URL を比較可能な形に正規化する。
 * kind:10002 の URL は末尾スラッシュの有無や大文字小文字が揺れるため、
 * 接続の重複排除はこの正規化後の値を基準にする。
 * websocket スキーム以外と、パースできないものは undefined を返す。
 */
export const normalizeRelayUrl = (url: string): RelayUrl | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") return undefined;
  // URL はホストを小文字化し、空パスを "/" にする。
  // 検索文字列とフラグメントはリレー URL には意味を持たないため落とす。
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
};
```

- [ ] **Step 4: 通ることを確認**

Run: `pnpm exec vitest run src/core/relay/relay-url.test.ts`
Expected: PASS（6 件）

- [ ] **Step 5: NIP-65 解釈の失敗するテストを書く**

`src/core/read/relay-list.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { parseRelayList } from "./relay-list";

const relayListEvent = (tags: string[][]): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1_700_000_000,
  kind: 10002,
  tags,
  content: "",
  sig: "c".repeat(128),
});

describe("parseRelayList", () => {
  it("treats a marker-less entry as both read and write", () => {
    expect(parseRelayList(relayListEvent([["r", "wss://a.example"]]))).toEqual([
      { url: "wss://a.example/", read: true, write: true },
    ]);
  });

  it("honours read and write markers", () => {
    expect(
      parseRelayList(
        relayListEvent([
          ["r", "wss://a.example", "read"],
          ["r", "wss://b.example", "write"],
        ]),
      ),
    ).toEqual([
      { url: "wss://a.example/", read: true, write: false },
      { url: "wss://b.example/", read: false, write: true },
    ]);
  });

  it("normalizes urls so that trailing-slash variants collapse", () => {
    expect(
      parseRelayList(
        relayListEvent([
          ["r", "wss://a.example"],
          ["r", "wss://a.example/"],
        ]),
      ),
    ).toEqual([{ url: "wss://a.example/", read: true, write: true }]);
  });

  it("ignores tags that are not r tags", () => {
    expect(
      parseRelayList(
        relayListEvent([
          ["p", "d".repeat(64)],
          ["r", "wss://a.example"],
        ]),
      ),
    ).toEqual([{ url: "wss://a.example/", read: true, write: true }]);
  });

  it("drops unparseable and non-websocket urls", () => {
    expect(
      parseRelayList(
        relayListEvent([
          ["r", "https://a.example"],
          ["r", "not a url"],
          ["r"],
        ]),
      ),
    ).toEqual([]);
  });

  it("ignores an unknown marker rather than dropping the entry", () => {
    expect(
      parseRelayList(relayListEvent([["r", "wss://a.example", "sometimes"]])),
    ).toEqual([{ url: "wss://a.example/", read: true, write: true }]);
  });
});
```

最後のテストが重要。NIP-65 はマーカーを `read` / `write` の 2 つしか定義していないが、**未知のマーカーが来たときにエントリごと捨てると、そのリレーが見えなくなる**。マーカー無しと同じ扱い（both）にするほうが安全側。

- [ ] **Step 6: 失敗を確認**

Run: `pnpm exec vitest run src/core/read/relay-list.test.ts`
Expected: FAIL — `Failed to resolve import "./relay-list"`

- [ ] **Step 7: 実装**

`src/core/read/relay-list.ts`:

```ts
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

export type RelayListEntry = {
  url: RelayUrl;
  read: boolean;
  write: boolean;
};

/**
 * NIP-65 の kind:10002 を解釈する。
 * r タグの値が URL、任意の 3 番目の要素が "read" / "write" マーカー。
 * マーカーが無い場合は read と write の両方 (NIP-65)。
 * 未知のマーカーはマーカー無しと同じ扱いにする — エントリごと捨てると
 * そのリレーが見えなくなり、取りこぼしのほうが害が大きい。
 */
export const parseRelayList = (event: NostrEvent): RelayListEntry[] => {
  const byUrl = new Map<RelayUrl, RelayListEntry>();

  for (const tag of event.tags) {
    if (tag[0] !== "r") continue;
    const raw = tag[1];
    if (typeof raw !== "string") continue;
    const url = normalizeRelayUrl(raw);
    if (!url) continue;

    const marker = tag[2];
    const read = marker !== "write";
    const write = marker !== "read";

    const existing = byUrl.get(url);
    if (existing) {
      existing.read ||= read;
      existing.write ||= write;
      continue;
    }
    byUrl.set(url, { url, read, write });
  }

  return [...byUrl.values()];
};
```

- [ ] **Step 8: 通ることを確認、コミット**

```bash
pnpm exec vitest run src/core/relay/relay-url.test.ts src/core/read/relay-list.test.ts
pnpm fix && pnpm typecheck && pnpm check
git add src/core/relay/relay-url.ts src/core/relay/relay-url.test.ts src/core/read/relay-list.ts src/core/read/relay-list.test.ts
git commit -m "feat(read): add relay url normalization and NIP-65 relay list parsing"
```

Expected: PASS（6 + 6 = 12 件）

---

### Task 3: `RoutingTable` と既定リレー

**Files:**
- Create: `src/core/read/default-relays.ts`
- Create: `src/core/read/routing-table.ts`
- Test: `src/core/read/routing-table.test.ts`

**Interfaces:**
- Consumes: `EventStore`（`src/core/read/event-store`）、`parseRelayList`（Task 2）、`RelayUrl`
- Produces:
  - `const BOOTSTRAP_INDEXERS: readonly RelayUrl[]`
  - `const FALLBACK_RELAYS: readonly RelayUrl[]`
  - `const MAX_RELAYS_PER_AUTHOR = 3`
  - `class RoutingTable` — `constructor(store: EventStore)` / `writeRelaysFor(pubkey: string): RelayUrl[]` / `readRelaysFor(pubkey: string): RelayUrl[]`

**`EventStore` に新しいメソッドが要る。** 現在の `EventStore` は `get(id)` しか持たず、「pubkey と kind から引く」ができない。このタスクで `latestReplaceable(kind, pubkey)` を足す。

- [ ] **Step 1: `EventStore` に置換可能イベントの参照を足す（失敗するテスト）**

`src/core/read/event-store.test.ts` の末尾に追加:

```ts
describe("EventStore.latestReplaceable", () => {
  it("returns undefined when nothing is stored for that author", () => {
    const store = new EventStore();
    expect(store.latestReplaceable(10002, "f".repeat(64))).toBeUndefined();
  });

  it("returns the version with the greatest created_at", () => {
    const store = new EventStore();
    const older = sign("older", { kind: 10002, created_at: 1_000 });
    const newer = sign("newer", { kind: 10002, created_at: 2_000 });

    store.put(newer, "wss://a");
    store.put(older, "wss://a");

    expect(store.latestReplaceable(10002, newer.pubkey)?.content).toBe("newer");
  });

  it("does not confuse kinds or authors", () => {
    const store = new EventStore();
    const relayList = sign("relays", { kind: 10002, created_at: 1_000 });
    store.put(relayList, "wss://a");

    expect(store.latestReplaceable(3, relayList.pubkey)).toBeUndefined();
    expect(store.latestReplaceable(10002, "0".repeat(64))).toBeUndefined();
  });
});
```

このテストは既存の `sign` ヘルパを `kind` と `created_at` で上書きできるよう拡張する必要がある。**既存の `sign` を次の形に変更すること**（既存テストは引数無しで呼んでいるので後方互換）:

```ts
const sign = (
  content = "hello nostr",
  overrides: { kind?: number; created_at?: number } = {},
): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: overrides.created_at ?? 1_700_000_000,
    kind: overrides.kind ?? 1,
    tags: [],
    content,
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)) };
};
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/read/event-store.test.ts`
Expected: FAIL — `store.latestReplaceable is not a function`

- [ ] **Step 3: `EventStore` に実装**

`src/core/read/event-store.ts` の `EventStore` クラスに、`#events` に加えてインデックスを持たせる。

```ts
  /** `${kind}:${pubkey}` → 最新の置換可能イベントの id */
  readonly #replaceable = new Map<string, string>();
```

`put` の `"inserted"` 経路（`this.#events.set(...)` の直後）に追加:

```ts
    this.#indexReplaceable(event);
```

そしてメソッドを 2 つ追加:

```ts
  /**
   * 置換可能イベント (10000-19999) と、kind:0 / kind:3 の最新版を索引する。
   * ルーティング表 (ADR-0016) はこの索引から kind:10002 を導出する。
   */
  #indexReplaceable(event: NostrEvent): void {
    const replaceable =
      event.kind === 0 ||
      event.kind === 3 ||
      (event.kind >= 10000 && event.kind < 20000);
    if (!replaceable) return;

    const key = `${event.kind}:${event.pubkey}`;
    const currentId = this.#replaceable.get(key);
    const current = currentId ? this.#events.get(currentId)?.event : undefined;
    // 同一 pubkey の複数版が届くリレーが実在する (purplepag.es で最大4版)。
    // created_at 最大の版を採る (ADR-0016)。
    if (current && current.created_at >= event.created_at) return;
    this.#replaceable.set(key, event.id);
  }

  latestReplaceable(kind: number, pubkey: string): NostrEvent | undefined {
    const id = this.#replaceable.get(`${kind}:${pubkey}`);
    return id ? this.get(id) : undefined;
  }
```

- [ ] **Step 4: 通ることを確認**

Run: `pnpm exec vitest run src/core/read/event-store.test.ts`
Expected: PASS（既存 6 件 + 新規 3 件 = 9 件）

- [ ] **Step 5: 既定リレーを書く**

`src/core/read/default-relays.ts`:

```ts
import type { RelayUrl } from "../relay/relay-connection";

/**
 * kind:10002 と kind:0 を引く専用経路 (ADR-0016 のブートストラップ)。
 * 選定根拠と 2026-08-01 の実測は
 * docs/research/2026-08-01-nip65-relay-selection.md を参照。
 * このリストは半年で腐る前提で扱うこと。既定リレーを触るときは測り直す。
 */
export const BOOTSTRAP_INDEXERS: readonly RelayUrl[] = [
  "wss://directory.yabu.me/",
  "wss://profiles.nostr1.com/",
  "wss://indexer.coracle.social/",
  "wss://purplepag.es/",
];

/** kind:10002 が引けない著者の投稿を取りに行く先 (ADR-0016) */
export const FALLBACK_RELAYS: readonly RelayUrl[] = [
  "wss://yabu.me/",
  "wss://nos.lol/",
  "wss://relay.damus.io/",
];

/**
 * 1 著者あたり何本の write relay を使うか。
 * NIP-65 は「各カテゴリ 2-4 本に保て」と案内しているので大半の著者は 4 本以下。
 * 最小リレー被覆 (greedy set cover) は後続 #3 の担当であり、ここでは
 * 決定的に先頭から採るだけにする。
 */
export const MAX_RELAYS_PER_AUTHOR = 3;
```

- [ ] **Step 6: `RoutingTable` の失敗するテストを書く**

`src/core/read/routing-table.test.ts`:

```ts
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { computeEventId, type NostrEvent } from "../nostr/event";
import { EventStore } from "./event-store";
import { RoutingTable } from "./routing-table";

const keyFor = (seed: number) =>
  Uint8Array.from(Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1));

const relayList = (
  seed: number,
  tags: string[][],
  createdAt = 1_700_000_000,
): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: createdAt,
    kind: 10002,
    tags,
    content: "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

describe("RoutingTable", () => {
  it("returns no relays for an author with no relay list", () => {
    const table = new RoutingTable(new EventStore());
    expect(table.writeRelaysFor("f".repeat(64))).toEqual([]);
  });

  it("returns the author's write relays", () => {
    const store = new EventStore();
    const event = relayList(1, [
      ["r", "wss://write.example", "write"],
      ["r", "wss://read.example", "read"],
    ]);
    store.put(event, "wss://indexer");

    const table = new RoutingTable(store);
    expect(table.writeRelaysFor(event.pubkey)).toEqual(["wss://write.example/"]);
    expect(table.readRelaysFor(event.pubkey)).toEqual(["wss://read.example/"]);
  });

  it("treats a marker-less relay as both read and write", () => {
    const store = new EventStore();
    const event = relayList(2, [["r", "wss://both.example"]]);
    store.put(event, "wss://indexer");

    const table = new RoutingTable(store);
    expect(table.writeRelaysFor(event.pubkey)).toEqual(["wss://both.example/"]);
    expect(table.readRelaysFor(event.pubkey)).toEqual(["wss://both.example/"]);
  });

  it("caps the number of relays per author", () => {
    const store = new EventStore();
    const event = relayList(3, [
      ["r", "wss://one.example", "write"],
      ["r", "wss://two.example", "write"],
      ["r", "wss://three.example", "write"],
      ["r", "wss://four.example", "write"],
    ]);
    store.put(event, "wss://indexer");

    expect(new RoutingTable(store).writeRelaysFor(event.pubkey)).toEqual([
      "wss://one.example/",
      "wss://two.example/",
      "wss://three.example/",
    ]);
  });

  it("uses the newest relay list when several versions are stored", () => {
    const store = new EventStore();
    const older = relayList(4, [["r", "wss://old.example", "write"]], 1_000);
    const newer = relayList(4, [["r", "wss://new.example", "write"]], 2_000);
    store.put(newer, "wss://indexer");
    store.put(older, "wss://indexer");

    expect(new RoutingTable(store).writeRelaysFor(newer.pubkey)).toEqual([
      "wss://new.example/",
    ]);
  });

  it("reflects a relay list that arrives after the table was created", () => {
    const store = new EventStore();
    const table = new RoutingTable(store);
    const event = relayList(5, [["r", "wss://late.example", "write"]]);

    expect(table.writeRelaysFor(event.pubkey)).toEqual([]);
    store.put(event, "wss://indexer");
    expect(table.writeRelaysFor(event.pubkey)).toEqual(["wss://late.example/"]);
  });
});
```

最後のテストが「導出状態である」ことの証明。**表を自分で保持せず、毎回 store から引く**ので、後から `kind:10002` が届けば即座に反映される。

- [ ] **Step 7: 失敗を確認**

Run: `pnpm exec vitest run src/core/read/routing-table.test.ts`
Expected: FAIL — `Failed to resolve import "./routing-table"`

- [ ] **Step 8: 実装**

`src/core/read/routing-table.ts`:

```ts
import type { RelayUrl } from "../relay/relay-connection";
import { MAX_RELAYS_PER_AUTHOR } from "./default-relays";
import type { EventStore } from "./event-store";
import { parseRelayList } from "./relay-list";

const RELAY_LIST_KIND = 10002;

/**
 * 著者 → 取得先リレーの対応表。
 *
 * 表を自分で保持せず、EventStore の kind:10002 から毎回導出する (ADR-0016)。
 * 専用の永続化も TTL も持たない — 永続化は EventStore 側 (ADR-0018/0019) が
 * kind:10002 を普通のイベントとして保存すれば自動的に得られ、鮮度は
 * 置換可能イベントの created_at 後勝ちで決まる。
 */
export class RoutingTable {
  readonly #store: EventStore;

  constructor(store: EventStore) {
    this.#store = store;
  }

  /** その著者のイベントを取りに行くべきリレー */
  writeRelaysFor(pubkey: string): RelayUrl[] {
    return this.#relaysFor(pubkey, "write");
  }

  /** その著者宛のイベントを送るべきリレー */
  readRelaysFor(pubkey: string): RelayUrl[] {
    return this.#relaysFor(pubkey, "read");
  }

  #relaysFor(pubkey: string, direction: "read" | "write"): RelayUrl[] {
    const event = this.#store.latestReplaceable(RELAY_LIST_KIND, pubkey);
    if (!event) return [];
    return parseRelayList(event)
      .filter((entry) => entry[direction])
      .map((entry) => entry.url)
      .slice(0, MAX_RELAYS_PER_AUTHOR);
  }
}
```

- [ ] **Step 9: 通ることを確認、コミット**

```bash
pnpm exec vitest run src/core/read
pnpm fix && pnpm typecheck && pnpm check
git add src/core/read/default-relays.ts src/core/read/routing-table.ts src/core/read/routing-table.test.ts src/core/read/event-store.ts src/core/read/event-store.test.ts
git commit -m "feat(read): derive a routing table from kind:10002 in the event store"
```

Expected: PASS（`routing-table` 6 件 + `event-store` 9 件 + 既存）

---

### Task 4: クエリプラン — 論理クエリをリレー別に分割する

**Files:**
- Create: `src/core/read/query-plan.ts`
- Test: `src/core/read/query-plan.test.ts`

**Interfaces:**
- Consumes: `RelayFilter` / `RelayUrl`、`FALLBACK_RELAYS`（Task 3）
- Produces:
  - `type QueryPlan = { perRelay: Map<RelayUrl, RelayFilter[]>; unroutableAuthors: string[] }`
  - `function planQuery(options: { filters: RelayFilter[]; writeRelaysFor: (pubkey: string) => RelayUrl[]; fallbackRelays: readonly RelayUrl[] }): QueryPlan`

**純粋関数にする。** `RoutingTable` も `EventStore` も知らず、`writeRelaysFor` を関数として受け取るだけ。これでルーティングの分割ロジックだけを独立してテストできる。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/query-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planQuery } from "./query-plan";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const routing: Record<string, string[]> = {
  [A]: ["wss://one/"],
  [B]: ["wss://two/"],
  [C]: ["wss://one/", "wss://two/"],
};
const writeRelaysFor = (pubkey: string) => routing[pubkey] ?? [];
const fallbackRelays = ["wss://fallback/"];

describe("planQuery", () => {
  it("splits one filter into per-relay filters by author", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [A, B], limit: 50 }],
      writeRelaysFor,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://one/")).toEqual([
      { kinds: [1], authors: [A], limit: 50 },
    ]);
    expect(plan.perRelay.get("wss://two/")).toEqual([
      { kinds: [1], authors: [B], limit: 50 },
    ]);
    expect(plan.unroutableAuthors).toEqual([]);
  });

  it("sends an author with several write relays to each of them", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [C] }],
      writeRelaysFor,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://one/")).toEqual([{ kinds: [1], authors: [C] }]);
    expect(plan.perRelay.get("wss://two/")).toEqual([{ kinds: [1], authors: [C] }]);
  });

  it("routes unroutable authors to the fallback relays and reports them", () => {
    const unknown = "d".repeat(64);
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [A, unknown] }],
      writeRelaysFor,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://one/")).toEqual([{ kinds: [1], authors: [A] }]);
    expect(plan.perRelay.get("wss://fallback/")).toEqual([
      { kinds: [1], authors: [unknown] },
    ]);
    expect(plan.unroutableAuthors).toEqual([unknown]);
  });

  it("sends an author-less filter to the fallback relays without reporting it", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], limit: 20 }],
      writeRelaysFor,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://fallback/")).toEqual([{ kinds: [1], limit: 20 }]);
    // 著者を指定していないのだから「ルーティングできなかった著者」は 0 人
    expect(plan.unroutableAuthors).toEqual([]);
  });

  it("merges filters destined for the same relay", () => {
    const plan = planQuery({
      filters: [
        { kinds: [1], authors: [A] },
        { kinds: [7], authors: [A] },
      ],
      writeRelaysFor,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://one/")).toEqual([
      { kinds: [1], authors: [A] },
      { kinds: [7], authors: [A] },
    ]);
    expect(plan.perRelay.size).toBe(1);
  });

  it("does not report the same unroutable author twice", () => {
    const unknown = "d".repeat(64);
    const plan = planQuery({
      filters: [
        { kinds: [1], authors: [unknown] },
        { kinds: [7], authors: [unknown] },
      ],
      writeRelaysFor,
      fallbackRelays,
    });

    expect(plan.unroutableAuthors).toEqual([unknown]);
  });

  it("returns an empty plan for no filters", () => {
    const plan = planQuery({ filters: [], writeRelaysFor, fallbackRelays });
    expect(plan.perRelay.size).toBe(0);
    expect(plan.unroutableAuthors).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/read/query-plan.test.ts`
Expected: FAIL — `Failed to resolve import "./query-plan"`

- [ ] **Step 3: 実装**

`src/core/read/query-plan.ts`:

```ts
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

export type QueryPlan = {
  /** リレーごとに送るフィルタ。同じリレー向けのものはまとめられている */
  perRelay: Map<RelayUrl, RelayFilter[]>;
  /** write relay が分からず fallback に回した著者 (重複なし) */
  unroutableAuthors: string[];
};

export type PlanQueryOptions = {
  filters: RelayFilter[];
  writeRelaysFor: (pubkey: string) => RelayUrl[];
  fallbackRelays: readonly RelayUrl[];
};

/**
 * 1 つの論理クエリを「リレーごとに担当著者の異なる N 本の実クエリ」へ分割する
 * (ADR-0005)。EventStore も RoutingTable も知らない純粋関数。
 *
 * 著者を指定していないフィルタはルーティングのしようがないので fallback へ送る。
 * これは「ルーティングできなかった著者」ではないので unroutableAuthors には
 * 数えない — 数えると incomplete が常時点灯して意味を失う。
 */
export const planQuery = ({
  filters,
  writeRelaysFor,
  fallbackRelays,
}: PlanQueryOptions): QueryPlan => {
  const perRelay = new Map<RelayUrl, RelayFilter[]>();
  const unroutable = new Set<string>();

  const add = (relay: RelayUrl, filter: RelayFilter) => {
    const existing = perRelay.get(relay);
    if (existing) existing.push(filter);
    else perRelay.set(relay, [filter]);
  };

  for (const filter of filters) {
    const authors = filter.authors;

    if (!authors || authors.length === 0) {
      for (const relay of fallbackRelays) add(relay, filter);
      continue;
    }

    // リレー → そのリレーが担当する著者
    const byRelay = new Map<RelayUrl, string[]>();
    for (const author of authors) {
      const relays = writeRelaysFor(author);
      if (relays.length === 0) {
        unroutable.add(author);
        for (const relay of fallbackRelays) {
          const bucket = byRelay.get(relay);
          if (bucket) bucket.push(author);
          else byRelay.set(relay, [author]);
        }
        continue;
      }
      for (const relay of relays) {
        const bucket = byRelay.get(relay);
        if (bucket) bucket.push(author);
        else byRelay.set(relay, [author]);
      }
    }

    for (const [relay, relayAuthors] of byRelay) {
      add(relay, { ...filter, authors: relayAuthors });
    }
  }

  return { perRelay, unroutableAuthors: [...unroutable] };
};
```

- [ ] **Step 4: 通ることを確認、コミット**

```bash
pnpm exec vitest run src/core/read/query-plan.test.ts
pnpm fix && pnpm typecheck && pnpm check
git add src/core/read/query-plan.ts src/core/read/query-plan.test.ts
git commit -m "feat(read): split one logical query into per-relay filters by author"
```

Expected: PASS（7 件）

---

### Task 5: `SubscriptionManager` — 接続の所有と共有

**Files:**
- Create: `src/core/read/subscription-manager.ts`
- Test: `src/core/read/subscription-manager.test.ts`

**Interfaces:**
- Consumes: `RelayConnection` / `RelayUrl` / `RelayFilter`、`EventStore`、`RoutingTable`（Task 3）、`planQuery`（Task 4）、`normalizeRelayUrl`（Task 2）
- Produces:
  - `type SectionDelivery = { onEvent(id: string, relay: RelayUrl): void; onRelayComplete(relay: RelayUrl): void; onRelayUnreachable(relay: RelayUrl): void }`
  - `type SectionHandle = { readonly relays: RelayUrl[]; readonly unroutableAuthors: number; close(): void }`
  - `class SubscriptionManager` — `constructor(options: { store: EventStore; routing: RoutingTable; connect: (url: RelayUrl) => RelayConnection; fallbackRelays?: readonly RelayUrl[] })` / `subscribe(filters: RelayFilter[], relays: RelayUrl[] | undefined, delivery: SectionDelivery): SectionHandle` / `readonly connectionCount: number` / `dispose(): void`

**`subscribe` に渡す `relays` が `undefined` のときだけ Outbox ルーティングを行う。** 指定されていれば、そのリレーへそのまま送る（特定リレー内タイムライン用、`source.relays` のバイパス）。

**配信するのはイベント本体ではなく id。** 本体は `EventStore` にあり、セクションは `store.get(id)` で引く（[ADR-0024](../../adr/0024-shared-bodies-per-section-membership.md)）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/subscription-manager.test.ts`:

```ts
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { computeEventId, type NostrEvent } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayUrl } from "../relay/relay-connection";
import { EventStore } from "./event-store";
import { RoutingTable } from "./routing-table";
import { SubscriptionManager } from "./subscription-manager";

const keyFor = (seed: number) =>
  Uint8Array.from(Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1));

const signed = (
  seed: number,
  overrides: Partial<NostrEvent> = {},
): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: overrides.created_at ?? 1_700_000_000,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? "note",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const setup = () => {
  const relays = new Map<RelayUrl, FakeRelayConnection>();
  const store = new EventStore();
  const manager = new SubscriptionManager({
    store,
    routing: new RoutingTable(store),
    connect: (url) => {
      const existing = relays.get(url);
      if (existing) throw new Error(`connect called twice for ${url}`);
      const relay = new FakeRelayConnection(url);
      relays.set(url, relay);
      return relay;
    },
    fallbackRelays: ["wss://fallback/"],
  });
  const delivery = () => ({
    onEvent: vi.fn(),
    onRelayComplete: vi.fn(),
    onRelayUnreachable: vi.fn(),
  });
  return { relays, store, manager, delivery };
};

describe("SubscriptionManager", () => {
  it("sends the filters straight to the given relays when relays are specified", () => {
    const { relays, manager, delivery } = setup();
    const d = delivery();

    const handle = manager.subscribe([{ kinds: [1] }], ["wss://given/"], d);

    expect(handle.relays).toEqual(["wss://given/"]);
    expect(relays.get("wss://given/")?.subscriptions[0].filters).toEqual([
      { kinds: [1] },
    ]);
  });

  it("normalizes explicitly given relay urls", () => {
    const { relays, manager, delivery } = setup();
    manager.subscribe([{ kinds: [1] }], ["wss://given"], delivery());
    expect(relays.has("wss://given/")).toBe(true);
  });

  it("routes by author when no relays are given", () => {
    const { relays, store, manager, delivery } = setup();
    const author = signed(1, {
      kind: 10002,
      tags: [["r", "wss://author-write/", "write"]],
      content: "",
    });
    store.put(author, "wss://indexer/");

    const handle = manager.subscribe(
      [{ kinds: [1], authors: [author.pubkey] }],
      undefined,
      delivery(),
    );

    expect(handle.relays).toEqual(["wss://author-write/"]);
    expect(handle.unroutableAuthors).toBe(0);
    expect(relays.get("wss://author-write/")?.subscriptions[0].filters).toEqual([
      { kinds: [1], authors: [author.pubkey] },
    ]);
  });

  it("falls back and reports authors it cannot route", () => {
    const { relays, manager, delivery } = setup();
    const handle = manager.subscribe(
      [{ kinds: [1], authors: ["f".repeat(64)] }],
      undefined,
      delivery(),
    );

    expect(handle.relays).toEqual(["wss://fallback/"]);
    expect(handle.unroutableAuthors).toBe(1);
    expect(relays.has("wss://fallback/")).toBe(true);
  });

  it("opens one connection per relay url even across sections", () => {
    const { manager, delivery } = setup();
    // connect が同じ URL で 2 回呼ばれたら setup の connect が throw する
    manager.subscribe([{ kinds: [1] }], ["wss://shared/"], delivery());
    manager.subscribe([{ kinds: [7] }], ["wss://shared/"], delivery());

    expect(manager.connectionCount).toBe(1);
  });

  it("stores the event and delivers its id, not the event object", () => {
    const { relays, store, manager, delivery } = setup();
    const d = delivery();
    manager.subscribe([{ kinds: [1] }], ["wss://one/"], d);

    const note = signed(2);
    relays.get("wss://one/")?.emitEvent(0, note);

    expect(d.onEvent).toHaveBeenCalledWith(note.id, "wss://one/");
    expect(store.get(note.id)).toEqual(note);
  });

  it("does not deliver an event that fails verification", () => {
    const { relays, manager, delivery } = setup();
    const d = delivery();
    manager.subscribe([{ kinds: [1] }], ["wss://one/"], d);

    const forged = { ...signed(3), content: "tampered" };
    relays.get("wss://one/")?.emitEvent(0, forged);

    expect(d.onEvent).not.toHaveBeenCalled();
  });

  it("reports eose and closure per relay", () => {
    const { relays, manager, delivery } = setup();
    const d = delivery();
    manager.subscribe([{ kinds: [1] }], ["wss://one/", "wss://two/"], d);

    relays.get("wss://one/")?.emitEose(0);
    relays.get("wss://two/")?.emitClosed(0, "blocked");

    expect(d.onRelayComplete).toHaveBeenCalledWith("wss://one/");
    expect(d.onRelayUnreachable).toHaveBeenCalledWith("wss://two/");
  });

  it("closes the connection only when the last section using it goes away", () => {
    const { relays, manager, delivery } = setup();
    const first = manager.subscribe([{ kinds: [1] }], ["wss://shared/"], delivery());
    const second = manager.subscribe([{ kinds: [7] }], ["wss://shared/"], delivery());

    first.close();
    expect(relays.get("wss://shared/")?.closed).toBe(false);
    expect(manager.connectionCount).toBe(1);

    second.close();
    expect(relays.get("wss://shared/")?.closed).toBe(true);
    expect(manager.connectionCount).toBe(0);
  });

  it("stops delivering to a closed section", () => {
    const { relays, manager, delivery } = setup();
    const d = delivery();
    const handle = manager.subscribe([{ kinds: [1] }], ["wss://one/"], d);

    handle.close();
    relays.get("wss://one/")?.emitEvent(0, signed(4));

    expect(d.onEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/read/subscription-manager.test.ts`
Expected: FAIL — `Failed to resolve import "./subscription-manager"`

- [ ] **Step 3: 実装**

`src/core/read/subscription-manager.ts`:

```ts
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelayUrl,
} from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import { FALLBACK_RELAYS } from "./default-relays";
import type { EventStore } from "./event-store";
import { planQuery } from "./query-plan";
import type { RoutingTable } from "./routing-table";

/**
 * 配信されるのはイベント本体ではなく id (ADR-0024)。
 * 本体は EventStore にあり、セクションは store.get(id) で引く。
 */
export type SectionDelivery = {
  onEvent: (id: string, relay: RelayUrl) => void;
  onRelayComplete: (relay: RelayUrl) => void;
  onRelayUnreachable: (relay: RelayUrl) => void;
};

export type SectionHandle = {
  /** このセクションが待っているリレー。完了判定の母集合になる */
  readonly relays: RelayUrl[];
  readonly unroutableAuthors: number;
  close(): void;
};

export type SubscriptionManagerOptions = {
  store: EventStore;
  routing: RoutingTable;
  connect: (url: RelayUrl) => RelayConnection;
  fallbackRelays?: readonly RelayUrl[];
};

type PooledConnection = {
  connection: RelayConnection;
  refCount: number;
};

/**
 * すべてのリレー接続と購読を所有する (ADR-0023)。
 * セクションは自分で接続しない。
 *
 * この計画では購読のマージも 30 接続上限も行わない (後続 #3)。
 * ここが提供するのは「著者ごとのルーティング」と
 * 「同じリレー URL への接続を全セクションで共有すること」の 2 つ。
 */
export class SubscriptionManager {
  readonly #options: SubscriptionManagerOptions;
  readonly #pool = new Map<RelayUrl, PooledConnection>();

  constructor(options: SubscriptionManagerOptions) {
    this.#options = options;
  }

  get connectionCount(): number {
    return this.#pool.size;
  }

  subscribe(
    filters: RelayFilter[],
    relays: RelayUrl[] | undefined,
    delivery: SectionDelivery,
  ): SectionHandle {
    const fallbackRelays = this.#options.fallbackRelays ?? FALLBACK_RELAYS;

    const perRelay = new Map<RelayUrl, RelayFilter[]>();
    let unroutableAuthors = 0;

    if (relays) {
      // 明示指定は Outbox ルーティングをバイパスする (ADR-0005)
      for (const raw of relays) {
        const url = normalizeRelayUrl(raw);
        if (url) perRelay.set(url, filters);
      }
    } else {
      const plan = planQuery({
        filters,
        writeRelaysFor: (pubkey) => this.#options.routing.writeRelaysFor(pubkey),
        fallbackRelays,
      });
      for (const [url, planned] of plan.perRelay) perRelay.set(url, planned);
      unroutableAuthors = plan.unroutableAuthors.length;
    }

    let closed = false;
    const opened: { url: RelayUrl; subscription: RelaySubscription }[] = [];

    for (const [url, relayFilters] of perRelay) {
      const connection = this.#acquire(url);
      const subscription = connection.subscribe(relayFilters, {
        onEvent: (event) => {
          if (closed) return;
          if (this.#options.store.put(event, url) === "rejected") return;
          delivery.onEvent(event.id, url);
        },
        onEose: () => {
          if (!closed) delivery.onRelayComplete(url);
        },
        onClosed: () => {
          if (!closed) delivery.onRelayUnreachable(url);
        },
      });
      opened.push({ url, subscription });
    }

    return {
      relays: [...perRelay.keys()],
      unroutableAuthors,
      close: () => {
        if (closed) return;
        closed = true;
        for (const { url, subscription } of opened) {
          subscription.close();
          this.#release(url);
        }
      },
    };
  }

  dispose(): void {
    for (const pooled of this.#pool.values()) pooled.connection.close();
    this.#pool.clear();
  }

  #acquire(url: RelayUrl): RelayConnection {
    const pooled = this.#pool.get(url);
    if (pooled) {
      pooled.refCount += 1;
      return pooled.connection;
    }
    const connection = this.#options.connect(url);
    this.#pool.set(url, { connection, refCount: 1 });
    return connection;
  }

  #release(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    pooled.refCount -= 1;
    if (pooled.refCount > 0) return;
    pooled.connection.close();
    this.#pool.delete(url);
  }
}
```

- [ ] **Step 4: 通ることを確認、コミット**

```bash
pnpm exec vitest run src/core/read/subscription-manager.test.ts
pnpm fix && pnpm typecheck && pnpm check
git add src/core/read/subscription-manager.ts src/core/read/subscription-manager.test.ts
git commit -m "feat(read): add a subscription manager that owns and shares relay connections"
```

Expected: PASS（11 件）

---

### Task 6: `SectionReader` の配線替え

**Files:**
- Modify: `src/core/read/section-reader.ts`
- Modify: `src/core/read/section-reader.test.ts`
- Modify: `src/core/solid/create-section.ts`
- Modify: `src/core/solid/create-section.test.tsx`

**Interfaces:**
- Consumes: `SubscriptionManager` / `SectionHandle` / `SectionDelivery`（Task 5）
- Produces:
  - `SectionReaderOptions` が `{ source: NostrSource; order: Order; store: EventStore; manager: SubscriptionManager }` になる（`openRelay` / `releaseRelay` は**削除**）
  - `CreateSectionOptions` が `{ source: Accessor<NostrSource>; order?: Order; store: EventStore; manager: SubscriptionManager }` になる

**`unroutableAuthors` が本物になる。** これまでは「リレーが 1 つも設定されていないとき、フィルタに書かれた著者数」を返すその場しのぎだった。これからは `SectionHandle.unroutableAuthors`（実際にルーティングできなかった著者数）を使う。

- [ ] **Step 1: `section-reader.test.ts` を新しいインターフェースに書き換える**

既存テストは `openRelay` / `releaseRelay` を使っている。`setup()` ヘルパを次の形に変える。**個々のテストの期待値は変えない** — 振る舞いは同じでなければならない。

```ts
const setup = (relayUrls = ["wss://a/"]) => {
  const relays = new Map<string, FakeRelayConnection>();
  const store = new PassThroughStore();
  const manager = new SubscriptionManager({
    store,
    routing: new RoutingTable(store),
    connect: (url) => {
      const relay = new FakeRelayConnection(url);
      relays.set(url, relay);
      return relay;
    },
    fallbackRelays: ["wss://fallback/"],
  });
  const reader = new SectionReader({
    source: { type: "nostr", filters: [{ kinds: [1] }], relays: relayUrls },
    order: "created-at-desc",
    store,
    manager,
  });
  return { relays, store, manager, reader, relay: () => relays.get(relayUrls[0]) };
};
```

既存テストのうち `relay.emitEvent(0, ...)` を使っているものは `relay()!.emitEvent(0, ...)` に置き換える。「`releaseRelay` が呼ばれること」を検証していたテストは、**「最後のセクションが閉じたら接続も閉じる」を `manager.connectionCount` で検証する形**に置き換える（所有権は manager に移ったため）。

- [ ] **Step 2: ルーティングが効くことを示す新しいテストを追加**

`src/core/read/section-reader.test.ts` に追加:

```ts
describe("SectionReader with Outbox routing", () => {
  it("waits on the relays the routing table chose, not a hardcoded list", () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    const authorList = relayListEvent(7, [["r", "wss://chosen/", "write"]]);
    store.put(authorList, "wss://indexer/");

    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: [authorList.pubkey] }],
      },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();

    expect(relays.has("wss://chosen/")).toBe(true);
    expect(relays.has("wss://fallback/")).toBe(false);

    relays.get("wss://chosen/")?.emitEose(0);
    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete).toBeUndefined();
  });

  it("reports authors it could not route", () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: ["f".repeat(64)] }],
      },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();
    relays.get("wss://fallback/")?.emitEose(0);

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete?.unroutableAuthors).toBe(1);
  });
});
```

`relayListEvent` ヘルパはこのファイルにまだ無いので、`routing-table.test.ts` と同じ実装を追加する（テストファイル間の共有はしない — 各テストが自分の fixture を持つほうが読みやすい）。

```ts
const relayListEvent = (seed: number, tags: string[][]): NostrEvent => {
  const sk = Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: 1_700_000_000,
    kind: 10002,
    tags,
    content: "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};
```

- [ ] **Step 3: 失敗を確認**

Run: `pnpm exec vitest run src/core/read/section-reader.test.ts`
Expected: FAIL — `manager` は `SectionReaderOptions` に存在しない、など型エラーとテスト失敗

- [ ] **Step 4: `SectionReader` を実装し直す**

`src/core/read/section-reader.ts` を次の形に変更する。`countUnroutableAuthors` ヘルパは**削除**する（manager が本物の数を返すため）。

```ts
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { EventStore } from "./event-store";
import {
  MAX_ITEMS_PER_SECTION,
  type NostrSource,
  type Order,
  type SectionStatus,
} from "./source";
import type { SectionHandle, SubscriptionManager } from "./subscription-manager";

export type SectionReaderOptions = {
  source: NostrSource;
  order: Order;
  store: EventStore;
  /** 接続と購読は manager が所有する (ADR-0023) */
  manager: SubscriptionManager;
};

type RelayState = {
  complete: boolean;
  unreachable: boolean;
};

export class SectionReader {
  readonly #options: SectionReaderOptions;
  readonly #listeners = new Set<() => void>();
  readonly #ids = new Set<string>();
  #relays = new Map<RelayUrl, RelayState>();
  #handle: SectionHandle | null = null;
  #items: NostrEvent[] = [];
  #started = false;

  constructor(options: SectionReaderOptions) {
    this.#options = options;
  }

  get items(): NostrEvent[] {
    return [...this.#items];
  }

  get status(): SectionStatus {
    const states = [...this.#relays.values()];
    const unreachableRelays = states.filter((r) => r.unreachable).length;
    const live = states.filter((r) => !r.unreachable);
    const allSettled = this.#started && live.every((r) => r.complete);

    const phase: SectionStatus["phase"] = allSettled
      ? "settled"
      : this.#items.length > 0
        ? "streaming"
        : "initial";

    const unroutableAuthors = this.#handle?.unroutableAuthors ?? 0;
    return unreachableRelays > 0 || unroutableAuthors > 0
      ? { phase, incomplete: { unreachableRelays, unroutableAuthors } }
      : { phase };
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;

    const { source, manager } = this.#options;
    this.#handle = manager.subscribe(source.filters, source.relays, {
      onEvent: (id, relay) => this.#onEvent(id, relay),
      onRelayComplete: (relay) => {
        this.#relayState(relay).complete = true;
        this.#notify();
      },
      onRelayUnreachable: (relay) => {
        this.#relayState(relay).unreachable = true;
        this.#notify();
      },
    });

    for (const relay of this.#handle.relays) this.#relayState(relay);
  }

  /**
   * 接続が開いた直後に EOSE が来る実装もありうるため、subscribe() が返る前に
   * コールバックが発火しても取りこぼさないよう、無ければその場で作る。
   */
  #relayState(relay: RelayUrl): RelayState {
    const existing = this.#relays.get(relay);
    if (existing) return existing;
    const created: RelayState = { complete: false, unreachable: false };
    this.#relays.set(relay, created);
    return created;
  }

  stop(): void {
    this.#handle?.close();
    this.#handle = null;
    this.#relays = new Map();
    this.#started = false;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #onEvent(id: string, _relay: RelayUrl): void {
    if (this.#ids.has(id)) return;
    // 本体は EventStore が持つ。ここに載せるのは検証済みのコピー (ADR-0024)
    const stored = this.#options.store.get(id);
    if (!stored) return;

    this.#ids.add(id);
    const mostRecent = [...this.#items, stored]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, MAX_ITEMS_PER_SECTION);
    this.#items = this.#sorted(mostRecent);

    if (this.#ids.size > this.#items.length) {
      const kept = new Set(this.#items.map((e) => e.id));
      for (const kid of this.#ids) if (!kept.has(kid)) this.#ids.delete(kid);
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

`PassThroughStore`（テスト用ダブル）は `get(id)` が本物を返す必要がある。既に `get` を override 済みなので、`put` が保存した本体を返す実装のままでよい。

- [ ] **Step 5: `create-section.ts` を配線替え**

`src/core/solid/create-section.ts` の `CreateSectionOptions` から `openRelay` / `releaseRelay` を削除し、`manager: SubscriptionManager` を足す。`SectionReader` へそのまま渡す。`create-section.test.tsx` の「release-before-open の順序」を検証していたテストは、**`manager.connectionCount` が `source` 変更後も 1 のままであること**（前の接続が閉じてから新しいのが開く）を検証する形に置き換える。

- [ ] **Step 6: 通ることを確認、コミット**

```bash
pnpm exec vitest run src/core
pnpm fix && pnpm typecheck && pnpm check
git add src/core/read/section-reader.ts src/core/read/section-reader.test.ts src/core/solid/create-section.ts src/core/solid/create-section.test.tsx
git commit -m "refactor(read): move connection ownership from SectionReader to the manager"
```

Expected: `src/core` が全て緑

---

### Task 7: ブートストラップ・ウォームアップ

**Files:**
- Create: `src/core/read/bootstrap.ts`
- Test: `src/core/read/bootstrap.test.ts`

**Interfaces:**
- Consumes: `EventStore`、`RelayConnection` / `RelayUrl`、`BOOTSTRAP_INDEXERS`（Task 3）
- Produces:
  - `type WarmUpResult = { followees: string[]; routed: number; unroutable: number }`
  - `function warmUpRouting(options: { pubkey: string; store: EventStore; connect: (url: RelayUrl) => RelayConnection; indexers?: readonly RelayUrl[]; timeoutMs?: number }): Promise<WarmUpResult>`

**やること**: ① 対象 pubkey の `kind:3`（フォローリスト）をインデクサから引く ② その全員分の `kind:10002` を **1 クエリ**で引く（`{kinds:[10002], authors:[...]}`）。どちらも `EventStore` に入るので、`RoutingTable` が自動的に導出できるようになる。

**Outbox ルーティングは使わない**（循環依存を断つ専用経路、ADR-0016）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/bootstrap.test.ts`:

```ts
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { computeEventId, type NostrEvent } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayUrl } from "../relay/relay-connection";
import { warmUpRouting } from "./bootstrap";
import { EventStore } from "./event-store";
import { RoutingTable } from "./routing-table";

const keyFor = (seed: number) =>
  Uint8Array.from(Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1));

const sign = (seed: number, fields: Omit<NostrEvent, "id" | "pubkey" | "sig">) => {
  const sk = keyFor(seed);
  const unsigned = { ...fields, pubkey: bytesToHex(schnorr.getPublicKey(sk)) };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const base = { created_at: 1_700_000_000, tags: [], content: "" };

describe("warmUpRouting", () => {
  it("fetches the follow list then every followee's relay list in one query", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();

    const alice = sign(1, { ...base, kind: 10002, tags: [["r", "wss://alice/", "write"]] });
    const bob = sign(2, { ...base, kind: 10002, tags: [["r", "wss://bob/", "write"]] });
    const viewer = sign(3, {
      ...base,
      kind: 3,
      tags: [
        ["p", alice.pubkey],
        ["p", bob.pubkey],
      ],
    });

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      indexers: ["wss://indexer/"],
    });

    const indexer = () => relays.get("wss://indexer/");
    // 第 1 段: フォローリスト
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    expect(indexer()?.subscriptions[0].filters).toEqual([
      { kinds: [3], authors: [viewer.pubkey], limit: 1 },
    ]);
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    // 第 2 段: 全員分の kind:10002 を 1 クエリで
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    const second = indexer()?.subscriptions[1].filters[0];
    expect(second?.kinds).toEqual([10002]);
    expect(new Set(second?.authors)).toEqual(new Set([alice.pubkey, bob.pubkey]));

    indexer()?.emitEvent(1, alice);
    indexer()?.emitEose(1);

    const result = await pending;
    expect(result.followees).toHaveLength(2);
    expect(result.routed).toBe(1);
    expect(result.unroutable).toBe(1);

    const table = new RoutingTable(store);
    expect(table.writeRelaysFor(alice.pubkey)).toEqual(["wss://alice/"]);
    expect(table.writeRelaysFor(bob.pubkey)).toEqual([]);
  });

  it("resolves with an empty follow list when the viewer has no kind:3", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store,
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      indexers: ["wss://indexer/"],
    });

    await vi.waitFor(() =>
      expect(relays.get("wss://indexer/")?.subscriptions).toHaveLength(1),
    );
    relays.get("wss://indexer/")?.emitEose(0);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
    });
  });

  it("closes every connection it opened", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      indexers: ["wss://one/", "wss://two/"],
    });

    await vi.waitFor(() => expect(relays.size).toBe(2));
    for (const relay of relays.values()) relay.emitEose(0);
    await pending;

    for (const relay of relays.values()) expect(relay.closed).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/read/bootstrap.test.ts`
Expected: FAIL — `Failed to resolve import "./bootstrap"`

- [ ] **Step 3: 実装**

`src/core/read/bootstrap.ts`:

```ts
import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelayUrl,
} from "../relay/relay-connection";
import { BOOTSTRAP_INDEXERS } from "./default-relays";
import type { EventStore } from "./event-store";

const FOLLOW_LIST_KIND = 3;
const RELAY_LIST_KIND = 10002;
const DEFAULT_TIMEOUT_MS = 10_000;

export type WarmUpResult = {
  /** フォローリストに載っていた pubkey */
  followees: string[];
  /** kind:10002 が引けた人数 */
  routed: number;
  /** 引けなかった人数 */
  unroutable: number;
};

export type WarmUpOptions = {
  pubkey: string;
  store: EventStore;
  connect: (url: RelayUrl) => RelayConnection;
  indexers?: readonly RelayUrl[];
  timeoutMs?: number;
};

/**
 * 複数のインデクサへ同じフィルタを投げ、全部の EOSE を待って収集する。
 * ここは Outbox ルーティングを使わない専用経路 (ADR-0016)。
 * ルーティングに必要な kind:10002 を、ルーティング無しで取りに行くための入口。
 */
const collect = (
  connections: RelayConnection[],
  filters: RelayFilter[],
  store: EventStore,
  timeoutMs: number,
): Promise<NostrEvent[]> =>
  new Promise((resolve) => {
    const collected: NostrEvent[] = [];
    let pending = connections.length;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(collected);
    };
    const timer = setTimeout(finish, timeoutMs);
    const settleOne = () => {
      pending -= 1;
      if (pending <= 0) finish();
    };

    if (connections.length === 0) {
      finish();
      return;
    }

    for (const connection of connections) {
      connection.subscribe(filters, {
        onEvent: (event) => {
          if (store.put(event, connection.url) === "rejected") return;
          const stored = store.get(event.id);
          if (stored) collected.push(stored);
        },
        onEose: settleOne,
        onClosed: settleOne,
      });
    }
  });

export const warmUpRouting = async ({
  pubkey,
  store,
  connect,
  indexers = BOOTSTRAP_INDEXERS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: WarmUpOptions): Promise<WarmUpResult> => {
  const connections = indexers.map(connect);

  try {
    // ① フォローリスト
    await collect(
      connections,
      [{ kinds: [FOLLOW_LIST_KIND], authors: [pubkey], limit: 1 }],
      store,
      timeoutMs,
    );

    const followList = store.latestReplaceable(FOLLOW_LIST_KIND, pubkey);
    const followees = followList
      ? [
          ...new Set(
            followList.tags
              .filter((tag) => tag[0] === "p" && typeof tag[1] === "string")
              .map((tag) => tag[1]),
          ),
        ]
      : [];

    if (followees.length === 0) {
      return { followees, routed: 0, unroutable: 0 };
    }

    // ② 全員分の kind:10002 を 1 クエリで (ADR-0016)
    await collect(
      connections,
      [{ kinds: [RELAY_LIST_KIND], authors: followees }],
      store,
      timeoutMs,
    );

    let routed = 0;
    for (const followee of followees) {
      if (store.latestReplaceable(RELAY_LIST_KIND, followee)) routed += 1;
    }

    return { followees, routed, unroutable: followees.length - routed };
  } finally {
    for (const connection of connections) connection.close();
  }
};
```

- [ ] **Step 4: 通ることを確認、コミット**

```bash
pnpm exec vitest run src/core/read/bootstrap.test.ts
pnpm fix && pnpm typecheck && pnpm check
git add src/core/read/bootstrap.ts src/core/read/bootstrap.test.ts
git commit -m "feat(read): warm up the routing table from a bootstrap-only relay path"
```

Expected: PASS（3 件）

---

### Task 8: デバッグルートと 2 リレーに対する e2e

**Files:**
- Modify: `src/routes/debug/v1-section.tsx`
- Modify: `e2e/v1-section.spec.ts`
- Modify: `playwright.config.ts`（必要なら）

**Interfaces:**
- Consumes: Task 1-7 の全部

**デバッグルートがやること**:
1. npub ではなく **hex pubkey** の入力欄を置く（NIP-19 の TLV デコードは後続 #6 なので、hex を直接受ける）。既定値はシードの閲覧者 pubkey。
2. `warmUpRouting` を走らせ、結果（フォロー数 / ルーティングできた数 / できなかった数）を表示。
3. ルーティング表の中身（著者 → write relay）を一覧表示。
4. フォロー中全員の `kind:1` を `createSection` で表示（`relays` は指定しない = Outbox ルーティング）。
5. 既存の NIP-11 セクションはそのまま残す。

- [ ] **Step 1: デバッグルートを書き換える**

`src/routes/debug/v1-section.tsx`:

```tsx
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { warmUpRouting } from "../../core/read/bootstrap";
import { EventStore } from "../../core/read/event-store";
import { RoutingTable } from "../../core/read/routing-table";
import type { NostrSource } from "../../core/read/source";
import { SubscriptionManager } from "../../core/read/subscription-manager";
import { RelayInfoRegistry } from "../../core/relay/relay-info";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { connectRelay } from "../../core/relay/websocket-relay-connection";
import { createSection } from "../../core/solid/create-section";

const RELAY_ONE: RelayUrl = "ws://127.0.0.1:8080/";
const RELAY_TWO: RelayUrl = "ws://127.0.0.1:8081/";
/** e2e/fixtures/seed-outbox.ts の outboxViewerPubkey と一致させること */
const DEFAULT_VIEWER =
  new URLSearchParams(window.location.search).get("pubkey") ?? "";

const V1SectionDebug = () => {
  const [viewer, setViewer] = createSignal(DEFAULT_VIEWER);
  const store = new EventStore();
  const routing = new RoutingTable(store);
  const registry = new RelayInfoRegistry();
  const manager = new SubscriptionManager({
    store,
    routing,
    connect: connectRelay,
    // ローカル検証ではインターネット上の既定リレーへ出ない
    fallbackRelays: [RELAY_ONE],
  });

  const [relayInfo] = createResource(RELAY_ONE, (url) => registry.get(url));

  const [warmUp] = createResource(viewer, async (pubkey) => {
    if (!/^[0-9a-f]{64}$/.test(pubkey)) return undefined;
    return warmUpRouting({
      pubkey,
      store,
      connect: connectRelay,
      indexers: [RELAY_ONE],
    });
  });

  const source = createMemo<NostrSource>(() => {
    const followees = warmUp()?.followees ?? [];
    return {
      type: "nostr",
      // ルーティング表に任せる。relays は指定しない (Outbox)
      filters: followees.length > 0 ? [{ kinds: [1], authors: followees }] : [],
    };
  });

  const section = createSection({ source, store, manager });

  const routes = createMemo(() =>
    (warmUp()?.followees ?? []).map((pubkey) => ({
      pubkey,
      relays: routing.writeRelaysFor(pubkey),
    })),
  );

  return (
    <div style={{ padding: "16px", "font-family": "monospace" }}>
      <h1>/debug/v1-section</h1>

      <section>
        <h2>viewer</h2>
        <input
          data-testid="viewer-input"
          style={{ width: "42rem" }}
          value={viewer()}
          onInput={(e) => setViewer(e.currentTarget.value.trim())}
          placeholder="hex pubkey (64 chars)"
        />
        <p data-testid="warmup">
          followees: {warmUp()?.followees.length ?? 0} / routed:{" "}
          {warmUp()?.routed ?? 0} / unroutable: {warmUp()?.unroutable ?? 0}
        </p>
      </section>

      <section>
        <h2>routing table</h2>
        <ul data-testid="routes">
          <For each={routes()}>
            {(route) => (
              <li data-testid="route">
                {route.pubkey.slice(0, 8)} → {route.relays.join(",") || "(none)"}
              </li>
            )}
          </For>
        </ul>
      </section>

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
            </ul>
          )}
        </Show>
      </section>

      <section>
        <h2>nostr section (routed)</h2>
        <p data-testid="phase">phase: {section.status().phase}</p>
        <p data-testid="unreachable">
          unreachableRelays: {section.status().incomplete?.unreachableRelays ?? 0}
        </p>
        <p data-testid="unroutable">
          unroutableAuthors: {section.status().incomplete?.unroutableAuthors ?? 0}
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

- [ ] **Step 2: 開発サーバで目視確認**

```bash
docker compose up -d nostr-rs-relay nostr-rs-relay-2 postgres
pnpm dev:relay:reset && pnpm e2e:seed && pnpm e2e:seed:outbox
pnpm dev
```

`pnpm e2e:seed:outbox` の出力には pubkey が出ないので、次で取得する
（`seed-outbox.ts` はトップレベル `await` を含むため、`tsx -e "import ..."`
は esbuild が cjs 出力を試みて `Top-level await is currently not supported
with the "cjs" output format` で失敗する。動的 `import()` で回避する）:

```bash
pnpm exec tsx -e "import('./e2e/fixtures/seed-outbox.ts').then(m => console.log(m.outboxViewerPubkey))"
```

`http://localhost:5173/debug/v1-section?pubkey=<出力された pubkey>` を開く。

Expected: `followees: 2 / routed: 2 / unroutable: 0`、routing table に 2 行（片方が `ws://127.0.0.1:8080/`、もう片方が `ws://127.0.0.1:8081/`）、items に **著者 A と B の投稿が両方**出る。

- [ ] **Step 3: e2e を書き換える**

`e2e/v1-section.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  outboxAuthorAPubkey,
  outboxAuthorBPubkey,
  outboxNoteAText,
  outboxNoteBText,
  outboxViewerPubkey,
  relayTwoUrl,
} from "./fixtures/seed-outbox";

const debugUrl = `/debug/v1-section?pubkey=${outboxViewerPubkey}`;

test("warms up the routing table from the bootstrap relay", async ({ page }) => {
  await page.goto(debugUrl);

  await expect(page.getByTestId("warmup")).toHaveText(
    "followees: 2 / routed: 2 / unroutable: 0",
    { timeout: 15_000 },
  );
});

test("routes each author to the relay their kind:10002 advertises", async ({
  page,
}) => {
  await page.goto(debugUrl);
  await expect(page.getByTestId("route")).toHaveCount(2, { timeout: 15_000 });

  const routes = await page.getByTestId("route").allTextContents();
  const forA = routes.find((r) => r.startsWith(outboxAuthorAPubkey.slice(0, 8)));
  const forB = routes.find((r) => r.startsWith(outboxAuthorBPubkey.slice(0, 8)));

  expect(forA).toContain("ws://127.0.0.1:8080/");
  expect(forB).toContain(relayTwoUrl.endsWith("/") ? relayTwoUrl : `${relayTwoUrl}/`);
});

test("shows notes from both relays, which only routing can achieve", async ({
  page,
}) => {
  await page.goto(debugUrl);

  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 15_000,
  });
  // 著者 B の投稿はリレー2 にしかない。ルーティングが効いていなければ出ない
  await expect(page.getByTestId("items")).toContainText(outboxNoteAText);
  await expect(page.getByTestId("items")).toContainText(outboxNoteBText);
  await expect(page.getByTestId("unroutable")).toHaveText("unroutableAuthors: 0");
});

test("shows the NIP-11 document of the local relay", async ({ page }) => {
  await page.goto(debugUrl);

  await expect(page.getByTestId("relay-nips")).toHaveText(
    /supported_nips: (\d+,)*1(,\d+)*$/,
    { timeout: 15_000 },
  );
});
```

3 番目のテストが**この計画全体の証明**である。著者 B の投稿はリレー2 にしか存在せず、ルーティングが効いていなければ画面に出ない。

- [ ] **Step 4: e2e を実行**

```bash
pnpm dev:relay:reset && pnpm e2e:seed && pnpm e2e:seed:outbox
pnpm e2e e2e/v1-section.spec.ts
```

Expected: PASS（4 件）

- [ ] **Step 5: Lint と型チェック、コミット**

```bash
pnpm fix && pnpm typecheck && pnpm check
git add src/routes/debug/v1-section.tsx e2e/v1-section.spec.ts
git commit -m "feat(read): verify Outbox routing against two local relays"
```

---

## この計画の完了条件

- `pnpm exec vitest run` が全て通る
- `pnpm e2e e2e/v1-section.spec.ts` が **2 本のローカルリレー**に対して通る
- **著者 B の投稿（リレー2 にしか無い）が画面に出る** — これがルーティングの証明
- `SectionReader` に `openRelay` / `releaseRelay` が残っていない
- 同じリレー URL に対する接続が全セクションで 1 本に共有される
- `pnpm check`（`check:read-layer` を含む）が通る

## この計画に含まれないもの

購読のマージ、30 接続上限、`max_subscriptions` の尊重、再接続・バックオフ、ページネーション、レンダラの `needs` 解決、IndexedDB 永続化、署名器、NIP-19 の TLV デコード。すべて後続の計画（[read-layer-single-relay.md](./2026-07-31-read-layer-single-relay.md) の末尾一覧）。
