import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { EventStore } from "../read/event-store";
import { RoutingTable } from "../read/routing-table";
import type { NostrSource } from "../read/source";
import { SubscriptionManager } from "../read/subscription-manager";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayUrl } from "../relay/relay-connection";
import { createSection } from "./create-section";

const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const sign = (content: string): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: 1_700_000_000,
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

describe("createSection", () => {
  it("releases the previous relay connection before opening the next one on a source change", async () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    // 最終カウント (1) だけでは「解放してから開いた」と「一瞬両方持って
    // から解放」を区別できないので、connect/close の実際の順序をログして
    // 主張する —— 接続数に上限ができたとき、一瞬の 2 が問題になるため。
    const log: string[] = [];
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url: RelayUrl) => {
        log.push(`connect:${url}`);
        const relay = new FakeRelayConnection(url);
        const close = relay.close.bind(relay);
        relay.close = () => {
          log.push(`close:${url}`);
          close();
        };
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });

    const [source, setSource] = createSignal<NostrSource>({
      type: "nostr",
      filters: [{ kinds: [1] }],
      relays: ["wss://a/"],
    });

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        createSection({ source, manager });

        queueMicrotask(async () => {
          try {
            await vi.waitFor(() => {
              expect(relays.has("wss://a/")).toBe(true);
            });
            expect(manager.connectionCount).toBe(1);
            expect(relays.get("wss://a/")?.closed).toBe(false);

            setSource({
              type: "nostr",
              filters: [{ kinds: [1] }],
              relays: ["wss://b/"],
            });

            await vi.waitFor(() => {
              expect(relays.has("wss://b/")).toBe(true);
            });

            // 前の接続は次を開く前に解放・close されていなければならない
            // ので、事後の件数ではなく実際の順序を主張する。
            expect(log).toEqual([
              "connect:wss://a/",
              "close:wss://a/",
              "connect:wss://b/",
            ]);
            expect(relays.get("wss://a/")?.closed).toBe(true);
            expect(manager.connectionCount).toBe(1);
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        });
      });
    });
  });

  it("releases the connection via the manager when the section is disposed", async () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url: RelayUrl) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const [source] = createSignal<NostrSource>({
      type: "nostr",
      filters: [{ kinds: [1] }],
      relays: ["wss://a/"],
    });

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        createSection({ source, manager });

        queueMicrotask(async () => {
          try {
            await vi.waitFor(() => {
              expect(relays.has("wss://a/")).toBe(true);
            });
            expect(manager.connectionCount).toBe(1);

            dispose();

            expect(relays.get("wss://a/")?.closed).toBe(true);
            expect(manager.connectionCount).toBe(0);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  });

  it("reads events from the same store manager writes to (no store option to disagree)", async () => {
    // 捕まえる変異: createSection が `options.manager.store` ではなく自前の
    // `new EventStore()` を使う。manager は自分の store にしか put() しない
    // ので、別 store を見ると store.get(id) が常に undefined になり items()
    // が空のまま固まる。
    const relay = new FakeRelayConnection("wss://a/" as RelayUrl);
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: () => relay,
      fallbackRelays: ["wss://fallback/"],
    });
    const [source] = createSignal<NostrSource>({
      type: "nostr",
      filters: [{ kinds: [1] }],
      relays: ["wss://a/"],
    });
    const event = sign("hello from create-section test");

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const section = createSection({ source, manager });

        queueMicrotask(async () => {
          try {
            await vi.waitFor(() => {
              expect(relay.subscriptions.length).toBe(1);
            });
            relay.emitEvent(0, event);

            await vi.waitFor(() => {
              expect(section.items()).toEqual([event]);
            });
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        });
      });
    });
  });
});
