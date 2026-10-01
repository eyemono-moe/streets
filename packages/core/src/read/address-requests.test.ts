import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { createAddressRequests } from "./address-requests";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";
import type { SubscriptionManager } from "./subscription-manager";

const RELAY = "wss://relay.example/" as RelayUrl;
const SK = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const PUBKEY = bytesToHex(schnorr.getPublicKey(SK));
const OTHER = "c".repeat(64);

const article = (identifier: string): NostrEvent => {
  const unsigned = {
    pubkey: PUBKEY,
    created_at: 1_700_000_000,
    kind: 30_023,
    tags: [["d", identifier]],
    content: "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), SK)) };
};

const stubManager = () => {
  const fetchOnce = vi.fn<SubscriptionManager["fetchOnce"]>(
    () => new Promise<void>(() => {}),
  );
  return { fetchOnce } as unknown as SubscriptionManager & {
    fetchOnce: typeof fetchOnce;
  };
};

const setup = () => {
  const manager = stubManager();
  const clock = createFakeClock();
  const store = new EventStore({ scheduler: clock });
  const requests = createAddressRequests({ store, manager, scheduler: clock });
  return { manager, clock, store, requests };
};

describe("createAddressRequests", () => {
  it("窓の中の要求を kind ごとのフィルタにまとめて 1 回で取りにいく", () => {
    // 捕まえる変異: 住所ごとに fetchOnce を撃つ
    const { manager, clock, requests } = setup();
    requests.request({ kind: 30_023, pubkey: PUBKEY, identifier: "a" });
    requests.request({ kind: 30_023, pubkey: OTHER, identifier: "b" });
    requests.request({ kind: 30_000, pubkey: PUBKEY, identifier: "c" });
    expect(manager.fetchOnce).not.toHaveBeenCalled();

    clock.advance(200);
    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
    const [filters] = manager.fetchOnce.mock.calls[0] as [RelayFilter[]];
    expect(filters).toEqual([
      { kinds: [30_023], authors: [PUBKEY, OTHER], "#d": ["a", "b"] },
      { kinds: [30_000], authors: [PUBKEY], "#d": ["c"] },
    ]);
  });

  it("store にある住所は要求しない", () => {
    const { manager, clock, store, requests } = setup();
    store.put(article("a"), RELAY);
    requests.request({ kind: 30_023, pubkey: PUBKEY, identifier: "a" });
    clock.advance(200);
    expect(manager.fetchOnce).not.toHaveBeenCalled();
  });

  it("片付いても store に無ければ見つからなかったとし、届けば取り消す", async () => {
    const { manager, clock, store, requests } = setup();
    let resolve = () => {};
    manager.fetchOnce.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const address = { kind: 30_023, pubkey: PUBKEY, identifier: "a" };
    const settled = vi.fn();
    requests.subscribe(settled);
    requests.request(address);
    clock.advance(200);
    expect(requests.isUnresolved(address)).toBe(false);

    resolve();
    await Promise.resolve();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(requests.isUnresolved(address)).toBe(true);

    store.put(article("a"), RELAY);
    expect(requests.isUnresolved(address)).toBe(false);
  });

  it("取ってから古くなっていなければ、無かった住所も問い合わせ直さない", async () => {
    // 捕まえる変異: 画面に出し直すたびに、ステータスの無い人へ問い合わせる
    const { manager, clock, requests } = setup();
    manager.fetchOnce.mockImplementation(() => Promise.resolve());
    const address = { kind: 30_023, pubkey: PUBKEY, identifier: "gone" };
    requests.request(address);
    clock.advance(200);
    await Promise.resolve();
    await Promise.resolve();
    requests.request(address);
    clock.advance(200);
    expect(manager.fetchOnce).toHaveBeenCalledTimes(1);
    expect(requests.isUnresolved(address)).toBe(true);
  });

  it("古くなる kind は、時間が経てば手元にあっても取り直す", async () => {
    const { manager, clock, requests } = setup();
    manager.fetchOnce.mockImplementation(() => Promise.resolve());
    const status = { kind: 30_315, pubkey: PUBKEY, identifier: "music" };
    requests.request(status);
    clock.advance(200);
    await Promise.resolve();
    await Promise.resolve();
    clock.advance(11 * 60 * 1000);
    requests.request(status);
    clock.advance(200);
    expect(manager.fetchOnce).toHaveBeenCalledTimes(2);
  });
});
