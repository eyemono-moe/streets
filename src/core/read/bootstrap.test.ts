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
import { RoutingTable } from "./routing-table";

/**
 * A RelayConnection whose subscription `close()` is a true no-op: unlike
 * FakeRelayConnection, it does not remember "closed" and does not suppress
 * further onEose/onClosed calls once a subscription has been closed. This
 * exists to prove that `collect()`'s own per-connection settle guard (not
 * FakeRelayConnection's `sub.closed` early-return) is what stops a second
 * EOSE/CLOSED for the same connection from double-counting.
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
 * Builds a ConnectionPool backed by FakeRelayConnection, recording every
 * connection it creates in `connections` keyed by url.
 *
 * Every test below expects `connections.size` to grow by at most one entry
 * per indexer url for the whole `warmUpRouting()` call: fix round 1 made
 * `warmUpRouting` hold a long-lived "anchor" `PooledSubscription` per
 * indexer for its entire lifetime (see `bootstrap.ts`), specifically so
 * that phase ①'s subscription settling and closing does not drop the
 * pooled entry count for that url to zero (which would tear the connection
 * down and force phase ② to reconnect). Because of the anchor, every
 * FakeRelayConnection in this file carries one extra subscription at index
 * 0 (the anchor's) before phase ①'s own subscription at index 1, and phase
 * ②'s (when there is one) at index 2.
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
    // アンカー (index 0) + フェーズ① の購読 (index 1)。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    expect(indexer()?.subscriptions[1].filters).toEqual([
      { kinds: [3], authors: [viewer.pubkey], limit: 1 },
    ]);
    indexer()?.emitEvent(1, viewer);
    indexer()?.emitEose(1);

    // 第 2 段: 全員分の kind:10002 を 1 クエリで。アンカーがまだ生きている
    // ので、フェーズ① が settle した後もこの接続は再接続されずに残っている
    // — フェーズ② の購読はそのまま同じ接続の index 2 に乗る。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(3));
    const second = indexer()?.subscriptions[2].filters[0];
    expect(second?.kinds).toEqual([10002]);
    expect(new Set(second?.authors)).toEqual(
      new Set([alice.pubkey, bob.pubkey]),
    );

    indexer()?.emitEvent(2, alice);
    indexer()?.emitEose(2);

    const result = await pending;
    expect(result.followees).toHaveLength(2);
    expect(result.routed).toBe(1);
    expect(result.unroutable).toBe(1);

    // warmUpRouting 全体を通じて、このインデクサへは 1 本の接続しか作られて
    // いない (フェーズ間で繋ぎ直していない証拠)。
    expect(relays.size).toBe(1);

    const table = new RoutingTable(store);
    expect(table.writeRelaysFor(alice.pubkey)).toEqual(["wss://alice/"]);
    expect(table.writeRelaysFor(bob.pubkey)).toEqual([]);
  });

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

  // Fix round 1, Important 1: the anchor exists specifically to prevent a
  // reconnect between phase ① and phase ② for the same indexer. Kept
  // deliberately small and isolated from the follow-list/routing logic
  // above so the reconnect-vs-reuse behaviour can be pinned down on its
  // own.
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
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEvent(1, viewer);
    indexer()?.emitEose(1);

    // Phase ① settled and its own subscription is closed, but the
    // connection itself must survive -- the anchor (index 0) is still
    // open.
    expect(indexer()?.subscriptions[1].closed).toBe(true);
    expect(indexer()?.subscriptions[0].closed).toBe(false);
    expect(indexer()?.closed).toBe(false);

    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(3));
    indexer()?.emitEose(2);

    await pending;

    // Exactly one FakeRelayConnection was ever created for this url -- no
    // reconnect happened between phase ① and phase ②.
    expect(relays.size).toBe(1);
    // Only now, at the very end of warmUpRouting, does the anchor close and
    // the connection go down with it.
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

    await vi.waitFor(() =>
      expect(relays.get("wss://indexer/")?.subscriptions).toHaveLength(2),
    );
    relays.get("wss://indexer/")?.emitEose(1);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
      unrequested: 0,
    });
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
    for (const relay of relays.values()) relay.emitEose(1);
    await pending;

    for (const relay of relays.values()) expect(relay.closed).toBe(true);
    // ウォームアップが持っていた分の予算はもう誰も握っていない (ambiguity 3:
    // release on completion)。
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

    await vi.waitFor(() =>
      expect(relays.get("wss://up/")?.subscriptions).toHaveLength(2),
    );
    relays.get("wss://up/")?.emitEose(1);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
      unrequested: 0,
    });
    expect(relays.get("wss://up/")?.closed).toBe(true);
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
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(2),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(2),
    );

    // "one" reports EOSE and then CLOSED for the same subscription — a
    // relay quirk that must not count as two settlements.
    relays.get("wss://one/")?.emitEose(1);
    relays.get("wss://one/")?.emitClosed(1, "extra close after eose");

    // Give pending microtasks a chance to run. Warm-up must still be
    // waiting on "two" — it must not have resolved early.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    relays.get("wss://two/")?.emitEose(1);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
      unrequested: 0,
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

    // handlers[0] is the anchor's; handlers[1] is phase ①'s real one.
    await vi.waitFor(() => expect(one.handlers).toHaveLength(2));
    await vi.waitFor(() => expect(two.handlers).toHaveLength(2));

    // Fire EOSE then CLOSED for "one" through a connection whose close()
    // does NOT suppress further emits. If collect() relied on that
    // suppression instead of its own per-connection settle guard, this
    // would decrement pending twice and resolve before "two" ever answers.
    one.fireEose(1);
    one.fireClosed(1, "extra close after eose");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    two.fireEose(1);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
      unrequested: 0,
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
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(2),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(2),
    );

    relays.get("wss://one/")?.emitEose(1);

    // "one"'s phase ① subscription (index 1) settled; it must be closed
    // right away — not batched until "two" (which has not answered yet)
    // also settles, and not deferred to warmUpRouting's outer `finally`.
    expect(relays.get("wss://one/")?.subscriptions[1].closed).toBe(true);
    expect(relays.get("wss://two/")?.subscriptions[1].closed).toBe(false);
    // Closing the phase ① subscription does not tear the connection down:
    // the anchor (index 0) is a separate, still-open entry for the same
    // url, kept alive precisely so a later phase can reuse this connection
    // instead of reconnecting (fix round 1, Important 1).
    expect(relays.get("wss://one/")?.subscriptions[0].closed).toBe(false);
    expect(relays.get("wss://one/")?.closed).toBe(false);

    relays.get("wss://two/")?.emitEose(1);
    await pending;

    // Only once warmUpRouting has fully finished (there is no phase ② here
    // — the viewer has no kind:3 — so this is the outer `finally`) do the
    // anchors close and the connections finally go down.
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

      expect(resolved).toBe(true);
      await expect(pending).resolves.toEqual({
        followees: [],
        routed: 0,
        unroutable: 0,
        unrequested: 0,
      });
      expect(relays.get("wss://silent/")?.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // Ambiguity 1 in the task-11 brief: indexers must open even when the
  // global connection budget is already full, otherwise Outbox routing
  // could never bootstrap in the first place — the exact circularity
  // ConnectionPool's `reserved` escape exists to break.
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
      // Keep the real (unfaked) 10s default timeout from lingering past
      // this test's lifetime — nothing in this test settles the indexer.
      timeoutMs: 20,
    });

    // ウォームアップが走れないとルーティングが永久に成立しない。
    expect(connections.has("wss://indexer/")).toBe(true);
    void promise;
  });

  // Ambiguity 3 in the task-11 brief: warm-up's reserved connections must
  // not sit in the pool afterwards holding budget -- including the
  // long-lived anchor added in fix round 1.
  it("releases the indexer connections when warm-up finishes", async () => {
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);

    const promise = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://indexer/"],
    });

    await vi.waitFor(() =>
      expect(connections.get("wss://indexer/")?.subscriptions).toHaveLength(2),
    );
    connections.get("wss://indexer/")?.emitEose(1);

    await promise;
    expect(pool.size).toBe(0);
  });

  // ---------------------------------------------------------------------
  // 最終ブランチレビュー Minor 1: アンカー購読 (index 0) のフィルタは
  // `{ids:[NEVER_MATCHING_ID]}` なので、その subId へ届く EVENT は構造上
  // 必ず要求していないものである。にもかかわらず初版のアンカーは
  // モジュール直下の定数で onEvent が空実装であり、届いたイベントを
  // 黙って捨てて `WarmUpResult.unrequested` に一切載せていなかった。
  // 仕様 5.3 が `unrequested` を置いた理由そのもの (ブートストラップには
  // マネージャが無いので、そこで捨てた分の行き先が他にない) に空いた穴で、
  // インデクサがアンカー subId へ 100 通押し込んでも `unrequested: 0` と
  // 報告されうる状態だった。修正波で塞いだが、その修正には自動テストが
  // 付いていなかった (scoped re-review が使い捨てのテストで確認して削除した)。
  // ここで塞ぎ直す。
  // ---------------------------------------------------------------------
  it("counts events pushed at the anchor subscription toward unrequested", async () => {
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(connections);

    // p タグの無い kind:3 = フォロー 0 人。`followees.length === 0` の
    // 早期 return を通る —— アンカーの件数を載せ忘れやすいのはこちらの経路。
    const viewer = sign(3, { ...base, kind: 3, tags: [] });
    const intruder = sign(9, { ...base, kind: 1, content: "pushed at anchor" });

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      pool,
      indexers: ["wss://indexer/"],
    });

    const indexer = () => connections.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));

    // index 0 がアンカー、index 1 がフェーズ①。
    indexer()?.emitEvent(0, intruder);
    indexer()?.emitEvent(0, intruder);
    indexer()?.emitEvent(1, viewer);
    indexer()?.emitEose(1);

    const result = await pending;

    // アンカーは何も読み取らない —— 数えるだけで store には入れない。
    expect(store.get(intruder.id)).toBeUndefined();
    // 早期 return 経路でもアンカー分が載っている。
    expect(result.followees).toEqual([]);
    expect(result.unrequested).toBe(2);
  });

  it("does not carry the anchor count across warmUpRouting() calls", async () => {
    // `createAnchorHandlers` が呼び出しごとに閉じたカウンタを受け取ることの主張。
    // モジュール直下の定数や共有カウンタへ戻すと、2 回目が 1 回目の件数を
    // 引き継いでしまう。
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(connections);
    const viewer = sign(3, { ...base, kind: 3, tags: [] });
    const intruder = sign(9, { ...base, kind: 1, content: "pushed at anchor" });

    const runWarmUp = async (pushAtAnchor: boolean) => {
      const pending = warmUpRouting({
        pubkey: viewer.pubkey,
        store,
        pool,
        indexers: ["wss://indexer/"],
      });
      const indexer = () => connections.get("wss://indexer/");
      await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
      if (pushAtAnchor) indexer()?.emitEvent(0, intruder);
      indexer()?.emitEose(1);
      return pending;
    };

    expect((await runWarmUp(true)).unrequested).toBe(1);
    expect((await runWarmUp(false)).unrequested).toBe(0);
  });
});
