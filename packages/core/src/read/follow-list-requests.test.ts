import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";
import {
  FOLLOW_LIST_RECHECK_MS,
  createFollowListRequests,
  followListFilter,
  followListRelays,
  isFollowListDue,
} from "./follow-list-requests";
import { RoutingTable } from "./routing-table";
import type { SubscriptionManager } from "./subscription-manager";

const VIEWER = "b".repeat(64);

describe("followListFilter", () => {
  it("手元の版があれば、それより新しいものだけを聞く", () => {
    expect(
      followListFilter(AUTHOR, { created_at: 100 }, { type: "list" }),
    ).toEqual({ kinds: [3], authors: [AUTHOR], since: 101, limit: 1 });
  });

  it("手元に無ければ、一覧そのものを聞く", () => {
    expect(followListFilter(AUTHOR, undefined, { type: "list" })).toEqual({
      kinds: [3],
      authors: [AUTHOR],
      limit: 1,
    });
  });

  it("手元に無い人の「フォローされています」は、自分を指す一覧だけ聞く", () => {
    expect(
      followListFilter(AUTHOR, undefined, {
        type: "follows-you",
        viewer: VIEWER,
      }),
    ).toEqual({ kinds: [3], authors: [AUTHOR], "#p": [VIEWER], limit: 1 });
  });
});

describe("isFollowListDue", () => {
  it("未取得か、間隔が過ぎていれば取り直す時期", () => {
    expect(isFollowListDue(undefined, 0)).toBe(true);
    expect(isFollowListDue(1000, 1000 + FOLLOW_LIST_RECHECK_MS - 1)).toBe(
      false,
    );
    expect(isFollowListDue(1000, 1000 + FOLLOW_LIST_RECHECK_MS)).toBe(true);
  });
});

describe("followListRelays", () => {
  it("リレーが無ければ undefined（空配列にしない）、あれば先頭の数本", () => {
    expect(followListRelays([])).toBeUndefined();
    const urls = ["wss://1/", "wss://2/", "wss://3/"] as RelayUrl[];
    expect(followListRelays(urls)).toEqual(["wss://1/", "wss://2/"]);
  });
});

const setup = () => {
  const store = new EventStore();
  const fetchOnce = vi.fn<SubscriptionManager["fetchOnce"]>(async () => {});
  const clock = createFakeClock();
  const requests = createFollowListRequests({
    store,
    manager: { fetchOnce } as unknown as SubscriptionManager,
    routing: new RoutingTable(store),
    scheduler: clock,
  });
  return { store, fetchOnce, clock, requests };
};

const SK = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const AUTHOR = bytesToHex(schnorr.getPublicKey(SK));

const list = (createdAt: number): NostrEvent => {
  const unsigned = {
    pubkey: AUTHOR,
    created_at: createdAt,
    kind: 3,
    tags: [],
    content: "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), SK)) };
};

describe("createFollowListRequests", () => {
  it("同じ人の一覧は、続けて頼まれても 1 回しか取らない", () => {
    const { fetchOnce, requests } = setup();
    requests.request(AUTHOR, { type: "list" });
    requests.request(AUTHOR, { type: "list" });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it("間隔が過ぎたら取り直し、そのとき手元の版から since を作る", () => {
    const { store, fetchOnce, clock, requests } = setup();
    requests.request(AUTHOR, { type: "list" });
    store.put(list(500), "wss://r/" as RelayUrl);
    clock.advance(FOLLOW_LIST_RECHECK_MS);
    requests.request(AUTHOR, { type: "list" });
    expect(fetchOnce).toHaveBeenCalledTimes(2);
    expect(fetchOnce.mock.calls[1]?.[0]).toEqual([
      { kinds: [3], authors: [AUTHOR], since: 501, limit: 1 },
    ]);
  });

  it("手元に一覧があれば、フォローされているかのために取らない", () => {
    const { store, fetchOnce, requests } = setup();
    store.put(list(500), "wss://r/" as RelayUrl);
    requests.request(AUTHOR, { type: "follows-you", viewer: VIEWER });
    expect(fetchOnce).not.toHaveBeenCalled();
  });

  it("一覧を取ったばかりなら、フォローされているかのために重ねて取らない", () => {
    const { fetchOnce, requests } = setup();
    requests.request(AUTHOR, { type: "list" });
    requests.request(AUTHOR, { type: "follows-you", viewer: VIEWER });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it("手元に無ければ、自分を指す一覧に絞って 1 回だけ取る", () => {
    const { fetchOnce, requests } = setup();
    requests.request(AUTHOR, { type: "follows-you", viewer: VIEWER });
    requests.request(AUTHOR, { type: "follows-you", viewer: VIEWER });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(fetchOnce.mock.calls[0]?.[0]).toEqual([
      { kinds: [3], authors: [AUTHOR], "#p": [VIEWER], limit: 1 },
    ]);
  });

  it("取得が失敗したら、次の要求でやり直す", async () => {
    const { fetchOnce, requests } = setup();
    fetchOnce.mockRejectedValueOnce(new Error("x"));
    requests.request(AUTHOR, { type: "list" });
    await Promise.resolve();
    await Promise.resolve();
    requests.request(AUTHOR, { type: "list" });
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("公開鍵でない値は取りにいかない", () => {
    const { fetchOnce, requests } = setup();
    requests.request("npub1xxx", { type: "list" });
    expect(fetchOnce).not.toHaveBeenCalled();
  });
});
