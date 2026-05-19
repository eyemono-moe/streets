import { createRxNostr } from "rx-nostr";
import { createRoot } from "solid-js";
import { describe, expect, test } from "vitest";
import { NostrCoreProvider, createNostrCore } from "../../core/solid/provider";
import DebugV1CoreRoute from "./v1-core";

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
});
