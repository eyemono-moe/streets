import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { ConnectionPool } from "../read/connection-pool";
import { EventStore } from "../read/event-store";
import { RoutingTable } from "../read/routing-table";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayUrl } from "../relay/relay-connection";
import { createPublisher } from "./publisher";

const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const sign = (
  seed: number,
  fields: Omit<NostrEvent, "id" | "pubkey" | "sig">,
): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = { ...fields, pubkey: bytesToHex(schnorr.getPublicKey(sk)) };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const base = { created_at: 1_700_000_000, tags: [], content: "" };

const relayListEvent = (seed: number, tags: string[][]) =>
  sign(seed, { ...base, kind: 10002, tags });

/**
 * `ConnectionPool` を、URL ごとに挙動を制御できる `FakeRelayConnection` で
 * 組み立てる。`publishFailing` に載った URL は publish() が指定した理由で
 * reject する — 「1 本だけ失敗」「全部失敗」を作るためだけの注入。
 */
const poolWithFakes = (
  connections: Map<RelayUrl, FakeRelayConnection>,
  options?: { publishFailing?: Partial<Record<RelayUrl, string>> },
) =>
  new ConnectionPool({
    connect: (url) => {
      const relay = new FakeRelayConnection(url);
      const reason = options?.publishFailing?.[url];
      if (reason !== undefined) {
        Object.defineProperty(relay, "publish", {
          value: async () => {
            throw new Error(reason);
          },
        });
      }
      connections.set(url, relay);
      return relay;
    },
  });

describe("createPublisher", () => {
  // 捕まえる変異: 1 本目 (declared[0]) だけに送って、残りを無視する。
  it("自分の write リレー全部へ送る", async () => {
    const store = new EventStore();
    const author = relayListEvent(1, [
      ["r", "wss://one/", "write"],
      ["r", "wss://two/", "write"],
      ["r", "wss://three/", "write"],
    ]);
    store.put(author, "wss://indexer/");

    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);
    const publisher = createPublisher({
      pool,
      routing: new RoutingTable(store),
      fallbackRelays: ["wss://fallback/"],
    });

    const note = sign(1, { ...base, kind: 1, content: "hello" });
    const result = await publisher.publish(note);

    expect(new Set(result.accepted)).toEqual(
      new Set(["wss://one/", "wss://two/", "wss://three/"]),
    );
    expect(result.rejected).toEqual([]);
    for (const url of ["wss://one/", "wss://two/", "wss://three/"]) {
      expect(connections.get(url)?.published.map((e) => e.id)).toEqual([
        note.id,
      ]);
    }
    // fallback には送っていない — write リレーが引けている以上、出番はない。
    expect(connections.has("wss://fallback/")).toBe(false);
  });

  // 捕まえる変異: writeRelaysFor が空を返しても、その空配列へそのまま送って
  // 黙って何もしない (fallback へ切り替えない)。
  it("write リレーが無ければ fallback へ送る", async () => {
    const store = new EventStore(); // 誰の kind:10002 も無い
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);
    const publisher = createPublisher({
      pool,
      routing: new RoutingTable(store),
      fallbackRelays: ["wss://fallback-a/", "wss://fallback-b/"],
    });

    const note = sign(9, { ...base, kind: 1, content: "no relay list yet" });
    const result = await publisher.publish(note);

    expect(new Set(result.accepted)).toEqual(
      new Set(["wss://fallback-a/", "wss://fallback-b/"]),
    );
    expect(result.rejected).toEqual([]);
    expect(
      connections.get("wss://fallback-a/")?.published.map((e) => e.id),
    ).toEqual([note.id]);
    expect(
      connections.get("wss://fallback-b/")?.published.map((e) => e.id),
    ).toEqual([note.id]);
  });

  // 捕まえる変異: Promise.all のように 1 本の reject で全体を reject し、
  // 成功した分まで失う。
  it("1 本が失敗しても他は成功として数える", async () => {
    const store = new EventStore();
    const author = relayListEvent(2, [
      ["r", "wss://good/", "write"],
      ["r", "wss://bad/", "write"],
    ]);
    store.put(author, "wss://indexer/");

    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections, {
      publishFailing: { "wss://bad/": "blocked: rate limited" },
    });
    const publisher = createPublisher({
      pool,
      routing: new RoutingTable(store),
      fallbackRelays: [],
    });

    const note = sign(2, { ...base, kind: 1, content: "partial failure" });
    const result = await publisher.publish(note);

    expect(result.accepted).toEqual(["wss://good/"]);
    expect(result.rejected).toEqual([
      { relay: "wss://bad/", reason: "blocked: rate limited" },
    ]);
  });

  // 捕まえる変異: 失敗を握り潰して rejected に載せない (accepted に混ぜる、
  // あるいは丸ごと捨てて呼び出し元に見えなくする) —— ADR-0011 の
  // 「黙って欠落させてはならない」に反する。
  it("全部失敗したら accepted が空で rejected が全部載る", async () => {
    const store = new EventStore();
    const author = relayListEvent(3, [
      ["r", "wss://one/", "write"],
      ["r", "wss://two/", "write"],
    ]);
    store.put(author, "wss://indexer/");

    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections, {
      publishFailing: {
        "wss://one/": "duplicate: already have this event",
        "wss://two/": "blocked: spam",
      },
    });
    const publisher = createPublisher({
      pool,
      routing: new RoutingTable(store),
      fallbackRelays: [],
    });

    const note = sign(3, { ...base, kind: 1, content: "everyone rejects" });
    const result = await publisher.publish(note);

    expect(result.accepted).toEqual([]);
    expect(new Set(result.rejected)).toEqual(
      new Set([
        { relay: "wss://one/", reason: "duplicate: already have this event" },
        { relay: "wss://two/", reason: "blocked: spam" },
      ]),
    );
  });

  // Task 12 step 2 との統合: 予算が埋まっていて pool.publish() が reject
  // した場合も、publisher.ts はそれを他の失敗と同じように rejected へ積む
  // (迂回する特別扱いをしない)。
  it("プールの予算切れによる reject も rejected に積む", async () => {
    const store = new EventStore();
    const author = relayListEvent(4, [["r", "wss://busy/", "write"]]);
    store.put(author, "wss://indexer/");

    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = new ConnectionPool({
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        connections.set(url, relay);
        return relay;
      },
      maxConnections: 0,
    });
    const publisher = createPublisher({
      pool,
      routing: new RoutingTable(store),
      fallbackRelays: [],
    });

    const note = sign(4, { ...base, kind: 1, content: "no budget" });
    const result = await publisher.publish(note);

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.relay).toBe("wss://busy/");
  });
});
