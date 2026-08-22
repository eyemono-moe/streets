import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { ConnectionPool } from "../read/connection-pool";
import { EventStore } from "../read/event-store";
import { RoutingTable } from "../read/routing-table";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayUrl } from "../relay/relay-connection";
import { RefetchFailedError, fetchLatest } from "./fetch-latest";

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

/**
 * `ConnectionPool` を、URL ごとに FakeRelayConnection を割り当てて組み立てる。
 * `publisher.test.ts` / `bootstrap.test.ts` と同じ形。
 */
const poolWithFakes = (connections: Map<RelayUrl, FakeRelayConnection>) =>
  new ConnectionPool({
    connect: (url) => {
      const relay = new FakeRelayConnection(url);
      connections.set(url, relay);
      return relay;
    },
  });

describe("fetchLatest", () => {
  // 捕まえる変異: read リレーから引く。自分が最後に書いた版がまだ
  // 伝播していないと、自分で自分の変更を消す。
  it("write リレーから引いて最新版を返す", async () => {
    const store = new EventStore();
    // author の write リレーと read リレーをわざと別々にしておく。
    // write リレーだけへ問い合わせているなら read リレー宛の接続は
    // 一切開かないはず。
    const relayList = sign(1, {
      ...base,
      kind: 10002,
      tags: [
        ["r", "wss://write-only/", "write"],
        ["r", "wss://read-only/", "read"],
      ],
    });
    store.put(relayList, "wss://indexer/");
    const author = relayList.pubkey;

    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);

    const promise = fetchLatest(
      {
        pool,
        routing: new RoutingTable(store),
        store,
        fallbackRelays: ["wss://fallback/"],
      },
      0,
      undefined,
      author,
    );

    await vi.waitFor(() =>
      expect(connections.get("wss://write-only/")?.subscriptions).toHaveLength(
        1,
      ),
    );

    const profile = sign(1, { ...base, kind: 0, content: '{"name":"a"}' });
    connections.get("wss://write-only/")?.emitEvent(0, profile);
    connections.get("wss://write-only/")?.emitEose(0);

    const result = await promise;
    expect(result?.id).toBe(profile.id);
    // read リレーにも fallback にも一切繋いでいない。
    expect(connections.has("wss://read-only/")).toBe(false);
    expect(connections.has("wss://fallback/")).toBe(false);
  });

  // 捕まえる変異: undefined を返して呼び出し側に続行させる。
  // 「取れなかった」を「無い」と取り違えると、既存のフォローリストを
  // 1 件だけのリストで丸ごと上書きする。
  it("全リレーが EOSE を返さなければ RefetchFailedError", async () => {
    const store = new EventStore();
    const relayList = sign(2, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://silent/", "write"]],
    });
    store.put(relayList, "wss://indexer/");

    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);

    // 誰も応答しないまま短いタイムアウトで打ち切らせる。
    const promise = fetchLatest(
      {
        pool,
        routing: new RoutingTable(store),
        store,
        fallbackRelays: [],
        timeoutMs: 10,
      },
      0,
      undefined,
      relayList.pubkey,
    );

    await expect(promise).rejects.toThrow(RefetchFailedError);
  });

  // 捕まえる変異: reason を見ずに settle をすべて応答と数える
  it("CLOSED だけでは応答と数えない", async () => {
    const store = new EventStore();
    const relayList = sign(3, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://refuses/", "write"]],
    });
    store.put(relayList, "wss://indexer/");

    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);

    const promise = fetchLatest(
      {
        pool,
        routing: new RoutingTable(store),
        store,
        fallbackRelays: [],
        // CLOSED はすぐ届くので、これが応答と誤って数えられれば
        // タイムアウトを待たずに (RefetchFailedError を投げずに) 解決して
        // しまう。十分に長いタイムアウトにしてタイムアウト成立と区別する。
        timeoutMs: 5_000,
      },
      0,
      undefined,
      relayList.pubkey,
    );

    await vi.waitFor(() =>
      expect(connections.get("wss://refuses/")?.subscriptions).toHaveLength(1),
    );
    connections
      .get("wss://refuses/")
      ?.emitClosed(0, "blocked: filters must specify at least one kind");

    await expect(promise).rejects.toThrow(RefetchFailedError);
  });

  // 捕まえる変異: 空でも RefetchFailedError にする。
  // 初めてフォローリストを作るときに永久に書けなくなる。
  it("1 本が EOSE を返し、当該イベントが無ければ undefined", async () => {
    const store = new EventStore();
    const relayList = sign(4, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://empty/", "write"]],
    });
    store.put(relayList, "wss://indexer/");

    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);

    const promise = fetchLatest(
      {
        pool,
        routing: new RoutingTable(store),
        store,
        fallbackRelays: [],
      },
      0,
      undefined,
      relayList.pubkey,
    );

    await vi.waitFor(() =>
      expect(connections.get("wss://empty/")?.subscriptions).toHaveLength(1),
    );
    // イベントは一切流さず EOSE だけ返す — 「まだ誰も書いていない」を表す。
    connections.get("wss://empty/")?.emitEose(0);

    await expect(promise).resolves.toBeUndefined();
  });

  // 捕まえる変異: 空配列へ投げて黙って undefined を返す
  it("write リレーが分からなければ fallbackRelays を使う", async () => {
    const store = new EventStore(); // 誰の kind:10002 も無い
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);

    const someone = sign(5, { ...base, kind: 0, content: '{"name":"b"}' });

    const promise = fetchLatest(
      {
        pool,
        routing: new RoutingTable(store),
        store,
        fallbackRelays: ["wss://fallback-a/", "wss://fallback-b/"],
      },
      0,
      undefined,
      someone.pubkey,
    );

    await vi.waitFor(() =>
      expect(connections.get("wss://fallback-a/")?.subscriptions).toHaveLength(
        1,
      ),
    );
    await vi.waitFor(() =>
      expect(connections.get("wss://fallback-b/")?.subscriptions).toHaveLength(
        1,
      ),
    );

    connections.get("wss://fallback-a/")?.emitEvent(0, someone);
    connections.get("wss://fallback-a/")?.emitEose(0);
    connections.get("wss://fallback-b/")?.emitEose(0);

    const result = await promise;
    expect(result?.id).toBe(someone.id);
  });

  // 捕まえる変異: 黙って d を無視する。latestReplaceable の索引は
  // kind:pubkey だけを鍵にしていて d を見ないので、間違った版を返す。
  it("identifier を渡すと投げる", async () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);
    const options = {
      pool,
      routing: new RoutingTable(store),
      store,
      fallbackRelays: [],
    };
    const PUBKEY = "a".repeat(64);

    await expect(
      fetchLatest(options, 30078, "streets", PUBKEY),
    ).rejects.toThrow(/identifier/);
    // 投げるだけで、どのリレーへも一切繋いでいない。
    expect(connections.size).toBe(0);
  });
});
