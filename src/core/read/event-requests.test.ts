import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { createEventRequests } from "./event-requests";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";
import type { SubscriptionManager } from "./subscription-manager";

const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

/**
 * request()/isUnresolved() は id を文字列として扱うだけで検証しない (event-refs.ts
 * が既に hex 64 桁検証済みの id しか渡さない前提)。64 桁 hex の見た目に揃えれば足りる。
 */
const idFor = (seed: number): string => seed.toString(16).padStart(64, "0");

/** kind:1 の署名済みイベントを 1 件作る (store.put が通る実在のイベントが要るテスト用)。 */
const noteEvent = (seed: number, content = `note ${seed}`): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content,
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

/**
 * コアレッサは SubscriptionManager の他のメンバを一切使わないので、スタブは
 * fetchOnce の呼ばれ方だけを観測できれば足りる。
 */
const stubManager = () => {
  const fetchOnce = vi.fn<SubscriptionManager["fetchOnce"]>(
    () => new Promise<void>(() => {}), // 既定では解決しない (解決を要するテストでは上書きする)
  );
  return { fetchOnce } as unknown as SubscriptionManager & {
    fetchOnce: typeof fetchOnce;
  };
};

describe("createEventRequests", () => {
  it("窓の中の複数の request を 1 回の fetchOnce にまとめる", () => {
    // 捕まえる変異1: 要求ごとに fetchOnce を撃つ (N+1 の復活) ——
    // 「呼ばれた回数が 1」で検出する
    // 捕まえる変異2: 窓を持たず同期的に撃つ —— 「advance 前は呼ばれない」で検出する
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createEventRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    requests.request(idFor(1));
    requests.request(idFor(2));
    requests.request(idFor(3));

    expect(manager.fetchOnce).not.toHaveBeenCalled();

    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
  });

  it("フィルタが { ids: [要求された全 id] } になる", () => {
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createEventRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    const a = idFor(1);
    const b = idFor(2);
    requests.request(a);
    requests.request(b);
    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
    const [filters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    expect(filters).toHaveLength(1);
    expect(new Set(filters[0].ids)).toEqual(new Set([a, b]));
  });

  it("送ったバッチの件数を lastBatchSize / maxBatchSize に出す", () => {
    // 捕まえる変異1: lastBatchSize を固定値 0 にする
    //   (上限に近づいていることが外から一切読めなくなる)
    // 捕まえる変異2: maxBatchSize を毎回 lastBatchSize で上書きする
    //   (ピークが小さいバッチで消え、いちばん知りたい値が残らない)
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createEventRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    requests.request(idFor(1));
    requests.request(idFor(2));
    requests.request(idFor(3));
    clock.advance(200);
    expect(requests.lastBatchSize).toBe(3);
    expect(requests.maxBatchSize).toBe(3);

    requests.request(idFor(4));
    clock.advance(200);
    expect(requests.lastBatchSize).toBe(1);
    expect(requests.maxBatchSize).toBe(3);
  });

  it("同じ id を 2 回要求しても ids に 1 回しか入らない", () => {
    // 捕まえる変異: Set ではなく配列で溜める
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createEventRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    const a = idFor(1);
    requests.request(a);
    requests.request(a);
    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
    const [filters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    expect(filters[0].ids).toEqual([a]);
  });

  it("既に EventStore にあるイベントの id は要求しない", () => {
    // 捕まえる変異: 既取得の判定を省く (store.get(id) を呼ばない)
    const manager = stubManager();
    const clock = createFakeClock();
    const store = new EventStore();
    const cached = noteEvent(1);
    store.put(cached, "wss://relay/" as RelayUrl);

    const requests = createEventRequests({
      store,
      manager,
      scheduler: clock,
    });

    requests.request(cached.id);
    clock.advance(200);

    expect(manager.fetchOnce).not.toHaveBeenCalled();
  });

  it("窓が閉じた後の新しい要求は次のバッチになる", () => {
    // 捕まえる変異: flush の中で pending を新しい Set に差し替えず使い回す
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createEventRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    const a = idFor(1);
    const b = idFor(2);

    requests.request(a);
    clock.advance(200);

    requests.request(b);
    clock.advance(200);

    expect(manager.fetchOnce).toHaveBeenCalledTimes(2);
    const [firstFilters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    const [secondFilters] = manager.fetchOnce.mock.calls[1] as [RelayFilter[]];
    expect(firstFilters[0].ids).toEqual([a]);
    expect(secondFilters[0].ids).toEqual([b]);
  });

  it("isUnresolved はバッチ完了前は false", () => {
    // 捕まえる変異: 完了を待たず request() の時点で即 true にする
    // (取得中のものが「失敗」と描かれる)
    const manager = stubManager(); // fetchOnce は解決しない
    const clock = createFakeClock();
    const requests = createEventRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    const id = idFor(1);
    requests.request(id);
    clock.advance(200); // 窓は閉じて fetchOnce は投げたが、まだ解決していない

    expect(requests.isUnresolved(id)).toBe(false);
  });

  it("isUnresolved はバッチ完了後、store に無ければ true", async () => {
    // 捕まえる変異: 完了を待たず即 true にする (上のテストと対で、今度は
    // 「完了後は true になる」側を確かめる —— 片方だけだと isUnresolved が
    // 常に false を返す壊れ方を見逃す)
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
    const requests = createEventRequests({
      store,
      manager,
      scheduler: clock,
    });

    const id = idFor(1);
    requests.request(id);
    clock.advance(200);
    expect(requests.isUnresolved(id)).toBe(false); // まだ解決していない

    resolveFetch();
    await Promise.resolve();
    await Promise.resolve();

    expect(requests.isUnresolved(id)).toBe(true); // 解決したが store に無い
  });

  it("isUnresolved はイベントが届けば false", async () => {
    // 捕まえる変異: store を見ない (settled に入っているかどうかだけで
    // 判定する)
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
    const requests = createEventRequests({
      store,
      manager,
      scheduler: clock,
    });

    const event = noteEvent(1);
    requests.request(event.id);
    clock.advance(200);
    resolveFetch();
    await Promise.resolve();
    await Promise.resolve();
    expect(requests.isUnresolved(event.id)).toBe(true);

    // 別経路 (カラムの購読など) で store に届いたことを模す。
    store.put(event, "wss://relay/" as RelayUrl);

    expect(requests.isUnresolved(event.id)).toBe(false);
  });

  it("再要求すると、次のバッチが片付くまで isUnresolved は false に戻る", async () => {
    // 捕まえる変異: request() が再要求時に settled.delete(id) を呼ばない (settled が
    // 追加専用のまま)。2 回目の fetchOnce 未解決中も isUnresolved が true を返し続け、
    // 「再要求直後は false」のアサーションが落ちる — 1 回しか request しない他テストでは捕まらない。
    const clock = createFakeClock();
    const store = new EventStore();
    let resolveFirst: () => void = () => {};
    let resolveSecond: () => void = () => {};
    let call = 0;
    const fetchOnce = vi.fn<SubscriptionManager["fetchOnce"]>(() => {
      call += 1;
      if (call === 1) {
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return new Promise<void>((resolve) => {
        resolveSecond = resolve;
      });
    });
    const manager = { fetchOnce } as unknown as SubscriptionManager;
    const requests = createEventRequests({
      store,
      manager,
      scheduler: clock,
    });

    const id = idFor(1);

    // 1 本目: 要求してバッチを片付ける。store は空のままなので unresolved。
    requests.request(id);
    clock.advance(200);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    expect(requests.isUnresolved(id)).toBe(true);

    // 2 本目: 同じ id をもう一度要求する (カラム項目の再マウントを模す)。
    // 新しいバッチはまだ片付いていないので、settled の古い記録に頼らず
    // false に戻っていなければならない —— これが「取得中」を「見つから
    // なかった」と誤って描く欠陥そのもの。
    requests.request(id);
    expect(requests.isUnresolved(id)).toBe(false);

    // 2 本目が解決し、store は依然空 —— 再び true に戻る。
    clock.advance(200);
    resolveSecond();
    await Promise.resolve();
    await Promise.resolve();
    expect(requests.isUnresolved(id)).toBe(true);
  });

  it("要求していない id の isUnresolved は false", () => {
    // 捕まえる変異: 既定を true にする
    const requests = createEventRequests({
      store: new EventStore(),
      manager: stubManager(),
      scheduler: createFakeClock(),
    });

    expect(requests.isUnresolved(idFor(999))).toBe(false);
  });

  it("dispose() はタイマーを残さない", () => {
    // 捕まえる変異: clearTimeout を省く。fetchOnce が呼ばれるかどうかの
    // 間接観測ではなく、clock.pendingCount で直接タイマーの本数を数える
    // (fake-clock.ts の doc comment と同じ動機)
    const clock = createFakeClock();
    const requests = createEventRequests({
      store: new EventStore(),
      manager: stubManager(),
      scheduler: clock,
    });

    requests.request(idFor(1));
    expect(clock.pendingCount).toBe(1);

    requests.dispose();

    expect(clock.pendingCount).toBe(0);
  });

  it("dispose() 後の request は何もしない", () => {
    // 捕まえる変異: request() の disposed ガードを省く
    const manager = stubManager();
    const clock = createFakeClock();
    const requests = createEventRequests({
      store: new EventStore(),
      manager,
      scheduler: clock,
    });

    requests.dispose();
    requests.request(idFor(1));
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
    const requests = createEventRequests({
      store,
      manager,
      scheduler: clock,
    });

    const listener = vi.fn();
    requests.subscribe(listener);

    requests.request(idFor(1));
    clock.advance(200);
    expect(listener).not.toHaveBeenCalled(); // fetchOnce 自体はまだ解決していない

    resolveFetch();
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
