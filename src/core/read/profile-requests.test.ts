import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";
import { createProfileRequests } from "./profile-requests";
import type { SubscriptionManager } from "./subscription-manager";

// テスト専用の 32 byte 鍵を種から作る (subscription-manager.test.ts と同じ手法)。
const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const pubkeyFor = (seed: number) =>
  bytesToHex(schnorr.getPublicKey(keyFor(seed)));

/** kind:0 の署名済みイベントを 1 件作る。 */
const profileEvent = (seed: number, content = "{}"): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: 1_700_000_000,
    kind: 0,
    tags: [],
    content,
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

/**
 * `manager` は `fetchOnce` の呼ばれ方だけを観測するスタブ。コアレッサは
 * `SubscriptionManager` の他のメンバを一切使わないので、テストダブルは
 * `fetchOnce` だけを持てば足りる。
 */
const stubManager = () => {
  const fetchOnce = vi.fn<SubscriptionManager["fetchOnce"]>(
    () => new Promise<void>(() => {}), // 既定では解決しない (解決を要するテストでは上書きする)
  );
  return { fetchOnce } as unknown as SubscriptionManager & {
    fetchOnce: typeof fetchOnce;
  };
};

describe("createProfileRequests", () => {
  it("送ったバッチの件数を lastBatchSize / maxBatchSize に出す", () => {
    // 捕まえる変異1: lastBatchSize を固定値 0 にする
    //   (上限に近づいていることが外から一切読めなくなる)
    // 捕まえる変異2: maxBatchSize を毎回 lastBatchSize で上書きする
    //   (ピークが小さいバッチで消え、いちばん知りたい値が残らない)
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    requests.request(pubkeyFor(1));
    requests.request(pubkeyFor(2));
    requests.request(pubkeyFor(3));
    clock.advance(200);
    expect(requests.lastBatchSize).toBe(3);
    expect(requests.maxBatchSize).toBe(3);

    requests.request(pubkeyFor(4));
    clock.advance(200);
    expect(requests.lastBatchSize).toBe(1);
    expect(requests.maxBatchSize).toBe(3);
  });

  it("窓の中の複数の request を 1 回の fetchOnce にまとめる", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    requests.request(pubkeyFor(1));
    requests.request(pubkeyFor(2));
    requests.request(pubkeyFor(3));

    // 窓が閉じるまでは何も投げない。
    expect(manager.fetchOnce).not.toHaveBeenCalled();

    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
  });

  it("フィルタが { kinds: [0], authors: [要求された全員] } になる", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    const a = pubkeyFor(1);
    const b = pubkeyFor(2);
    requests.request(a);
    requests.request(b);
    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
    const [filters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    expect(filters).toHaveLength(1);
    expect(filters[0].kinds).toEqual([0]);
    expect(new Set(filters[0].authors)).toEqual(new Set([a, b]));
  });

  it("同じ pubkey を 2 回要求しても authors に 1 回しか入らない", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    const a = pubkeyFor(1);
    requests.request(a);
    requests.request(a);
    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
    const [filters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    expect(filters[0].authors).toEqual([a]);
  });

  it("既に EventStore に kind:0 がある pubkey は要求しない", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const store = new EventStore();
    const cached = profileEvent(1);
    store.put(cached, "wss://relay/");

    const requests = createProfileRequests({
      store,
      manager,
      scheduler: clock,
    });

    requests.request(cached.pubkey);
    clock.advance(200);

    expect(manager.fetchOnce).not.toHaveBeenCalled();
  });

  it("窓が閉じた後の新しい要求は次のバッチになる", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    const a = pubkeyFor(1);
    const b = pubkeyFor(2);

    requests.request(a);
    clock.advance(200); // 1 本目の窓を閉じる

    requests.request(b);
    clock.advance(200); // 2 本目の窓を閉じる

    expect(manager.fetchOnce).toHaveBeenCalledTimes(2);
    const [firstFilters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    const [secondFilters] = manager.fetchOnce.mock.calls[1] as [RelayFilter[]];
    expect(firstFilters[0].authors).toEqual([a]);
    expect(secondFilters[0].authors).toEqual([b]);
  });

  it("dispose() 後は fetchOnce を呼ばない", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    requests.request(pubkeyFor(1));
    requests.dispose();
    clock.advance(200);

    expect(manager.fetchOnce).not.toHaveBeenCalled();
  });

  it("fetchOnce が解決すると subscribe() のリスナーへ通知する", async () => {
    const clock = createFakeClock();
    const store = new EventStore();
    let resolveFetch: () => void = () => {};
    const fetchOnce = vi.fn<SubscriptionManager["fetchOnce"]>(
      () =>
        new Promise<void>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const manager = { fetchOnce } as unknown as SubscriptionManager;
    const requests = createProfileRequests({
      store,
      manager,
      scheduler: clock,
    });

    const listener = vi.fn();
    requests.subscribe(listener);

    requests.request(pubkeyFor(1));
    clock.advance(200);
    expect(listener).not.toHaveBeenCalled(); // fetchOnce 自体はまだ解決していない

    resolveFetch();
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
