import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vite-plus/test";
import { type EventAddress, formatEventAddress } from "../nostr/address";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { AddressRequests } from "./address-requests";
import type { EngagementRequests } from "./engagement-requests";
import type { EventRequests } from "./event-requests";
import { EventStore } from "./event-store";
import {
  type EventLookup,
  type ReadLookups,
  createReadLookups,
} from "./lookups";
import type { ProfileRequests } from "./profile-requests";

const RELAY = "wss://relay.example/" as RelayUrl;
const SK = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const PUBKEY = bytesToHex(schnorr.getPublicKey(SK));

const signed = (draft: {
  kind: number;
  content?: string;
  tags?: string[][];
  created_at?: number;
}): NostrEvent => {
  const unsigned = {
    pubkey: PUBKEY,
    created_at: draft.created_at ?? 1_700_000_000,
    kind: draft.kind,
    tags: draft.tags ?? [],
    content: draft.content ?? "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), SK)) };
};

/** 要求を記録し、バッチが片付いた知らせをテストから出せる要求器。 */
const fakeRequests = () => {
  const requested: string[] = [];
  const listeners = new Set<() => void>();
  const unresolved = new Set<string>();
  const requests: EventRequests & ProfileRequests & EngagementRequests = {
    request: (id: string) => void requested.push(id),
    isUnresolved: (id) => unresolved.has(id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  };
  return {
    requests,
    requested,
    unresolved,
    listenerCount: () => listeners.size,
    settle: () => {
      for (const listener of [...listeners]) listener();
    },
  };
};

/** 住所の要求を記録し、バッチが片付いた知らせをテストから出せる要求器。 */
const fakeAddressRequests = () => {
  const requested: string[] = [];
  const listeners = new Set<() => void>();
  const unresolved = new Set<string>();
  const requests: AddressRequests = {
    request: (address) => void requested.push(formatEventAddress(address)),
    isUnresolved: (address) => unresolved.has(formatEventAddress(address)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {},
  };
  return {
    requests,
    requested,
    unresolved,
    listenerCount: () => listeners.size,
    settle: () => {
      for (const listener of [...listeners]) listener();
    },
  };
};

const setup = () => {
  const store = new EventStore();
  const events = fakeRequests();
  const addresses = fakeAddressRequests();
  const profiles = fakeRequests();
  const engagements = fakeRequests();
  const lookups: ReadLookups = createReadLookups({
    store,
    events: events.requests,
    addresses: addresses.requests,
    profiles: profiles.requests,
    engagements: engagements.requests,
  });
  return { store, events, addresses, profiles, engagements, lookups };
};

describe("watchEvent", () => {
  it("store にある投稿はすぐ found を知らせ、要求しない", () => {
    const { store, events, lookups } = setup();
    const note = signed({ kind: 1, content: "hi" });
    store.put(note, RELAY);
    const seen: EventLookup[] = [];
    lookups.watchEvent(note.id, undefined, (lookup) => seen.push(lookup));
    expect(seen).toEqual([{ phase: "found", event: note }]);
    expect(events.requested).toEqual([]);
  });

  it("無い投稿は取得中を知らせて要求し、届いたら found にして購読を外す", () => {
    const { store, events, lookups } = setup();
    const note = signed({ kind: 1, content: "late" });
    const seen: EventLookup[] = [];
    lookups.watchEvent(note.id, undefined, (lookup) => seen.push(lookup));
    expect(seen).toEqual([{ phase: "loading" }]);
    expect(events.requested).toEqual([note.id]);

    store.put(note, RELAY);
    events.settle();
    expect(seen.at(-1)).toEqual({ phase: "found", event: note });
    expect(events.listenerCount()).toBe(0);
  });

  it("別の id のバッチでは missing にせず、自分の id が片付いたら missing にする", () => {
    const { events, lookups } = setup();
    const id = "a".repeat(64);
    const seen: EventLookup[] = [];
    lookups.watchEvent(id, undefined, (lookup) => seen.push(lookup));
    events.settle();
    expect(seen).toEqual([{ phase: "loading" }]);

    events.unresolved.add(id);
    events.settle();
    expect(seen.at(-1)).toEqual({ phase: "missing" });
  });

  it("見つからなかった後でも、後のバッチで届けば found にする", () => {
    const { store, events, lookups } = setup();
    const note = signed({ kind: 1, content: "after missing" });
    const seen: EventLookup[] = [];
    lookups.watchEvent(note.id, undefined, (lookup) => seen.push(lookup));
    events.unresolved.add(note.id);
    events.settle();
    expect(seen.at(-1)).toEqual({ phase: "missing" });

    store.put(note, RELAY);
    events.settle();
    expect(seen.at(-1)).toEqual({ phase: "found", event: note });
  });

  it("空の id は要求せず missing にする", () => {
    const { events, lookups } = setup();
    const seen: EventLookup[] = [];
    lookups.watchEvent("", undefined, (lookup) => seen.push(lookup));
    expect(seen).toEqual([{ phase: "missing" }]);
    expect(events.requested).toEqual([]);
  });

  it("止めた後はバッチが片付いても知らせない", () => {
    const { events, lookups } = setup();
    const id = "b".repeat(64);
    const seen: EventLookup[] = [];
    const stop = lookups.watchEvent(id, undefined, (lookup) =>
      seen.push(lookup),
    );
    stop();
    events.unresolved.add(id);
    events.settle();
    expect(seen).toEqual([{ phase: "loading" }]);
  });
});

describe("watchAddress", () => {
  const article = (identifier: string, created_at: number) =>
    signed({ kind: 30_023, tags: [["d", identifier]], created_at });
  const addressOf = (identifier: string): EventAddress => ({
    kind: 30_023,
    pubkey: PUBKEY,
    identifier,
  });

  it("store にある最新版をすぐ知らせ、要求しない", () => {
    const { store, addresses, lookups } = setup();
    const latest = article("post", 2);
    store.put(article("post", 1), RELAY);
    store.put(latest, RELAY);
    const seen: EventLookup[] = [];
    lookups.watchAddress(addressOf("post"), (lookup) => seen.push(lookup));
    expect(seen).toEqual([{ phase: "found", event: latest }]);
    expect(addresses.requested).toEqual([]);
  });

  it("新しい版が入ったら知らせ直す", () => {
    // 捕まえる変異: 見つけた時点で購読をやめ、記事の更新が画面に届かない
    const { store, lookups } = setup();
    store.put(article("post", 1), RELAY);
    const seen: EventLookup[] = [];
    lookups.watchAddress(addressOf("post"), (lookup) => seen.push(lookup));
    const next = article("post", 2);
    store.put(next, RELAY);
    expect(seen.at(-1)).toEqual({ phase: "found", event: next });
  });

  it("別の住所の版では知らせない", () => {
    const { store, lookups } = setup();
    const seen: EventLookup[] = [];
    lookups.watchAddress(addressOf("post"), (lookup) => seen.push(lookup));
    store.put(article("other", 1), RELAY);
    expect(seen).toEqual([{ phase: "loading" }]);
  });

  it("無ければ要求し、片付いても無ければ missing にする", () => {
    const { addresses, lookups } = setup();
    const seen: EventLookup[] = [];
    lookups.watchAddress(addressOf("post"), (lookup) => seen.push(lookup));
    expect(addresses.requested).toEqual([`30023:${PUBKEY}:post`]);
    addresses.settle();
    expect(seen).toEqual([{ phase: "loading" }]);

    addresses.unresolved.add(`30023:${PUBKEY}:post`);
    addresses.settle();
    expect(seen.at(-1)).toEqual({ phase: "missing" });
  });

  it("止めた後は知らせない", () => {
    const { store, addresses, lookups } = setup();
    const seen: EventLookup[] = [];
    const stop = lookups.watchAddress(addressOf("post"), (lookup) =>
      seen.push(lookup),
    );
    stop();
    store.put(article("post", 1), RELAY);
    addresses.settle();
    expect(seen).toEqual([{ phase: "loading" }]);
    expect(addresses.listenerCount()).toBe(0);
  });
});

describe("watchProfile", () => {
  const profileEvent = (name: string, created_at: number) =>
    signed({
      kind: 0,
      content: JSON.stringify({ name }),
      tags: [["emoji", "wave", "https://example.com/wave.png"]],
      created_at,
    });

  it("無いうちは undefined を知らせて要求し、届いたら解析して知らせる", () => {
    const { store, profiles, lookups } = setup();
    const names: (string | undefined)[] = [];
    lookups.watchProfile(PUBKEY, (details) =>
      names.push(details?.profile?.name),
    );
    expect(names).toEqual([undefined]);
    expect(profiles.requested).toEqual([PUBKEY]);

    store.put(profileEvent("alice", 1_700_000_000), RELAY);
    expect(names.at(-1)).toBe("alice");
    profiles.settle();
    expect(profiles.listenerCount()).toBe(0);
  });

  it("store にあれば要求せず、新しい版が入るたびに知らせる", () => {
    const { store, profiles, lookups } = setup();
    const first = profileEvent("alice", 1_700_000_000);
    store.put(first, RELAY);
    const seen: { name?: string; tags?: readonly string[][] }[] = [];
    lookups.watchProfile(PUBKEY, (details) =>
      seen.push({ name: details?.profile?.name, tags: details?.tags }),
    );
    expect(seen).toEqual([{ name: "alice", tags: first.tags }]);
    expect(profiles.requested).toEqual([]);

    store.put(profileEvent("alice2", 1_700_000_100), RELAY);
    expect(seen.at(-1)?.name).toBe("alice2");
  });

  it("止めた後は新しい版が入っても知らせない", () => {
    const { store, lookups } = setup();
    const names: (string | undefined)[] = [];
    const stop = lookups.watchProfile(PUBKEY, (details) =>
      names.push(details?.profile?.name),
    );
    stop();
    store.put(profileEvent("alice", 1_700_000_000), RELAY);
    expect(names).toEqual([undefined]);
  });
});

describe("requestProfile", () => {
  it("要求だけを出す", () => {
    const { profiles, lookups } = setup();
    lookups.requestProfile(PUBKEY);
    expect(profiles.requested).toEqual([PUBKEY]);
    expect(profiles.listenerCount()).toBe(0);
  });
});

describe("watchEngagements", () => {
  it("要求し、その投稿を指すものが入ったときとバッチが片付いたときに知らせる", () => {
    const { store, engagements, lookups } = setup();
    const target = signed({ kind: 1, content: "target" });
    let changes = 0;
    lookups.watchEngagements(target.id, () => changes++);
    expect(engagements.requested).toEqual([target.id]);

    store.put(signed({ kind: 1, content: "unrelated" }), RELAY);
    expect(changes).toBe(0);
    store.put(
      signed({ kind: 7, content: "+", tags: [["e", target.id]] }),
      RELAY,
    );
    expect(changes).toBe(1);
    engagements.settle();
    expect(changes).toBe(2);
  });

  it("止めた後は知らせない", () => {
    const { store, engagements, lookups } = setup();
    const targetId = "c".repeat(64);
    let changes = 0;
    const stop = lookups.watchEngagements(targetId, () => changes++);
    stop();
    store.put(
      signed({ kind: 7, content: "+", tags: [["e", targetId]] }),
      RELAY,
    );
    engagements.settle();
    expect(changes).toBe(0);
  });
});
