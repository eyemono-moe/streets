import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { EventStore } from "../read/event-store";
import { RoutingTable } from "../read/routing-table";
import type { NostrSource } from "../read/source";
import { SubscriptionManager } from "../read/subscription-manager";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayUrl } from "../relay/relay-connection";
import { createSection } from "./create-section";

describe("createSection", () => {
  it("releases the previous relay connection before opening the next one on a source change", async () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    // A count sampled after both the release and the open (connectionCount
    // === 1) cannot distinguish "released then opened" from "briefly held
    // both, then released one" — both leave the same final count. Logging
    // connect/close as they actually happen and asserting their order is the
    // only way to pin down release-before-open, which matters once a global
    // connection cap exists: a transient 2 would matter even though the
    // final count reads 1.
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
        createSection({ source, store, manager });

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

            // The previous relay's connection must be released (and closed,
            // since nothing else in the pool holds it) before the next one
            // is opened. Assert the actual order of events, not just the
            // count sampled afterward.
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
        createSection({ source, store, manager });

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
});
