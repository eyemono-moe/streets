import { createRxNostr } from "rx-nostr";
import { createRoot } from "solid-js";
import { describe, expect, test, vi } from "vitest";
import { NostrCoreProvider, createNostrCore, useNostrCore } from "./provider";

describe("NostrCoreProvider", () => {
  test("creates a core context with transport, repository, EventStore views, and query client", () => {
    createRoot((dispose) => {
      const rxNostr = createRxNostr();
      const core = createNostrCore({ rxNostr });

      expect(core.transport).toBeDefined();
      expect(core.repository).toBeDefined();
      expect(core.eventStore).toBeDefined();
      expect(core.feedStateStore).toBeDefined();
      expect(core.profileView).toBeDefined();
      expect(core.queryRegistry).toBeDefined();
      expect(core.queryClient.ensureEvent).toBeInstanceOf(Function);
      expect(core.queryClient.ensureProfile).toBeInstanceOf(Function);

      core.dispose();
      dispose();
    });
  });

  test("disposes the exposed query registry even when a custom query client is supplied", () => {
    createRoot((dispose) => {
      const rxNostr = createRxNostr();
      const registry = {
        open: vi.fn(),
        dispose: vi.fn(),
      };
      const queryClient = {
        ensureEvent: vi.fn(),
        ensureProfile: vi.fn(),
        ensureEventFeed: vi.fn(),
        fetchEventPage: vi.fn(),
        fetchMoreEventFeed: vi.fn(),
        closeEventFeed: vi.fn(),
        publishEvent: vi.fn(),
        dispose: vi.fn(),
      };
      const core = createNostrCore({
        rxNostr,
        queryRegistry: registry,
        queryClient,
      });

      core.dispose();

      expect(queryClient.dispose).toHaveBeenCalledOnce();
      expect(registry.dispose).toHaveBeenCalledOnce();
      dispose();
    });
  });

  test("exposes a supplied core instance through Solid context", () => {
    createRoot((dispose) => {
      const rxNostr = createRxNostr();
      const core = createNostrCore({ rxNostr });
      let resolved: ReturnType<typeof useNostrCore> | undefined;

      NostrCoreProvider({
        core,
        get children() {
          resolved = useNostrCore();
          return null;
        },
      });

      expect(resolved).toBe(core);

      core.dispose();
      dispose();
    });
  });
});
