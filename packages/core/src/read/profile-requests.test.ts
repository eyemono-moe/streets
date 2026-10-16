import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";
import { createProfileRequests } from "./profile-requests";
import type { ReadRouting } from "./read-routing";
import type { SubscriptionManager } from "./subscription-manager";

const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const pubkeyFor = (seed: number) =>
  bytesToHex(schnorr.getPublicKey(keyFor(seed)));

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
 * コアレッサが SubscriptionManager から使うのは、取得・著者ごとの行き先・読み方だけ。
 * 行き先は `writeRelays` に書いた人だけ分かる。
 */
const stubManager = (
  writeRelays: Record<string, string[]> = {},
  readRouting: ReadRouting = { mode: "outbox" },
) => {
  const fetchOnce = vi.fn<SubscriptionManager["fetchOnce"]>(
    () => new Promise<void>(() => {}), // 既定では解決しない (解決を要するテストでは上書きする)
  );
  const relaysForAuthor = (pubkey: string, count: number) =>
    writeRelays[pubkey]?.slice(0, count);
  return {
    fetchOnce,
    relaysForAuthor,
    readRouting,
  } as unknown as SubscriptionManager & {
    fetchOnce: typeof fetchOnce;
  };
};

/** 取得は 1 回目・聞き直しの 2 段の Promise を経るので、片付くまで数回待つ。 */
const flushPromises = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe("createProfileRequests", () => {
  it("イベントが無い取得完了も pubkey ごとの fetchedAt として記録する", async () => {
    const store = new EventStore();
    const manager = stubManager();
    const clock = createFakeClock();
    let finishFetch = () => {};
    manager.fetchOnce.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFetch = resolve;
        }),
    );
    const requests = createProfileRequests({
      store,
      manager,
      scheduler: clock,
      indexers: [],
    });
    const author = pubkeyFor(99);

    requests.request(author);
    clock.advance(200);
    expect(store.replaceableFetchedAt(0, author)).toBeUndefined();

    finishFetch();
    await flushPromises();
    expect(store.replaceableFetchedAt(0, author)).toBeDefined();
  });

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
      indexers: [],
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
      indexers: [],
    });

    requests.request(pubkeyFor(1));
    requests.request(pubkeyFor(2));
    requests.request(pubkeyFor(3));

    expect(manager.fetchOnce).not.toHaveBeenCalled();

    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
  });

  it("公開鍵でない値は束に入れない", () => {
    // 捕まえる変異: 空文字が束に混ざり、リレーが同じ束のほかの人の分ごと断る
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [],
    });

    requests.request("");
    requests.request("npub1abc");
    requests.request(pubkeyFor(1));
    clock.advance(200);

    const [filters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    expect(filters).toEqual([{ kinds: [0], authors: [pubkeyFor(1)] }]);
  });

  it("フィルタが { kinds: [0], authors: [要求された全員] } になる", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [],
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
      indexers: [],
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
      indexers: [],
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
      indexers: [],
    });

    const a = pubkeyFor(1);
    const b = pubkeyFor(2);

    requests.request(a);
    clock.advance(200);

    requests.request(b);
    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(2);
    const [firstFilters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    const [secondFilters] = manager.fetchOnce.mock.calls[1] as [RelayFilter[]];
    expect(firstFilters[0].authors).toEqual([a]);
    expect(secondFilters[0].authors).toEqual([b]);
  });

  it("store にあってもポリシーの staleMs (kind:0 は 1 日) 以内なら要求しない", () => {
    // 捕まえる変異: 鮮度を見ずに常に要求する (毎回全員を取り直してしまう)。
    const manager = stubManager();
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
    // isStale は fetchedAt === 0 を無条件 stale として扱う
    // (invalidate() の目印と区別できないため) —— 時計を 0 から動かして
    // からでないと、この後の advance は「fresh」を主張できない。
    clock.advance(1);
    const cached = profileEvent(1);
    store.put(cached, "wss://relay/");

    const requests = createProfileRequests({
      store,
      manager,
      scheduler: clock,
      indexers: [],
    });

    // staleMs (1 日) の 1ms 手前まで進めても、まだ新鮮。
    clock.advance(24 * 60 * 60 * 1000 - 2);
    requests.request(cached.pubkey);
    clock.advance(200);

    expect(manager.fetchOnce).not.toHaveBeenCalled();
  });

  it("store にあってもポリシーの staleMs を超えていれば要求し直す", () => {
    // 捕まえる変異: 鮮度を見ずに一切要求しない
    //   (プロフィールが永久に更新されない —— 名前が初日で凍りつく)。
    const manager = stubManager();
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
    const cached = profileEvent(1);
    store.put(cached, "wss://relay/");

    const requests = createProfileRequests({
      store,
      manager,
      scheduler: clock,
      indexers: [],
    });

    // staleMs (1 日) を超えて進める。
    clock.advance(24 * 60 * 60 * 1000 + 1);
    requests.request(cached.pubkey);
    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
    const [filters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    expect(filters[0].authors).toEqual([cached.pubkey]);
  });

  it("refresh なら staleMs 以内でも取り直す", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
    clock.advance(1);
    const cached = profileEvent(1);
    store.put(cached, "wss://relay/");

    const requests = createProfileRequests({
      store,
      manager,
      scheduler: clock,
      indexers: [],
    });

    requests.request(cached.pubkey, { refresh: true });
    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
  });

  it("取りにいっている最中の pubkey は、返事が来るまで重ねて要求しない", async () => {
    // 捕まえる変異: 古い版を持つ人のアバターが返事待ちの間に描かれるたび、同じ人を要求し直す。
    const manager = stubManager();
    let resolve = () => {};
    manager.fetchOnce.mockImplementationOnce(
      () => new Promise<void>((r) => (resolve = r)),
    );
    manager.fetchOnce.mockImplementation(() => Promise.resolve());
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore({ scheduler: clock }),
      manager,
      scheduler: clock,
      indexers: [],
    });
    const pubkey = pubkeyFor(1);

    requests.request(pubkey);
    clock.advance(200);
    requests.request(pubkey);
    clock.advance(200);
    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);

    resolve();
    await flushPromises();
    requests.request(pubkey, { refresh: true });
    clock.advance(200);
    expect(manager.fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("dispose() 後は fetchOnce を呼ばない", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [],
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
    const manager = stubManager();
    manager.fetchOnce.mockImplementation(fetchOnce);
    const requests = createProfileRequests({
      store,
      manager,
      scheduler: clock,
      indexers: [],
    });

    const listener = vi.fn();
    requests.subscribe(listener);

    requests.request(pubkeyFor(1));
    clock.advance(200);
    expect(listener).not.toHaveBeenCalled(); // fetchOnce 自体はまだ解決していない

    resolveFetch();
    await flushPromises();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("プロフィールの行き先", () => {
  const INDEXER = "wss://indexer/";
  const WRITE_A = "wss://write-a/";
  const WRITE_B = "wss://write-b/";

  /** fetchOnce の呼ばれ方を「行き先 → フィルタ」で並べる。既定のリレーは "default"。 */
  const callsOf = (manager: ReturnType<typeof stubManager>) =>
    manager.fetchOnce.mock.calls.map(([filters, options]) => ({
      relays: options?.relays ?? "default",
      filters,
    }));

  it("書き込みリレーが分かる人は、そのリレーへだけ聞く", () => {
    // 捕まえる変異: 既定のリレーへも同じ人を聞く（#956 の前の動き）
    const a = pubkeyFor(1);
    const b = pubkeyFor(2);
    const manager = stubManager({ [a]: [WRITE_A], [b]: [WRITE_A, WRITE_B] });
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(a);
    requests.request(b);
    clock.advance(200);

    expect(callsOf(manager)).toEqual([
      { relays: [WRITE_A], filters: [{ kinds: [0], authors: [a, b] }] },
      { relays: [WRITE_B], filters: [{ kinds: [0], authors: [b] }] },
    ]);
  });

  it("書き込みリレーが分からない人は、既定のリレーへ聞き、インデクサへ kind:10002 も聞く", () => {
    const a = pubkeyFor(1);
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(a);
    clock.advance(200);

    expect(callsOf(manager)).toEqual([
      { relays: "default", filters: [{ kinds: [0], authors: [a] }] },
      { relays: [INDEXER], filters: [{ kinds: [0, 10002], authors: [a] }] },
    ]);
  });

  it("1 回目で kind:10002 だけが届いた人は、その書き込みリレーへ聞き直す", async () => {
    // 捕まえる変異: 聞き直さず、インデクサにも既定のリレーにも無い人のプロフィールが出ないまま
    const a = pubkeyFor(1);
    const writeRelays: Record<string, string[]> = {};
    const manager = stubManager(writeRelays);
    const store = new EventStore();
    // インデクサが kind:10002 を返し、ルーティング表に書き込みリレーが載る。
    manager.fetchOnce.mockImplementation(async (_filters, options) => {
      if (options?.relays?.[0] === INDEXER) writeRelays[a] = [WRITE_A];
    });
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store,
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(a);
    clock.advance(200);
    await flushPromises();

    expect(callsOf(manager).slice(2)).toEqual([
      { relays: [WRITE_A], filters: [{ kinds: [0], authors: [a] }] },
    ]);
  });

  it("書き込みリレーに無かった人は、既定のリレーへ聞き直す", async () => {
    // 捕まえる変異: 書き込みリレーが kind:0 を持っていない人・枠が足りず開けなかった人が出ないまま
    const a = pubkeyFor(1);
    const manager = stubManager({ [a]: [WRITE_A] });
    manager.fetchOnce.mockImplementation(() => Promise.resolve());
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(a);
    clock.advance(200);
    await flushPromises();

    expect(callsOf(manager)).toEqual([
      { relays: [WRITE_A], filters: [{ kinds: [0], authors: [a] }] },
      { relays: "default", filters: [{ kinds: [0], authors: [a] }] },
    ]);
  });

  it("1 回目で見つかった人は聞き直さない", async () => {
    const found = profileEvent(1);
    const missing = pubkeyFor(2);
    const store = new EventStore();
    const manager = stubManager({
      [found.pubkey]: [WRITE_A],
      [missing]: [WRITE_A],
    });
    manager.fetchOnce.mockImplementation(async () => {
      store.put(found, WRITE_A);
    });
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store,
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(found.pubkey);
    requests.request(missing);
    clock.advance(200);
    await flushPromises();

    expect(callsOf(manager)[1]).toEqual({
      relays: "default",
      filters: [{ kinds: [0], authors: [missing] }],
    });
    expect(manager.fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("どこにも無かった人は、既定のリレーとインデクサへ聞いた後に聞き直さない", async () => {
    // 捕まえる変異: 同じ既定のリレーへ同じ人を 2 回聞く
    const a = pubkeyFor(1);
    const manager = stubManager();
    manager.fetchOnce.mockImplementation(() => Promise.resolve());
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(a);
    clock.advance(200);
    await flushPromises();

    expect(manager.fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("繋いだリレーだけを読む設定では、既定のリレーへだけ聞く", async () => {
    const a = pubkeyFor(1);
    const manager = stubManager(
      { [a]: [WRITE_A] },
      { mode: "direct", relays: ["wss://mine/"] },
    );
    manager.fetchOnce.mockImplementation(() => Promise.resolve());
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(a);
    clock.advance(200);
    await flushPromises();

    expect(callsOf(manager)).toEqual([
      { relays: "default", filters: [{ kinds: [0], authors: [a] }] },
    ]);
  });

  it("取り直しは、書き込みリレーを 2 本で止めずに聞き、インデクサにも聞く", () => {
    // 捕まえる変異: 1 回目と同じ 2 本だけに聞き、新しい版が無いリレーの古い版で止まる
    const a = pubkeyFor(1);
    const writes = [WRITE_A, WRITE_B, "wss://write-c/"];
    const manager = stubManager({ [a]: writes });
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(a, { refresh: true });
    clock.advance(200);

    expect(callsOf(manager)).toEqual([
      ...writes.map((relay) => ({
        relays: [relay],
        filters: [{ kinds: [0], authors: [a] }],
      })),
      { relays: [INDEXER], filters: [{ kinds: [0, 10002], authors: [a] }] },
    ]);
  });

  it("書き込みリレーが分からない人の取り直しは、既定のリレーとインデクサへ聞く", () => {
    const a = pubkeyFor(1);
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(a, { refresh: true });
    clock.advance(200);

    expect(callsOf(manager)).toEqual([
      { relays: "default", filters: [{ kinds: [0], authors: [a] }] },
      { relays: [INDEXER], filters: [{ kinds: [0, 10002], authors: [a] }] },
    ]);
  });

  it("取り直しと同じ窓で要求したほかの人は、広く聞かない", () => {
    // 捕まえる変異: 取り直しを 1 回目と同じ束に入れ、タイムラインの人まで全部の書き込みリレーへ聞く
    const refreshed = pubkeyFor(1);
    const other = pubkeyFor(2);
    const writes = [WRITE_A, WRITE_B, "wss://write-c/"];
    const manager = stubManager({ [refreshed]: writes, [other]: writes });
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(refreshed, { refresh: true });
    requests.request(other);
    clock.advance(200);

    const askedFor = (pubkey: string) =>
      callsOf(manager)
        .filter(({ filters }) => filters[0].authors?.includes(pubkey))
        .map(({ relays }) => relays);
    expect(askedFor(other)).toEqual([[WRITE_A], [WRITE_B]]);
    expect(askedFor(refreshed)).toHaveLength(writes.length + 1);
  });

  it("繋いだリレーだけを読む設定では、取り直しも既定のリレーへだけ聞く", () => {
    const a = pubkeyFor(1);
    const manager = stubManager(
      { [a]: [WRITE_A] },
      { mode: "direct", relays: ["wss://mine/"] },
    );
    const clock = createFakeClock();
    const requests = createProfileRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
      indexers: [INDEXER],
    });

    requests.request(a, { refresh: true });
    clock.advance(200);

    expect(callsOf(manager)).toEqual([
      { relays: "default", filters: [{ kinds: [0], authors: [a] }] },
    ]);
  });
});
