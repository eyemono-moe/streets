import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import type { Scheduler } from "./connection-pool";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";
import { RoutingTable } from "./routing-table";
import { SectionReader } from "./section-reader";
import { MAX_ITEMS_PER_SECTION, type SectionStatus } from "./source";
import {
  type SectionDelivery,
  type SectionHandle,
  SubscriptionManager,
} from "./subscription-manager";

// Task 1/4 と同じく、その場で署名して自己整合的なイベントを作る。実 EventStore
// は verifyEvent を通すため、PassThroughStore と違って本物の署名が要る。
const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const signedEvent = (content: string, createdAt: number): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: createdAt,
    kind: 1,
    tags: [],
    content,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
  };
};

// 署名検証を通さずに SectionReader だけを試すため、EventStore を差し替える。
// SectionReader は put() 後に get() で正本を取り直すので、real EventStore と
// 同じく put() した内容を get() で返せる必要がある。
class PassThroughStore extends EventStore {
  readonly #seen = new Map<string, NostrEvent>();
  override put(event: NostrEvent): "inserted" | "duplicate" | "rejected" {
    if (this.#seen.has(event.id)) return "duplicate";
    this.#seen.set(event.id, event);
    return "inserted";
  }
  override get(id: string): NostrEvent | undefined {
    return this.#seen.get(id);
  }
}

const event = (id: string, createdAt: number): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: createdAt,
  kind: 1,
  tags: [],
  content: id,
  sig: "sig",
});

const setup = (relayUrls = ["wss://a/"], scheduler?: Scheduler) => {
  const relays = new Map<string, FakeRelayConnection>();
  const store = new PassThroughStore();
  const manager = new SubscriptionManager({
    store,
    routing: new RoutingTable(store),
    connect: (url) => {
      const relay = new FakeRelayConnection(url);
      relays.set(url, relay);
      return relay;
    },
    fallbackRelays: ["wss://fallback/"],
  });
  const reader = new SectionReader({
    source: { type: "nostr", filters: [{ kinds: [1] }], relays: relayUrls },
    order: "created-at-desc",
    store,
    manager,
    scheduler,
  });
  return {
    relays,
    store,
    manager,
    reader,
    relay: () => relays.get(relayUrls[0]),
  };
};

// Task 4: stub the manager entirely so tests can drive `delivery.onPlanChanged`
// directly, instead of going through a real SubscriptionManager (which has no
// way yet to produce a re-plan itself).
const startReaderWithRelays = (relayUrls: RelayUrl[]) => {
  let delivery!: SectionDelivery;
  const manager = {
    subscribe: (
      _filters: RelayFilter[],
      _relays: RelayUrl[] | undefined,
      d: SectionDelivery,
    ): SectionHandle => {
      delivery = d;
      return {
        initialPlan: {
          relays: relayUrls,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        },
        close: () => {},
      };
    },
  } as unknown as SubscriptionManager;

  const clock = createFakeClock();
  const store = new EventStore();
  const reader = new SectionReader({
    source: { type: "nostr", filters: [{ kinds: [1] }], relays: relayUrls },
    order: "created-at-desc",
    store,
    manager,
    scheduler: clock,
  });

  const statuses: SectionStatus[] = [];
  reader.subscribe(() => statuses.push(reader.status));

  reader.start();

  return { reader, delivery, statuses, clock };
};

describe("SectionReader", () => {
  it("複数の配信をまとめて 1 回だけ通知する", () => {
    // 捕まえる変異: バッチをやめて同期通知に戻す (3 回呼ばれる) /
    // デバウンス (毎回張り直し) にする (advance で 1 回も呼ばれない)
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    const listener = vi.fn();
    reader.subscribe(listener);
    reader.start();
    listener.mockClear();

    // 「別々の配信」であることが本質。リレーは 1 イベント 1 メッセージで
    // 送るので、実配信でも 1 件ずつ別のタスクで届く。
    relay()?.emitEvent(0, event("a", 300));
    relay()?.emitEvent(0, event("b", 200));
    relay()?.emitEvent(0, event("c", 100));

    expect(listener).not.toHaveBeenCalled();

    clock.advance(16);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(reader.items.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("窓より短い間隔で流れ続けても通知が止まらない (デバウンスではない)", () => {
    // 捕まえる変異: #notify() を「毎回 clearTimeout して張り直す」
    // デバウンスにする。窓が永久に更新され、流している間 1 回も発火しない。
    //
    // 同期的に連発するだけでは捕まらない —— fake clock の now は advance()
    // でしか進まないので、両者が同じ発火時刻を計算してしまう。窓 (16ms) より
    // 短い間隔で「実際に時計を進めながら」流すことが本質。
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    const listener = vi.fn();
    reader.subscribe(listener);
    reader.start();
    listener.mockClear();

    for (let i = 0; i < 5; i += 1) {
      relay()?.emitEvent(0, event(`n-${i}`, 1000 + i));
      if (i < 4) clock.advance(10);
    }

    expect(listener).toHaveBeenCalled();
  });

  it("通知より前でも items は同期的に正しい", () => {
    // 捕まえる変異: items の更新まで遅延させる
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    reader.start();

    relay()?.emitEvent(0, event("a", 300));

    // クロックを進めていないので通知はまだ出ていないが、直接読めば見える。
    expect(reader.items.map((e) => e.id)).toEqual(["a"]);
  });

  it("上限で弾かれたイベントは通知を積まない", () => {
    // 捕まえる変異: add() の戻り値を無視して常に通知を積む
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION; i += 1) {
      relay()?.emitEvent(0, event(`note-${i}`, 1000 + i));
    }
    clock.advance(16);

    const listener = vi.fn();
    reader.subscribe(listener);
    relay()?.emitEvent(0, event("ancient", 1));
    clock.advance(16);

    expect(listener).not.toHaveBeenCalled();
  });

  it("stop() は保留中の通知を破棄する", () => {
    // 捕まえる変異: stop() で clearTimeout を忘れる
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    const listener = vi.fn();
    reader.subscribe(listener);
    reader.start();
    listener.mockClear();

    relay()?.emitEvent(0, event("a", 300));
    reader.stop();
    clock.advance(16);

    expect(listener).not.toHaveBeenCalled();
  });

  it("starts in the initial phase before anything arrives", () => {
    const { reader } = setup();
    reader.start();

    expect(reader.status.phase).toBe("initial");
    expect(reader.items).toEqual([]);
  });

  it("reports initial phase with no incomplete block before start() is ever called", () => {
    const { reader } = setup();

    expect(reader.status.phase).toBe("initial");
    expect(reader.status.incomplete).toBeUndefined();
    expect(reader.items).toEqual([]);
  });

  it("moves to streaming once the first event arrives", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("first", 100));

    expect(reader.status.phase).toBe("streaming");
    expect(reader.items.map((e) => e.id)).toEqual(["first"]);
  });

  it("settles when every relay has sent eose", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("first", 100));
    relay()?.emitEose(0);

    expect(reader.status.phase).toBe("settled");
  });

  it("orders items by created_at descending", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("older", 100));
    relay()?.emitEvent(0, event("newer", 200));

    expect(reader.items.map((e) => e.id)).toEqual(["newer", "older"]);
  });

  it("does not list the same event twice when two relays deliver it", () => {
    const { relays, reader } = setup(["wss://a/", "wss://b/"]);
    reader.start();

    const shared = event("shared", 100);
    relays.get("wss://a/")?.emitEvent(0, shared);
    relays.get("wss://b/")?.emitEvent(0, shared);

    expect(reader.items).toHaveLength(1);
  });

  it("counts a closed relay as unreachable", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitClosed(0, "blocked: rate limited");

    expect(reader.status.incomplete?.unreachableRelays).toBe(1);
  });

  it("settles once every relay becomes unreachable, with no relays left to wait on", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitClosed(0, "blocked: rate limited");

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete?.unreachableRelays).toBe(1);
  });

  // 旧テスト名: "never reports settled from within start() itself, even when a
  // relay closes synchronously from inside subscribe()"
  //
  // 旧テストは #starting フラグの効果を主張していた。通知をバッチにすると
  // そのフラグは到達不能になり (仕様 5.1)、フラグを削除してもテストは通って
  // しまう —— 落ちなくなるテストである。主張を、内部フラグではなく観測可能な
  // 性質へ移した。
  //
  // 元の欠陥そのものは今も実在する: 複数リレーのうち最初の 1 本が subscribe()
  // の中から同期的に settle すると、その時点の #relays は部分的にしか埋まって
  // おらず、live.every(complete) が空に近い集合に対して自明に真になる。
  // 違いは、その中間状態が観測者に漏れるかどうかである。
  //
  // 捕まえる変異: #notify() のバッチをやめて即座に #emit() する
  // (start() 途中の settled が phasesSeen に漏れる)
  it("観測者は start() 途中の settled を見ない", () => {
    const clock = createFakeClock();
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => ({
        url,
        subscribe: (_filters, handlers) => {
          if (url === "wss://sync-closed/") {
            // WebSocketRelayConnection がソケット既閉時に onClosed を
            // インラインで呼ぶのを模倣する。subscribe() (したがって
            // manager.subscribe()) が返る前にコールバックが発火する。
            handlers.onClosed("socket closed");
          }
          return { close: () => {} };
        },
        publish: async () => {},
        close: () => {},
        onClose: () => () => {},
      }),
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://sync-closed/", "wss://slow/"],
      },
      order: "created-at-desc",
      store,
      manager,
      scheduler: clock,
    });

    const phasesSeen: string[] = [];
    reader.subscribe(() => phasesSeen.push(reader.status.phase));

    reader.start();
    clock.advance(16);

    expect(phasesSeen).not.toContain("settled");
    // 通知が 1 回も出ないのではなく、出た通知が settled を含まないこと。
    // これを主張しないと「バッチが全部飲み込んだだけ」でも通ってしまう。
    expect(phasesSeen.length).toBeGreaterThan(0);
  });

  it("keeps at most MAX_ITEMS_PER_SECTION items, dropping the oldest", () => {
    const { relay, reader } = setup();
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION + 10; i += 1) {
      relay()?.emitEvent(0, event(`note-${i}`, 1000 + i));
    }

    expect(reader.items).toHaveLength(MAX_ITEMS_PER_SECTION);
    expect(reader.items.at(-1)?.id).toBe("note-10");
  });

  it("keeps the most recently arrived items when capped in ascending order", () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new PassThroughStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://a/"],
      },
      order: "created-at-asc",
      store,
      manager,
    });
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION + 10; i += 1) {
      relays.get("wss://a/")?.emitEvent(0, event(`note-${i}`, 1000 + i));
    }

    // Ascending display order: oldest-kept item first, newest-arrived item last.
    // If the cap wrongly kept the *oldest* 500 arrivals instead of the most
    // recent 500, this would read "note-0" / "note-499" instead.
    expect(reader.items).toHaveLength(MAX_ITEMS_PER_SECTION);
    expect(reader.items[0]?.id).toBe("note-10");
    expect(reader.items.at(-1)?.id).toBe(`note-${MAX_ITEMS_PER_SECTION + 9}`);
  });

  it("同値の created_at は id 昇順で表示される", () => {
    // 捕まえる変異: SortedEvents を使わず元のソートに戻す
    // (安定ソートだと到着順 c,a,b のまま残る)
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("c", 100));
    relay()?.emitEvent(0, event("a", 100));
    relay()?.emitEvent(0, event("b", 100));

    expect(reader.items.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("昇順表示でも同値は id 昇順のまま (reverse ではない)", () => {
    // 捕まえる変異: 昇順を toArray().reverse() で作る
    // (reverse だと同値が id 降順 c,b,a になる)
    const relays = new Map<string, FakeRelayConnection>();
    const store = new PassThroughStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://a/"],
      },
      order: "created-at-asc",
      store,
      manager,
    });
    reader.start();

    relays.get("wss://a/")?.emitEvent(0, event("c", 100));
    relays.get("wss://a/")?.emitEvent(0, event("a", 100));
    relays.get("wss://a/")?.emitEvent(0, event("b", 100));

    expect(reader.items.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("notifies listeners when items change", () => {
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    const listener = vi.fn();
    reader.subscribe(listener);
    reader.start();

    relay()?.emitEvent(0, event("first", 100));
    clock.advance(16);

    expect(listener).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Final whole-branch review, finding 4 (section-reader shape): #notify()
  // iterates #listeners in one bare for loop. If an earlier listener
  // throws, listeners registered after it in iteration order never get
  // called for *this* notification -- an arbitrary consumer bug in one
  // observer silently starves every other observer of updates.
  // ---------------------------------------------------------------------
  it("does not strand a later listener when an earlier listener throws", () => {
    const clock = createFakeClock();
    const { relay, reader } = setup(undefined, clock);
    const throwingListener = vi.fn(() => {
      throw new Error("boom from listener 1");
    });
    const laterListener = vi.fn();
    // Registration order matters: #listeners is a Set, iterated in
    // insertion order, so throwingListener runs first.
    reader.subscribe(throwingListener);
    reader.subscribe(laterListener);
    reader.start();

    expect(() => {
      relay()?.emitEvent(0, event("first", 100));
      clock.advance(16);
    }).not.toThrow();

    expect(throwingListener).toHaveBeenCalled();
    expect(laterListener).toHaveBeenCalled();
  });

  it("closes every relay subscription on stop", () => {
    const { relay, reader } = setup();
    reader.start();
    reader.stop();

    expect(relay()?.subscriptions[0].closed).toBe(true);
  });

  // Connection ownership moved to SubscriptionManager (ADR-0023): the reader
  // no longer holds a raw connection to release, it releases its handle and
  // the manager decides whether the underlying connection actually closes
  // (refcounted across sections sharing the same relay url). With only one
  // section on this relay, releasing its handle drops the last reference.
  it("closes the connection via the manager once the last section releases it on stop", () => {
    const { manager, reader } = setup();
    reader.start();
    expect(manager.connectionCount).toBe(1);

    reader.stop();
    expect(manager.connectionCount).toBe(0);
  });

  it("does not expose its internal items array by reference", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("first", 100));
    const items = reader.items;
    items.push(event("mutated", 999));
    items.length = 0;

    expect(reader.items.map((e) => e.id)).toEqual(["first"]);
  });

  // CRITICAL 1: EventStore.put returns "duplicate" for *any* caller once one
  // section has inserted the event, regardless of which section put it there.
  // A PassThroughStore (private per-instance Set) cannot expose this: only a
  // real EventStore shared across two SectionReaders can. Two sections over
  // the same relay/store is the intended usage (a deck column and a user
  // column showing the same author).
  it("lists an event in every section sharing a real EventStore, not just the section that inserted it first", () => {
    const sharedStore = new EventStore();
    const relays = new Map<string, FakeRelayConnection>();
    const manager = new SubscriptionManager({
      store: sharedStore,
      routing: new RoutingTable(sharedStore),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });

    const readerA = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://a/"],
      },
      order: "created-at-desc",
      store: sharedStore,
      manager,
    });
    const readerB = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://b/"],
      },
      order: "created-at-desc",
      store: sharedStore,
      manager,
    });
    readerA.start();
    readerB.start();

    const shared = signedEvent("hello from both sections", 100);
    // readerA's relay delivers first, inserting into the shared store...
    relays.get("wss://a/")?.emitEvent(0, shared);
    // ...then readerB's relay delivers the very same event. Today this
    // returns "duplicate" from the store and readerB silently drops it.
    relays.get("wss://b/")?.emitEvent(0, shared);

    expect(readerA.items.map((e) => e.id)).toEqual([shared.id]);
    expect(readerB.items.map((e) => e.id)).toEqual([shared.id]);
  });

  // CRITICAL 2: EventStore.put returns "duplicate" from the id lookup
  // *before* verifyEvent runs. Once a genuine event with some id has been
  // stored, a malicious relay can resend a forged object reusing that id
  // (different pubkey/content/created_at, bogus sig) and "duplicate" lets it
  // straight past the "rejected" gate. Listing the relay-supplied object
  // (instead of the store's verified copy) would spoof content under a
  // trusted id and, since created_at need not even be a number here, feed a
  // non-number into the sort comparator used for the MAX_ITEMS_PER_SECTION
  // cap, corrupting ordering/eviction for everyone reading that store.
  it("lists the store's verified copy, not a forged object a second relay resends under a genuine event's id", () => {
    const sharedStore = new EventStore();
    const relays = new Map<string, FakeRelayConnection>();
    const manager = new SubscriptionManager({
      store: sharedStore,
      routing: new RoutingTable(sharedStore),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });

    const readerA = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://a/"],
      },
      order: "created-at-desc",
      store: sharedStore,
      manager,
    });
    const readerB = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://b/"],
      },
      order: "created-at-desc",
      store: sharedStore,
      manager,
    });
    readerA.start();
    readerB.start();

    const genuine = signedEvent("GENUINE", 100);
    relays.get("wss://a/")?.emitEvent(0, genuine);

    // relayB is malicious: it reuses genuine's id but swaps in a different
    // pubkey, content, a string created_at, and a bogus sig. EventStore.put
    // finds the id already present and returns "duplicate" without ever
    // calling verifyEvent on this object.
    const forged = {
      ...genuine,
      pubkey: "ff".repeat(32),
      content: "ATTACKER CONTENT",
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed to prove the type-confusion hazard
      created_at: "1700000000" as any,
      sig: "00".repeat(64),
    };
    relays.get("wss://b/")?.emitEvent(0, forged);

    expect(readerB.items).toHaveLength(1);
    expect(readerB.items[0]?.content).toBe("GENUINE");
    expect(readerB.items[0]?.pubkey).toBe(genuine.pubkey);
    expect(typeof readerB.items[0]?.created_at).toBe("number");
  });

  // An explicit `relays: []` bypasses Outbox routing entirely (NostrSource's
  // `relays` doc comment) and asks for nothing: the manager opens no
  // connection and reports zero unroutable authors, so the section has
  // nothing to wait on and settles immediately with no incomplete block.
  // (Contrast with `relays: undefined`, covered below, which does route.)
  it("settles immediately with no incomplete block when the source explicitly lists zero relays", () => {
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: () => {
        throw new Error("must not open any relay for an explicit empty list");
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: [] },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete).toBeUndefined();
  });

  // Contrast with the test above: `relays: []` (nothing named) settles quiet
  // per ADR-0015 ("見るべき場所が存在せず"). But a source whose relays are
  // all unparseable garbage is "the user named places and we could not parse
  // them" — ADR-0011 forbids that vanishing silently. It must still settle
  // (there is nothing left to wait on), but with unreachableRelays > 0 so a
  // caller can tell the two cases apart.
  it("settles with a non-empty incomplete block when every explicit relay is unparseable, unlike an explicit empty list", () => {
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: () => {
        throw new Error("must not open any relay for an unparseable url");
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["not a url", "also not a url"],
      },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete?.unreachableRelays).toBe(2);
  });

  // Task 4: a live section learns its plan changed (ADR-0016 will make the
  // manager actually produce these; here we drive onPlanChanged directly).
  it("goes back to streaming when the plan gains a relay", () => {
    // リレー1 だけで settled になった後、張り直しでリレー2 が増える
    const { reader, delivery, statuses, clock } = startReaderWithRelays([
      "wss://one/",
    ]);
    delivery.onRelayComplete("wss://one/");
    expect(reader.status.phase).toBe("settled");

    delivery.onPlanChanged({
      relays: ["wss://one/", "wss://two/"],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    });
    clock.advance(16);

    expect(reader.status.phase).not.toBe("settled");
    expect(statuses.at(-1)?.phase).not.toBe("settled");
  });

  it("keeps the completion state of relays that survive a re-plan", () => {
    const { reader, delivery } = startReaderWithRelays(["wss://one/"]);
    delivery.onRelayComplete("wss://one/");

    delivery.onPlanChanged({
      relays: ["wss://one/", "wss://two/"],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    });
    delivery.onRelayComplete("wss://two/");

    // リレー1 の完了が引き継がれていなければ settled にならない
    expect(reader.status.phase).toBe("settled");
  });

  it("forgets a relay that the re-plan dropped", () => {
    const { reader, delivery } = startReaderWithRelays([
      "wss://one/",
      "wss://gone/",
    ]);
    delivery.onRelayUnreachable("wss://gone/");
    expect(reader.status.incomplete?.unreachableRelays).toBe(1);

    delivery.onPlanChanged({
      relays: ["wss://one/"],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    });
    delivery.onRelayComplete("wss://one/");

    expect(reader.status.incomplete).toBeUndefined();
    expect(reader.status.phase).toBe("settled");
  });

  it("clears unreachable when the relay completes after recovering", () => {
    const { reader, delivery } = startReaderWithRelays(["wss://one/"]);
    delivery.onRelayUnreachable("wss://one/");
    expect(reader.status.incomplete?.unreachableRelays).toBe(1);

    // 再接続して EOSE が届いた
    delivery.onRelayComplete("wss://one/");

    expect(reader.status.incomplete).toBeUndefined();
    expect(reader.status.phase).toBe("settled");
  });

  it("reports uncoveredAuthors from the plan", () => {
    const { reader, delivery } = startReaderWithRelays(["wss://one/"]);

    delivery.onPlanChanged({
      relays: ["wss://one/"],
      unroutableAuthors: 2,
      uncoveredAuthors: 3,
    });
    delivery.onRelayComplete("wss://one/");

    expect(reader.status.incomplete).toEqual({
      unreachableRelays: 0,
      unroutableAuthors: 2,
      uncoveredAuthors: 3,
    });
  });

  // ADR-0015: an explicitly empty relay list settles quiet even now that
  // `incomplete` has three fields — "we looked everywhere there was to look,
  // and there was nothing" stays true regardless of field count.
  it("still settles with no incomplete for an explicitly empty relay list", () => {
    const { reader, delivery } = startReaderWithRelays([]);
    void delivery;

    expect(reader.status).toEqual({ phase: "settled" });
  });

  // Fix round 1 (post-review), Critical 1's SectionReader-side counterpart:
  // when the manager re-subscribes a *kept* relay in place because its
  // routed authors changed (rather than the relay itself leaving the plan),
  // the section must leave settled and only return to it once the new
  // subscription's own EOSE arrives — reusing the old relay's `complete`
  // would report settled while the fresh REQ is still outstanding.
  it("leaves settled when a kept relay's subscription is restarted, and returns only after the new EOSE", () => {
    const { reader, delivery } = startReaderWithRelays(["wss://one/"]);
    delivery.onRelayComplete("wss://one/");
    expect(reader.status.phase).toBe("settled");

    delivery.onRelayRestarted("wss://one/");
    expect(reader.status.phase).not.toBe("settled");

    delivery.onRelayComplete("wss://one/");
    expect(reader.status.phase).toBe("settled");
  });
});

const relayListEvent = (seed: number, tags: string[][]): NostrEvent => {
  const sk = Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: 1_700_000_000,
    kind: 10002,
    tags,
    content: "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

describe("SectionReader with Outbox routing", () => {
  it("waits on the relays the routing table chose, not a hardcoded list", () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    const authorList = relayListEvent(7, [["r", "wss://chosen/", "write"]]);
    store.put(authorList, "wss://indexer/");

    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: [authorList.pubkey] }],
      },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();

    expect(relays.has("wss://chosen/")).toBe(true);
    expect(relays.has("wss://fallback/")).toBe(false);

    relays.get("wss://chosen/")?.emitEose(0);
    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete).toBeUndefined();
  });

  it("reports authors it could not route", () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: ["f".repeat(64)] }],
      },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();
    relays.get("wss://fallback/")?.emitEose(0);

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete?.unroutableAuthors).toBe(1);
  });

  // Restored from the pre-Task-6 suite (fix round 1): the premise moved, it
  // didn't vanish. planQuery still counts *distinct* authors across all
  // filters (query-plan.ts), and query-plan.test.ts covers that in
  // isolation, but nothing at the SectionReader level exercised the
  // composition of multiple filters with overlapping authors collapsing to
  // one number in status.incomplete. Same source shape and expectation
  // (toBe(3)) as the original test; only the setup moved to the manager.
  //
  // Renamed (review round: the title said "when there are no relays", but
  // `relays` here is undefined, not `[]` — the source omits `relays`
  // entirely, so Outbox routing kicks in and none of the named authors can
  // be routed, sending them all to the fallback connection). Assertions
  // unchanged.
  it("reports unroutableAuthors as the number of distinct authors named across filters when relays are undefined and routing falls back", () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ authors: ["alice", "bob"] }, { authors: ["bob", "carol"] }],
      },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();
    relays.get("wss://fallback/")?.emitEose(0);

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete?.unroutableAuthors).toBe(3);
  });
});
