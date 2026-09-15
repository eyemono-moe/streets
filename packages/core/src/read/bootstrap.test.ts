import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { warmUpRouting } from "./bootstrap";
import { ConnectionPool } from "./connection-pool";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";
import { RoutingTable } from "./routing-table";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Unlike FakeRelayConnection, `close()` here doesn't suppress further
 * onEose/onClosed -- proving `collect()`'s own settle guard prevents double-counting.
 */
class UnguardedConnection implements RelayConnection {
  readonly handlers: RelaySubscriptionHandlers[] = [];
  closed = false;
  readonly #closeListeners = new Set<() => void>();

  constructor(readonly url: RelayUrl) {}

  subscribe(
    _filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription {
    this.handlers.push(handlers);
    return { close: () => {} };
  }

  async publish(): Promise<void> {}

  close(): void {
    this.closed = true;
    for (const listener of this.#closeListeners) listener();
  }

  onOpen(): () => void {
    return () => {};
  }

  onClose(listener: () => void): () => void {
    if (this.closed) {
      listener();
      return () => {};
    }
    this.#closeListeners.add(listener);
    return () => {
      this.#closeListeners.delete(listener);
    };
  }

  fireEose(index: number): void {
    this.handlers[index]?.onEose();
  }

  fireClosed(index: number, reason: string): void {
    this.handlers[index]?.onClosed(reason);
  }
}

const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const sign = (
  seed: number,
  fields: Omit<NostrEvent, "id" | "pubkey" | "sig">,
) => {
  const sk = keyFor(seed);
  const unsigned = { ...fields, pubkey: bytesToHex(schnorr.getPublicKey(sk)) };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const base = { created_at: 1_700_000_000, tags: [], content: "" };

/**
 * Builds a ConnectionPool backed by FakeRelayConnection, recording each
 * connection in `connections` by url. `warmUpRouting`'s anchor (`pool.hold()`,
 * sends no REQ) keeps the connection open across phase ①'s settle/close, so at
 * most one connection exists per indexer url. Subscriptions index 0 is phase
 * ①, index 1 is phase ② (if any).
 */
const poolWithFakes = (
  connections: Map<RelayUrl, FakeRelayConnection>,
  options?: { maxConnections?: number; failFor?: Set<RelayUrl> },
) =>
  new ConnectionPool({
    connect: (url) => {
      if (options?.failFor?.has(url)) {
        throw new Error("connection refused");
      }
      const relay = new FakeRelayConnection(url);
      connections.set(url, relay);
      return relay;
    },
    maxConnections: options?.maxConnections,
  });

describe("warmUpRouting", () => {
  it("fetches the follow list then every followee's relay list in one query", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(relays);

    const alice = sign(1, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://alice/", "write"]],
    });
    const bob = sign(2, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://bob/", "write"]],
    });
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
      pool,
      indexers: ["wss://indexer/"],
    });

    const indexer = () => relays.get("wss://indexer/");
    // フェーズ①の購読 (index 0)。hold() 経由のアンカーは REQ を出さず subscriptions に現れない。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    expect(indexer()?.subscriptions[0].filters).toEqual([
      { kinds: [3], authors: [viewer.pubkey], limit: 1 },
    ]);
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    // 第 2 段: kind:10002 を 1 クエリで。アンカーの hold が生きているため接続は再接続されず index 1 に乗る。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    const second = indexer()?.subscriptions[1].filters[0];
    expect(second?.kinds).toEqual([10002]);
    // 捕まえる変異: authors に viewer を足し忘れる (自分の write リレーが引けないと publish 先が決まらない)。
    expect(new Set(second?.authors)).toEqual(
      new Set([alice.pubkey, bob.pubkey, viewer.pubkey]),
    );

    indexer()?.emitEvent(1, alice);
    indexer()?.emitEose(1);

    const result = await pending;
    expect(result.followees).toHaveLength(2);
    expect(result.routed).toBe(1);
    expect(result.unroutable).toBe(1);

    // warmUpRouting 全体でこのインデクサへの接続は 1 本のみ (フェーズ間で繋ぎ直さない証拠)。
    expect(relays.size).toBe(1);

    const table = new RoutingTable(store);
    expect(table.writeRelaysFor(alice.pubkey)).toEqual(["wss://alice/"]);
    expect(table.writeRelaysFor(bob.pubkey)).toEqual([]);
  });

  // 相② はポリシー (kind:10002 の staleMs = 7 日) を通す。
  it("新鮮な kind:10002 を持つ著者は相②の authors に入らない", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
    const pool = poolWithFakes(relays);

    const alice = sign(1, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://alice/", "write"]],
    });
    const bob = sign(2, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://bob/", "write"]],
    });
    const viewer = sign(3, {
      ...base,
      kind: 3,
      tags: [
        ["p", alice.pubkey],
        ["p", bob.pubkey],
      ],
    });

    // isStale は fetchedAt === 0 を無条件 stale とみなすため、時計を進めてから put する。
    clock.advance(1);
    store.put(alice, "wss://alice/");

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      pool,
      indexers: ["wss://indexer/"],
      scheduler: clock,
    });

    const indexer = () => relays.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    const second = indexer()?.subscriptions[1].filters[0];
    // 捕まえる変異: 鮮度を見ずに全員取る (alice も authors に入ってしまう)。
    expect(new Set(second?.authors)).toEqual(
      new Set([bob.pubkey, viewer.pubkey]),
    );

    indexer()?.emitEvent(1, bob);
    indexer()?.emitEose(1);

    await pending;
  });

  it("フォロイー全員 (自分を含む) の kind:10002 が新鮮なら、相②は REQ を投げない", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
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
    const viewerRelayList = sign(3, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://viewer-write/", "write"]],
    });

    clock.advance(1);
    store.put(alice, "wss://alice/");
    store.put(viewerRelayList, "wss://viewer-write/");

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      pool,
      indexers: ["wss://indexer/"],
      scheduler: clock,
    });

    const indexer = () => relays.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    const result = await pending;

    // 捕まえる変異: 空の authors で collect() を呼ぶ (全員新鮮なので相②の購読は 1 本も立たないはず)。
    expect(indexer()?.subscriptions).toHaveLength(1);
    expect(result.phase2Ms).toBe(0);
    expect(result.followees).toEqual([alice.pubkey]);
    expect(result.routed).toBe(1);
  });

  it("古い kind:10002 を持つ著者だけが相②の authors に入る", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
    const pool = poolWithFakes(relays);

    const alice = sign(1, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://alice/", "write"]],
    });
    const staleBob = sign(2, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://bob/", "write"]],
    });
    const viewer = sign(3, {
      ...base,
      kind: 3,
      tags: [
        ["p", alice.pubkey],
        ["p", staleBob.pubkey],
      ],
    });
    const viewerRelayList = sign(3, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://viewer-write/", "write"]],
    });

    clock.advance(1);
    store.put(staleBob, "wss://bob/");
    // bob を staleMs (7 日) の外へ、alice と自分は新鮮なままにする。
    clock.advance(SEVEN_DAYS_MS + 1);
    store.put(alice, "wss://alice/");
    store.put(viewerRelayList, "wss://viewer-write/");

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      pool,
      indexers: ["wss://indexer/"],
      scheduler: clock,
    });

    const indexer = () => relays.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    const second = indexer()?.subscriptions[1].filters[0];
    // 捕まえる変異: 鮮度に関わらず誰も取らない (authors が空になる)。
    expect(new Set(second?.authors)).toEqual(new Set([staleBob.pubkey]));

    indexer()?.emitEvent(1, staleBob);
    indexer()?.emitEose(1);

    await pending;
  });

  // 自分は followees に入るとは限らないが (自己フォローは稀)、write リレーが
  // 引けないと publish 先が決まらない。filters の形だけでなく RoutingTable 経由で実際に引けることも確認する。
  it("自分が誰もフォローしていなくても、自分の kind:10002 は引ける", async () => {
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
    // 自分自身の write リレー宣言 (同じ seed=3 なので viewer と同じ pubkey)。
    const viewerRelayList = sign(3, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://viewer-write/", "write"]],
    });

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      pool,
      indexers: ["wss://indexer/"],
    });

    const indexer = () => relays.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    const relayListFilter = indexer()?.subscriptions[1].filters[0];
    // 捕まえる変異: authors に viewer を足し忘れる。
    expect(relayListFilter?.authors).toContain(viewer.pubkey);

    indexer()?.emitEvent(1, alice);
    indexer()?.emitEvent(1, viewerRelayList);
    indexer()?.emitEose(1);

    await pending;

    const table = new RoutingTable(store);
    // 自分は followees (alice だけ) には入っていないのに、自分の write リレーが引ける。
    expect(table.writeRelaysFor(viewer.pubkey)).toEqual([
      "wss://viewer-write/",
    ]);
  });

  it("誰もフォローしていなくても (followees が空でも) 自分の kind:10002 は引ける", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(relays);

    const viewer = sign(3, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://viewer-write/", "write"]],
    });

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      pool,
      indexers: ["wss://indexer/"],
    });

    const indexer = () => relays.get("wss://indexer/");
    // kind:3 が無く followees は空のままでも、フェーズ②の購読は index 1 に必ず立つはず。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEose(0);

    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    expect(indexer()?.subscriptions[1].filters).toEqual([
      { kinds: [10002], authors: [viewer.pubkey] },
    ]);
    indexer()?.emitEvent(1, viewer);
    indexer()?.emitEose(1);

    const result = await pending;
    expect(result.followees).toEqual([]);

    const table = new RoutingTable(store);
    expect(table.writeRelaysFor(viewer.pubkey)).toEqual([
      "wss://viewer-write/",
    ]);
  });

  it("インデクサが要求していない kind を押し込んでもストアに入らない", async () => {
    // ブートストラップが送る2フィルタに kind:1 は一致しない。同時に「limit は
    // 照合条件でない」ことも主張 —— フェーズ①の limit:1 を通らないと followees が空になり後段が落ちる。
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
    // フェーズ① (0)。アンカーは hold() 経由なので subscriptions に現れない。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEvent(0, intruder);
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEvent(1, intruder);
    indexer()?.emitEvent(1, alice);
    indexer()?.emitEose(1);

    const result = await pending;

    expect(store.get(intruder.id)).toBeUndefined();
    // 要求したものは両フェーズとも通っている
    expect(result.followees).toEqual([alice.pubkey]);
    expect(result.routed).toBe(1);
    // 両フェーズで 1 件ずつ捨てた
    expect(result.unrequested).toBe(2);
  });

  // The anchor exists to prevent a reconnect between phase ① and ②. Kept small
  // and isolated from the follow-list/routing logic above so this behaviour can be pinned down on its own.
  it("keeps each indexer's connection open across both warm-up phases instead of reconnecting", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(relays);

    const followee = "a".repeat(64);
    const viewer = sign(9, {
      ...base,
      kind: 3,
      tags: [["p", followee]],
    });

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      pool,
      indexers: ["wss://indexer/"],
    });

    const indexer = () => relays.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    // Phase ① settled and its subscription closed, but the connection itself
    // must survive -- the anchor's hold() is still held (sends no REQ, so it
    // never shows up in `subscriptions`; `closed` is the only place this
    // survival is observable).
    expect(indexer()?.subscriptions[0].closed).toBe(true);
    expect(indexer()?.closed).toBe(false);

    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEose(1);

    await pending;

    // Exactly one FakeRelayConnection was ever created for this url -- no reconnect between phase ① and ②.
    expect(relays.size).toBe(1);
    // Only now, at the very end of warmUpRouting, does the anchor's hold release and the connection go down.
    expect(indexer()?.closed).toBe(true);
  });

  it("resolves with an empty follow list when the viewer has no kind:3", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(relays);

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store,
      pool,
      indexers: ["wss://indexer/"],
    });

    const indexer = () => relays.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEose(0);

    // followees が空でも、自分の kind:10002 を引くフェーズ②は必ず走る (index 1)。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEose(1);

    const result = await pending;
    expect(result).toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
      unrequested: 0,
      phase1Ms: expect.any(Number),
      phase2Ms: expect.any(Number),
      phase1Relays: expect.any(Array),
      phase2Relays: expect.any(Array),
    });
    // 捕まえる変異: フィールドを足すが値を入れない (undefined だと 0 以上の比較が常に false)。
    expect(result.phase1Ms).toBeGreaterThanOrEqual(0);
    expect(result.phase2Ms).toBeGreaterThanOrEqual(0);
  });

  it("片付いた URL ごとに経過 ms と片付き方を報告する", async () => {
    // 捕まえる変異: onRelaySettled を呼ばない/reason を固定値にする。相の所要
    // 時間は最遅の 1 本で決まるため、合計値だけではどのリレーが原因か分からない。
    vi.useFakeTimers();
    try {
      const relays = new Map<RelayUrl, FakeRelayConnection>();
      const pool = poolWithFakes(relays, {
        failFor: new Set(["wss://refused/"]),
      });

      const pending = warmUpRouting({
        pubkey: "f".repeat(64),
        store: new EventStore(),
        pool,
        indexers: ["wss://fast/", "wss://silent/", "wss://refused/"],
        timeoutMs: 25,
      });

      // vi.waitFor は偽タイマーを進めタイムアウトを誘発するため、マイクロタスクだけ流して待つ。
      await vi.advanceTimersByTimeAsync(0);
      relays.get("wss://fast/")?.emitEose(0);
      // 相①のタイムアウト → 相②のタイムアウト。
      await vi.advanceTimersByTimeAsync(25);
      await vi.advanceTimersByTimeAsync(25);
      const result = await pending;

      const byUrl = new Map(result.phase1Relays.map((r) => [r.url, r]));
      expect(byUrl.get("wss://fast/")?.reason).toBe("eose");
      expect(byUrl.get("wss://silent/")?.reason).toBe("timeout");
      // 繋がらなかった相手と黙っている相手を取り違えると、次の対処 (URL を疑う/待ち方を変える) を誤る。
      expect(byUrl.get("wss://refused/")?.reason).toBe("closed");
      // 応答しなかった側のほうが必ず遅い —— 逆なら計測が壊れている。
      expect(byUrl.get("wss://silent/")?.ms ?? 0).toBeGreaterThanOrEqual(
        byUrl.get("wss://fast/")?.ms ?? 0,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("フェーズ①の間だけ時間が進んだとき、phase1Ms にだけ乗る", async () => {
    vi.useFakeTimers();
    try {
      const relays = new Map<RelayUrl, FakeRelayConnection>();
      const store = new EventStore();
      const pool = poolWithFakes(relays);

      const pending = warmUpRouting({
        pubkey: "f".repeat(64),
        store,
        pool,
        indexers: ["wss://indexer/"],
      });

      // hold()/subscribe() は同期なので購読は既に立っている (フェイクタイマー下では vi.waitFor が使えず直接見る)。
      const indexer = () => relays.get("wss://indexer/");
      expect(indexer()?.subscriptions).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(500);
      indexer()?.emitEose(0);

      // フェーズ②の購読が立つまでマイクロタスクを吐かせる (フェイクタイマー下では時間を進めず待つ)。
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(indexer()?.subscriptions).toHaveLength(2);

      // フェーズ②は時間を進めずに即 settle させる。
      indexer()?.emitEose(1);

      const result = await pending;
      expect(result.phase1Ms).toBeGreaterThanOrEqual(500);
      // 捕まえる変異: 2 相を 1 つのタイマーで測る (フェーズ①の 500ms がここにも乗り 0 のままでは済まなくなる)。
      expect(result.phase2Ms).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes every connection it opened", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(relays);
    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://one/", "wss://two/"],
    });

    await vi.waitFor(() => expect(relays.size).toBe(2));
    for (const relay of relays.values()) relay.emitEose(0);
    // フェーズ②(自分の kind:10002) も両インデクサで必ず立つ。
    for (const relay of relays.values()) {
      await vi.waitFor(() => expect(relay.subscriptions).toHaveLength(2));
    }
    for (const relay of relays.values()) relay.emitEose(1);
    await pending;

    for (const relay of relays.values()) expect(relay.closed).toBe(true);
    // ウォームアップが持っていた分の予算はもう誰も握っていない。
    expect(pool.size).toBe(0);
  });

  it("keeps warming up when one indexer fails to connect", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(relays, { failFor: new Set(["wss://down/"]) });

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://down/", "wss://up/"],
    });

    const up = () => relays.get("wss://up/");
    await vi.waitFor(() => expect(up()?.subscriptions).toHaveLength(1));
    up()?.emitEose(0);

    // フェーズ②(自分の kind:10002) も生きている方のインデクサでは立つ。
    await vi.waitFor(() => expect(up()?.subscriptions).toHaveLength(2));
    up()?.emitEose(1);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
      unrequested: 0,
      phase1Ms: expect.any(Number),
      phase2Ms: expect.any(Number),
      phase1Relays: expect.any(Array),
      phase2Relays: expect.any(Array),
    });
    expect(up()?.closed).toBe(true);
  });

  it("resolves gracefully when every indexer fails to connect", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(relays, {
      failFor: new Set(["wss://a/", "wss://b/"]),
    });

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://a/", "wss://b/"],
    });

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
      unrequested: 0,
      phase1Ms: expect.any(Number),
      phase2Ms: expect.any(Number),
      phase1Relays: expect.any(Array),
      phase2Relays: expect.any(Array),
    });
  });

  it("does not settle a connection twice on EOSE-then-CLOSED, and still waits for the other connection", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(relays);

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://one/", "wss://two/"],
    });

    let resolved = false;
    pending.then(() => {
      resolved = true;
    });

    await vi.waitFor(() =>
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(1),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(1),
    );

    // "one" reports EOSE then CLOSED for the same subscription -- a relay quirk that must not count as two settlements.
    relays.get("wss://one/")?.emitEose(0);
    relays.get("wss://one/")?.emitClosed(0, "extra close after eose");

    // Give pending microtasks a chance to run -- warm-up must still be waiting on "two", not resolved early.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    relays.get("wss://two/")?.emitEose(0);

    // フェーズ②(自分の kind:10002) が両インデクサで立つのを待って片付ける。
    await vi.waitFor(() =>
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(2),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(2),
    );
    relays.get("wss://one/")?.emitEose(1);
    relays.get("wss://two/")?.emitEose(1);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
      unrequested: 0,
      phase1Ms: expect.any(Number),
      phase2Ms: expect.any(Number),
      phase1Relays: expect.any(Array),
      phase2Relays: expect.any(Array),
    });
    expect(relays.get("wss://one/")?.closed).toBe(true);
    expect(relays.get("wss://two/")?.closed).toBe(true);
  });

  it("does not double-settle a connection on EOSE-then-CLOSED even when the connection's own close() does not suppress redelivery", async () => {
    const one = new UnguardedConnection("wss://one/");
    const two = new UnguardedConnection("wss://two/");
    const byUrl = new Map<RelayUrl, UnguardedConnection>([
      ["wss://one/", one],
      ["wss://two/", two],
    ]);

    const pool = new ConnectionPool({
      connect: (url) => {
        const connection = byUrl.get(url);
        if (!connection) throw new Error(`unexpected url: ${url}`);
        return connection;
      },
    });

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://one/", "wss://two/"],
    });

    let resolved = false;
    pending.then(() => {
      resolved = true;
    });

    // handlers[0] is phase ①'s -- hold() sends no REQ, so it never calls subscribe() and never appears here.
    await vi.waitFor(() => expect(one.handlers).toHaveLength(1));
    await vi.waitFor(() => expect(two.handlers).toHaveLength(1));

    // Fire EOSE then CLOSED through a connection whose close() does NOT suppress
    // further emits -- if collect() relied on that suppression instead of its own guard, it'd decrement pending twice.
    one.fireEose(0);
    one.fireClosed(0, "extra close after eose");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    two.fireEose(0);

    // フェーズ②が両方に立つのを待って片付ける (handlers[1] がフェーズ②の分)。
    await vi.waitFor(() => expect(one.handlers).toHaveLength(2));
    await vi.waitFor(() => expect(two.handlers).toHaveLength(2));
    one.fireEose(1);
    two.fireEose(1);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
      unrequested: 0,
      phase1Ms: expect.any(Number),
      phase2Ms: expect.any(Number),
      phase1Relays: expect.any(Array),
      phase2Relays: expect.any(Array),
    });
  });

  it("closes a settled connection's subscription immediately, without waiting for other connections to settle", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(relays);
    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://one/", "wss://two/"],
    });

    await vi.waitFor(() =>
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(1),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(1),
    );

    relays.get("wss://one/")?.emitEose(0);

    // "one"'s phase ① subscription settled; it must close right away -- not batched until "two" settles too.
    expect(relays.get("wss://one/")?.subscriptions[0].closed).toBe(true);
    expect(relays.get("wss://two/")?.subscriptions[0].closed).toBe(false);
    // Closing phase ①'s subscription doesn't tear the connection down: the
    // anchor's hold() (invisible, sends no REQ) is a separate still-live claim,
    // kept so a later phase can reuse it -- `closed` is the only place this survives.
    expect(relays.get("wss://one/")?.closed).toBe(false);

    relays.get("wss://two/")?.emitEose(0);

    // フェーズ②はフォローが 0 人でも必ず走り、片付けないと warmUpRouting は終わらない。
    await vi.waitFor(() =>
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(2),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(2),
    );
    relays.get("wss://one/")?.emitEose(1);
    relays.get("wss://two/")?.emitEose(1);
    await pending;

    // 両インデクサのフェーズ②も片付いた後 (外側の finally)、アンカーの hold が release され接続も落ちる。
    expect(relays.get("wss://one/")?.closed).toBe(true);
    expect(relays.get("wss://two/")?.closed).toBe(true);
  });

  it("does not hang past the timeout when an indexer never responds", async () => {
    vi.useFakeTimers();
    try {
      const relays = new Map<RelayUrl, FakeRelayConnection>();
      const pool = poolWithFakes(relays);

      const pending = warmUpRouting({
        pubkey: "f".repeat(64),
        store: new EventStore(),
        pool,
        indexers: ["wss://silent/"],
        timeoutMs: 25,
      });

      let resolved = false;
      pending.then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(25);

      // フェーズ①がタイムアウトしただけ —— フェーズ②はまだ自分の 25ms を待っている。
      // 2 フェーズ合計で最悪 timeoutMs の 2 倍かかる (WarmUpOptions のコメント通り)。
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(25);

      expect(resolved).toBe(true);
      await expect(pending).resolves.toEqual({
        followees: [],
        routed: 0,
        unroutable: 0,
        unrequested: 0,
        // 両フェーズともここでは自前のタイムアウト (25ms) までかかりきる。
        phase1Ms: 25,
        phase2Ms: 25,
        phase1Relays: expect.any(Array),
        phase2Relays: expect.any(Array),
      });
      expect(relays.get("wss://silent/")?.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // Indexers must open even at full budget, or Outbox routing could never
  // bootstrap -- the circularity ConnectionPool's `reserved` escape exists to break.
  it("opens indexers even when the pool is already at its budget", () => {
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections, { maxConnections: 1 });
    pool.subscribe("wss://busy/", [{ kinds: [1] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: () => {},
    });
    expect(pool.size).toBe(1);

    const promise = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://indexer/"],
      // Keep the real 10s default timeout from lingering -- nothing here settles the indexer.
      timeoutMs: 20,
    });

    // ウォームアップが走れないとルーティングが永久に成立しない。
    expect(connections.has("wss://indexer/")).toBe(true);
    void promise;
  });

  // Warm-up's reserved connections, including the long-lived anchor, must not sit in the pool afterwards holding budget.
  it("releases the indexer connections when warm-up finishes", async () => {
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);

    const promise = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://indexer/"],
    });

    const indexer = () => connections.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEose(0);

    // フェーズ②(自分の kind:10002) も片付けないと終わらない。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEose(1);

    await promise;
    expect(pool.size).toBe(0);
  });

  // 変異: hold() を subscribe() に戻すと落ちる。REQ はフェーズ①②の 2 本だけで、
  // 接続を握るためだけの 3 本目があってはならない (一部リレーは blocked で CLOSE する)。
  it("sends no filter to an indexer beyond the two real phases", async () => {
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(connections);
    const viewer = sign(3, { ...base, kind: 3, tags: [] });

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      pool,
      indexers: ["wss://indexer/"],
    });

    const indexer = () => connections.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEose(0);

    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEose(1);

    await pending;

    // 完了後も、このインデクサへの購読はフェーズ①②の 2 本きり — 3 本目は存在しない。
    expect(indexer()?.subscriptions).toHaveLength(2);
  });
});
