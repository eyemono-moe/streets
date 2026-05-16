import { createRxNostr } from "rx-nostr";
import { createRoot } from "solid-js";
import { describe, expect, test } from "vitest";
import { NostrCoreProvider, createNostrCore, useNostrCore } from "./provider";

describe("NostrCoreProvider", () => {
  test("creates a core context with transport, repository, collections, and query client", () => {
    createRoot((dispose) => {
      const rxNostr = createRxNostr();
      const core = createNostrCore({ rxNostr });

      expect(core.transport).toBeDefined();
      expect(core.repository).toBeDefined();
      expect(core.collections.events.id).toBe("nostr-events");
      expect(core.collections.profiles.id).toBe("nostr-profiles");
      expect(core.collections.queryStates.id).toBe("nostr-query-states");
      expect(core.queryClient.ensureEvent).toBeInstanceOf(Function);
      expect(core.queryClient.ensureProfile).toBeInstanceOf(Function);

      core.dispose();
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
