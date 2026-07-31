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
  it("keeps at most one live relay connection across a source change (previous relay closes before the next opens)", async () => {
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
            // is opened: connectionCount stays at 1 across the swap rather
            // than briefly holding both, and the old socket is actually
            // closed, not merely forgotten.
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
