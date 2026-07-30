import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { EventStore } from "../read/event-store";
import type { NostrSource } from "../read/source";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayConnection, RelayUrl } from "../relay/relay-connection";
import { createSection } from "./create-section";

describe("createSection", () => {
  it("releases the previous relay before opening the next relay when source changes", async () => {
    const relayA = new FakeRelayConnection("wss://a");
    const relayB = new FakeRelayConnection("wss://b");
    const calls: string[] = [];

    const openRelay = vi.fn((url: RelayUrl): RelayConnection => {
      calls.push(`open:${url}`);
      return url === "wss://a" ? relayA : relayB;
    });
    const releaseRelay = vi.fn((url: RelayUrl) => {
      calls.push(`release:${url}`);
    });

    const [source, setSource] = createSignal<NostrSource>({
      type: "nostr",
      filters: [{ kinds: [1] }],
      relays: ["wss://a"],
    });
    const store = new EventStore();

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        createSection({ source, store, openRelay, releaseRelay });

        queueMicrotask(async () => {
          try {
            await vi.waitFor(() => {
              expect(openRelay).toHaveBeenCalledWith("wss://a");
            });
            expect(releaseRelay).not.toHaveBeenCalled();

            setSource({
              type: "nostr",
              filters: [{ kinds: [1] }],
              relays: ["wss://b"],
            });

            await vi.waitFor(() => {
              expect(openRelay).toHaveBeenCalledWith("wss://b");
            });
            expect(releaseRelay).toHaveBeenCalledWith("wss://a", relayA);
            // The first relay must be released before the second is opened,
            // otherwise a caller pooling connections could hand back the
            // same socket while it's still considered in use by the old
            // reader.
            expect(calls).toEqual([
              "open:wss://a",
              "release:wss://a",
              "open:wss://b",
            ]);
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

  it("does not call releaseRelay when it is not provided (borrow case)", async () => {
    const relay = new FakeRelayConnection("wss://a");
    const openRelay = vi.fn(() => relay);
    const [source] = createSignal<NostrSource>({
      type: "nostr",
      filters: [{ kinds: [1] }],
      relays: ["wss://a"],
    });
    const store = new EventStore();

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        createSection({ source, store, openRelay });

        queueMicrotask(async () => {
          try {
            await vi.waitFor(() => {
              expect(openRelay).toHaveBeenCalledWith("wss://a");
            });
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
            expect(relay.closed).toBe(false);
          }
        });
      });
    });
  });
});
