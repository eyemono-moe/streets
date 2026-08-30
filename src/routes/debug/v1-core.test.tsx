import type { NostrEvent } from "nostr-tools";
import { createRxNostr } from "rx-nostr";
import { createRoot } from "solid-js";
import { describe, expect, test, vi } from "vitest";
import { NostrCoreProvider, createNostrCore } from "../../core/solid/provider";
import DebugV1CoreRoute from "./v1-core";

const createTextNote = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: "debug-event-1",
  pubkey: "debug-pubkey-1",
  created_at: 1_700_000_000,
  kind: 1,
  tags: [],
  content: "hello from v1 debug feed",
  sig: "debug-sig-1",
  ...overrides,
});

describe("DebugV1CoreRoute", () => {
  test("renders the v1 core snapshot without legacy event cache APIs", () => {
    createRoot((dispose) => {
      const core = createNostrCore({ rxNostr: createRxNostr() });
      core.queryClient.ensureEventFeed({
        id: "debug-feed",
        filters: { kinds: [1], limit: 10 },
        strategy: "backfill",
        relays: ["wss://relay.example"],
      });
      let element: HTMLElement | undefined;

      NostrCoreProvider({
        core,
        get children() {
          element = DebugV1CoreRoute() as HTMLElement;
          return null;
        },
      });

      expect(element?.textContent).toContain("v1 Core Debug");
      expect(element?.textContent).toContain("debug-feed");
      expect(element?.textContent).toContain("queryRegistry");
      expect(element?.textContent).toContain("feedStateStore");
      expect(element?.textContent).toContain("connectionState");

      core.dispose();
      dispose();
    });
  });

  test("renders a plain debug feed from feed state and event store", () => {
    createRoot((dispose) => {
      const core = createNostrCore({ rxNostr: createRxNostr() });
      const event = createTextNote();
      core.queryClient.ensureEventFeed({
        id: "debug-feed",
        filters: { kinds: [1], limit: 10 },
        strategy: "backfill",
        relays: ["wss://relay.example"],
      });
      core.eventStore.putEvent({ event, relay: "wss://relay.example" });
      core.feedStateStore.setStatus("debug-feed", "live", {
        activeRelays: ["wss://relay.example"],
        hasMoreBackfill: true,
      });
      core.feedStateStore.addItem("debug-feed", event);
      let element: HTMLElement | undefined;

      NostrCoreProvider({
        core,
        get children() {
          element = DebugV1CoreRoute() as HTMLElement;
          return null;
        },
      });

      expect(element?.textContent).toContain("DebugFeedColumn");
      expect(element?.textContent).toContain("debug-feed");
      expect(element?.textContent).toContain("status: live");
      expect(element?.textContent).toContain("events: 1");
      expect(element?.textContent).toContain("debug-event-1");
      expect(element?.textContent).toContain("debug-pubkey-1");
      expect(element?.textContent).toContain("kind: 1");
      expect(element?.textContent).toContain("hello from v1 debug feed");

      core.dispose();
      dispose();
    });
  });

  test("routes debug feed controls through the v1 query client", () => {
    createRoot((dispose) => {
      const core = createNostrCore({ rxNostr: createRxNostr() });
      const fetchMore = vi
        .spyOn(core.queryClient, "fetchMoreEventFeed")
        .mockResolvedValue([]);
      const stopFeed = vi.spyOn(core.queryClient, "stopEventFeed");
      let element: HTMLElement | undefined;

      NostrCoreProvider({
        core,
        get children() {
          element = DebugV1CoreRoute() as HTMLElement;
          return null;
        },
      });

      if (element) {
        document.body.appendChild(element);
      }
      const buttons = [...(element?.querySelectorAll("button") ?? [])];
      buttons
        .find((button) => button.textContent?.includes("Fetch more"))
        ?.click();
      buttons
        .find((button) => button.textContent?.includes("Stop feed"))
        ?.click();

      expect(fetchMore).toHaveBeenCalledWith("debug-feed");
      expect(stopFeed).toHaveBeenCalledWith("debug-feed");

      element?.remove();
      core.dispose();
      dispose();
    });
  });
});
