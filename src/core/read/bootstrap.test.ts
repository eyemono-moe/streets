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
 * Builds a ConnectionPool backed by FakeRelayConnection, recording every
 * connection it creates in `connections` keyed by url.
 *
 * Every test below expects `connections.size` to grow by at most one entry
 * per indexer url for the whole `warmUpRouting()` call: fix round 1 made
 * `warmUpRouting` hold a long-lived "anchor" claim on the connection for its
 * entire lifetime (see `bootstrap.ts`), specifically so that phase ①'s
 * subscription settling and closing does not drop the pooled entry count for
 * that url to zero (which would tear the connection down and force phase ②
 * to reconnect). Task 3 (2026-08-05) moved that claim from a `subscribe()`
 * call to `pool.hold()`, which sends no REQ at all -- so, unlike before, the
 * anchor never appears in `FakeRelayConnection.subscriptions`. Every
 * FakeRelayConnection in this file carries phase ①'s own subscription at
 * index 0, and phase ②'s (when there is one) at index 1.
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
    // フェーズ① の購読 (index 0)。アンカーは hold() 経由 (Task 3) なので
    // REQ を出さず、subscriptions には一切現れない。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    expect(indexer()?.subscriptions[0].filters).toEqual([
      { kinds: [3], authors: [viewer.pubkey], limit: 1 },
    ]);
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    // 第 2 段: 全員分の kind:10002 を 1 クエリで。アンカーの hold がまだ
    // 生きているので、フェーズ① が settle した後もこの接続は再接続されずに
    // 残っている — フェーズ② の購読はそのまま同じ接続の index 1 に乗る。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    const second = indexer()?.subscriptions[1].filters[0];
    expect(second?.kinds).toEqual([10002]);
    // 捕まえる変異: authors に viewer (自分) を足し忘れる。自分は followees
    // (alice, bob) には入っていない — にもかかわらず自分の write リレーも
    // 同じクエリで引けなければ publish 先が決まらない。
    expect(new Set(second?.authors)).toEqual(
      new Set([alice.pubkey, bob.pubkey, viewer.pubkey]),
    );

    indexer()?.emitEvent(1, alice);
    indexer()?.emitEose(1);

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

  // 縦断スライスの書き込み経路向けの前提: 自分は followees に入っている
  // とは限らない (自分自身を p タグでフォローするのは稀)。にもかかわらず
  // 自分の write リレーが引けないと、publisher.ts が publish 先を決められ
  // ない。ここでは filters の形
  // だけでなく、実際に RoutingTable 経由で自分の write リレーが引けること
  // まで確認する — フィルタの主張と実際の効果を両方とも押さえる。
  it("自分が誰もフォローしていなくても、自分の kind:10002 は引ける", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(relays);

    // フォローは alice だけ、自分自身はフォローしていない。
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
    // 自分は followees (alice だけ) には入っていないのに、自分の write
    // リレーが引ける。
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
    // kind:3 が無いので followees は空のまま —— 旧実装はここで早期 return
    // してフェーズ②ごと飛ばしていた。フェーズ①がすぐ settle しても、
    // フェーズ②の購読 (authors:[viewer]) が index 1 に必ず立つはず。
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
    // ブートストラップが送るのは {kinds:[3], authors:[pubkey], limit:1} と
    // {kinds:[10002], authors: [...followees, pubkey]}。kind:1 はどちらにも
    // 一致しない。
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
    // フェーズ① (0)。アンカーは hold() 経由なので subscriptions に現れない。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEvent(0, intruder);
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    // フェーズ② (1)
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
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    // Phase ① settled and its own subscription is closed, but the
    // connection itself must survive -- the anchor's hold() is still held
    // (hold() sends no REQ, so it never shows up as a `subscriptions`
    // entry; the connection's own `closed` flag is the only place this
    // survival is observable, Task 3).
    expect(indexer()?.subscriptions[0].closed).toBe(true);
    expect(indexer()?.closed).toBe(false);

    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEose(1);

    await pending;

    // Exactly one FakeRelayConnection was ever created for this url -- no
    // reconnect happened between phase ① and phase ②.
    expect(relays.size).toBe(1);
    // Only now, at the very end of warmUpRouting, does the anchor's hold
    // release and the connection go down with it.
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

    // followees が空でも、自分の kind:10002 を引くフェーズ②は必ず走る
    // (index 1)。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEose(1);

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
    for (const relay of relays.values()) relay.emitEose(0);
    // フェーズ②(自分の kind:10002) も両インデクサで必ず立つ。
    for (const relay of relays.values()) {
      await vi.waitFor(() => expect(relay.subscriptions).toHaveLength(2));
    }
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

    // "one" reports EOSE and then CLOSED for the same subscription — a
    // relay quirk that must not count as two settlements.
    relays.get("wss://one/")?.emitEose(0);
    relays.get("wss://one/")?.emitClosed(0, "extra close after eose");

    // Give pending microtasks a chance to run. Warm-up must still be
    // waiting on "two" — it must not have resolved early.
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

    // handlers[0] is phase ①'s -- hold() (the anchor's mechanism, Task 3)
    // sends no REQ, so it never calls subscribe() and never appears here.
    await vi.waitFor(() => expect(one.handlers).toHaveLength(1));
    await vi.waitFor(() => expect(two.handlers).toHaveLength(1));

    // Fire EOSE then CLOSED for "one" through a connection whose close()
    // does NOT suppress further emits. If collect() relied on that
    // suppression instead of its own per-connection settle guard, this
    // would decrement pending twice and resolve before "two" ever answers.
    one.fireEose(0);
    one.fireClosed(0, "extra close after eose");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    two.fireEose(0);

    // フェーズ②(自分の kind:10002) が両方に立つのを待って片付ける。
    // handlers[1] がフェーズ②の分。
    await vi.waitFor(() => expect(one.handlers).toHaveLength(2));
    await vi.waitFor(() => expect(two.handlers).toHaveLength(2));
    one.fireEose(1);
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
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(1),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(1),
    );

    relays.get("wss://one/")?.emitEose(0);

    // "one"'s phase ① subscription (index 0) settled; it must be closed
    // right away — not batched until "two" (which has not answered yet)
    // also settles, and not deferred to warmUpRouting's outer `finally`.
    expect(relays.get("wss://one/")?.subscriptions[0].closed).toBe(true);
    expect(relays.get("wss://two/")?.subscriptions[0].closed).toBe(false);
    // Closing the phase ① subscription does not tear the connection down:
    // the anchor's hold() (invisible in `subscriptions` -- hold() sends no
    // REQ, Task 3) is a separate, still-live claim on the same connection,
    // kept alive precisely so a later phase can reuse this connection
    // instead of reconnecting (fix round 1, Important 1). The connection's
    // own `closed` flag is the only place this survival is observable now.
    expect(relays.get("wss://one/")?.closed).toBe(false);

    relays.get("wss://two/")?.emitEose(0);

    // フェーズ②(自分の kind:10002) はフォローが 0 人でも必ず走る —— それを
    // 片付けないと warmUpRouting は終わらない。
    await vi.waitFor(() =>
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(2),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(2),
    );
    relays.get("wss://one/")?.emitEose(1);
    relays.get("wss://two/")?.emitEose(1);
    await pending;

    // 両インデクサのフェーズ② も片付いた後 (warmUpRouting の外側の
    // `finally`) 、ようやくアンカーの hold が release され、接続も落ちる。
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

      // フェーズ①がタイムアウトしただけ —— フェーズ②(自分の kind:10002、
      // followees が空でも必ず走る) がまだ自分の 25ms タイムアウトを
      // 待っている。WarmUpOptions のコメント通り、2 フェーズ合計で最悪
      // timeoutMs の 2 倍かかる。
      expect(resolved).toBe(false);

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

    const indexer = () => connections.get("wss://indexer/");
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEose(0);

    // フェーズ②(自分の kind:10002) も片付けないと終わらない。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEose(1);

    await promise;
    expect(pool.size).toBe(0);
  });

  // ---------------------------------------------------------------------
  // Task 3 (2026-08-05): the anchor used to be a real subscription with a
  // never-matching filter (`{ ids: [NEVER_MATCHING_ID] }`), and two tests
  // here ("counts events pushed at the anchor subscription toward
  // unrequested", "does not carry the anchor count across warmUpRouting()
  // calls") existed only to pin down that subscription's own accounting
  // (`anchorUnrequested`). Both are deleted outright, not adapted: hold()
  // never calls `connection.subscribe()`, so there is no subId for an
  // indexer to push events at, and `anchorUnrequested` no longer exists as
  // a concept. In its place: the anchor must never reach the wire at all.
  // ---------------------------------------------------------------------
  // 変異: hold() を subscribe() に戻すと落ちる。インデクサへ出る REQ は
  // フェーズ①とフェーズ②の 2 本だけであり、接続を握るためだけの 3 本目が
  // あってはならない (一部のリレーはそれを blocked で CLOSE する)。
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
    // フェーズ① (index 0)。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    indexer()?.emitEose(0);

    // フェーズ② (index 1)。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    indexer()?.emitEose(1);

    await pending;

    // warmUpRouting が完了した後も、このインデクサへ張られた購読は
    // フェーズ①とフェーズ②の 2 本きり — 接続を握るためだけの 3 本目
    // (かつてのアンカー) は存在しない。
    expect(indexer()?.subscriptions).toHaveLength(2);
  });
});
