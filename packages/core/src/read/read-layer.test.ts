import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { Scheduler } from "./connection-pool";
import type { EventPersistence, PersistedEvent } from "./event-persistence";
import { createFakeClock } from "./fake-clock";
import { createReadLayer } from "./read-layer";

const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

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
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
  };
};

// このスイートはどのテストも実際のソケットを開かない —— `connect` は
// 「呼ばれたら失敗する」だけの二重の役目を持たせている (manager 側に
// 再接続タイマーを 1 本作るのにも使う)。
const neverConnects = () => {
  throw new Error("this suite never opens a real connection");
};

describe("createReadLayer", () => {
  it("ready はストアへの水和が終わってから解決する", async () => {
    // 捕まえる変異: persistence.load() を待たずに ready を解決する。
    // 起動直後の鮮度判定がまだ空の store を見て「キャッシュ無し」と誤判定し、
    // キャッシュ済みのはずのフェッチをやり直してしまう。
    let resolveLoad:
      | ((result: {
          events: PersistedEvent[];
          deletionRequests: NostrEvent[];
        }) => void)
      | undefined;
    const loadPromise = new Promise<{
      events: PersistedEvent[];
      deletionRequests: NostrEvent[];
    }>((resolve) => {
      resolveLoad = resolve;
    });
    const persistence: EventPersistence = {
      load: () => loadPromise,
      save() {},
      saveDeletionRequest() {},
      deleteDeletionRequest() {},
      delete() {},
      dispose() {},
    };

    const readLayer = createReadLayer({ connect: neverConnects, persistence });
    let settled = false;
    void readLayer.ready.then(() => {
      settled = true;
    });

    // `settled` の同期チェックは弱い —— then() は resolve 済みでもマイクロタスク
    // 1 つ遅れるため、load() を待たず即座に解決する変異でも「未解決」に見えて
    // しまう。マクロタスクを 1 回挟み保留中のマイクロタスクを吐き出させないと、
    // この主張は意味を持たない。
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    const entry: PersistedEvent = {
      event: sign("x"),
      seenRelays: [],
      fetchedAt: 1,
    };
    resolveLoad?.({ events: [entry], deletionRequests: [] });
    await readLayer.ready;

    expect(settled).toBe(true);
    // 水和が実際に効いていること (解決したタイミングだけでなく中身も確認)。
    expect(readLayer.store.get(entry.event.id)).toEqual(entry.event);
  });

  it("persistence.load() が reject しても ready は resolve する", async () => {
    // 捕まえる変異: load() の失敗をそのまま伝播させる (try/catch を外す)。
    // IndexedDB はプライベートブラウジングで普通に失敗し、その失敗は
    // キャッシュが無いのと同じであるべきなのに、これだとアプリが一生
    // 起動しなくなる。
    const persistence: EventPersistence = {
      load: () => Promise.reject(new Error("simulated persistence failure")),
      save() {},
      saveDeletionRequest() {},
      deleteDeletionRequest() {},
      delete() {},
      dispose() {},
    };

    const readLayer = createReadLayer({ connect: neverConnects, persistence });

    await expect(readLayer.ready).resolves.toBeUndefined();
    expect(readLayer.store.size).toBe(0);
  });

  it("dispose() は manager・coalescer・persistence の全タイマーを畳む", async () => {
    // 捕まえる変異: dispose() の中で manager/profiles/events/persistence の
    // どれか 1 つの dispose を忘れる。忘れた側が持つタイマーだけが
    // clock.pendingCount に残り続け、実タイマーの下では dispose 済みの
    // 読み取り層をクロージャ越しに掴んだままリークする。
    const clock = createFakeClock();
    let persistenceDisposed = false;
    let persistTimer: ReturnType<Scheduler["setTimeout"]> | null = null;
    const persistence: EventPersistence = {
      async load() {
        return { events: [], deletionRequests: [] };
      },
      save() {
        // 実装 (indexeddb-persistence.ts) の PERSIST_BATCH_MS と同じ
        // 「窓を 1 本立てる」形をここでも模す。
        if (persistTimer === null) {
          persistTimer = clock.setTimeout(() => {
            persistTimer = null;
          }, 1_000);
        }
      },
      saveDeletionRequest() {},
      deleteDeletionRequest() {},
      delete() {},
      dispose() {
        persistenceDisposed = true;
        if (persistTimer !== null) {
          clock.clearTimeout(persistTimer);
          persistTimer = null;
        }
      },
    };

    const readLayer = createReadLayer({
      connect: neverConnects,
      persistence,
      scheduler: clock,
    });
    await readLayer.ready;

    // manager 側: 接続に失敗する URL への hold() が再接続タイマーを積む
    // (connection-pool.ts の #scheduleReconnect)。
    readLayer.manager.pool.hold("wss://unreachable/" as RelayUrl);
    // coalescer 側: store に無い pubkey/id を要求するとバッチタイマーが立つ。
    readLayer.profiles.request("f".repeat(64));
    readLayer.events.request("e".repeat(64));
    // persistence 側: put() 経由で save() が走り、バッチタイマーが立つ
    // (event-store.ts の #persist が新規挿入のたびに転送する)。
    readLayer.store.put(sign("y"), "wss://relay/");

    expect(clock.pendingCount).toBeGreaterThan(0);

    readLayer.dispose();

    expect(clock.pendingCount).toBe(0);
    expect(persistenceDisposed).toBe(true);
  });

  it("kind:10002 の変更を一回の replan にまとめる", async () => {
    // 捕まえる変異: 変更通知ごとに同期的に replan する。ウォームアップで
    // フォロイー全員分が届くと、著者数だけ大域選択をやり直してしまう。
    const clock = createFakeClock();
    const readLayer = createReadLayer({
      connect: neverConnects,
      persistence: {
        async load() {
          return { events: [], deletionRequests: [] };
        },
        save() {},
        saveDeletionRequest() {},
        deleteDeletionRequest() {},
        delete() {},
        dispose() {},
      },
      scheduler: clock,
    });
    await readLayer.ready;
    const replan = vi.spyOn(readLayer.manager, "replan");

    readLayer.store.put(
      sign("first", { kind: 10002, created_at: 100 }),
      "wss://one/",
    );
    readLayer.store.put(
      sign("second", { kind: 10002, created_at: 200 }),
      "wss://one/",
    );
    expect(replan).not.toHaveBeenCalled();

    clock.advance(200);

    expect(replan).toHaveBeenCalledTimes(1);
    readLayer.dispose();
  });

  it("dispose 後は保留中の routing replan を実行しない", async () => {
    // 捕まえる変異: routing replan のタイマーを dispose で解除しない。
    const clock = createFakeClock();
    const readLayer = createReadLayer({
      connect: neverConnects,
      persistence: {
        async load() {
          return { events: [], deletionRequests: [] };
        },
        save() {},
        saveDeletionRequest() {},
        deleteDeletionRequest() {},
        delete() {},
        dispose() {},
      },
      scheduler: clock,
    });
    await readLayer.ready;
    const replan = vi.spyOn(readLayer.manager, "replan");
    readLayer.store.put(sign("relay", { kind: 10002 }), "wss://one/");

    readLayer.dispose();
    clock.advance(200);

    expect(replan).not.toHaveBeenCalled();
  });
});
