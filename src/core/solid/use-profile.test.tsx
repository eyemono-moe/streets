import { type NostrEvent, kinds } from "nostr-tools";
import { createRoot } from "solid-js";
import { describe, expect, test, vi } from "vitest";
import type { NostrCoreQueryClient } from "../query/query-client";
import { MemoryNostrRepository } from "../repository/memory-repository";
import type { NostrRepository } from "../repository/nostr-repository";
import { NostrCoreProvider, createNostrCore } from "./provider";
import { useCoreProfile } from "./use-profile";

const createProfileEvent = (
  overrides: Partial<NostrEvent> = {},
): NostrEvent => ({
  id: "profile-1",
  pubkey: "pubkey-1",
  kind: kinds.Metadata,
  content: JSON.stringify({
    name: "alice",
    display_name: "Alice",
    about: "hello",
    picture: "https://example.com/alice.png",
    nip05: "alice@example.com",
    lud16: "alice@example.com",
  }),
  tags: [],
  created_at: 1,
  sig: "sig",
  ...overrides,
});

const createCore = (repository: NostrRepository) => {
  const ensured: Array<{ pubkey: string; relays?: readonly string[] }> = [];
  const queryClient: NostrCoreQueryClient = {
    async ensureEvent() {
      return undefined;
    },
    async ensureProfile(options) {
      ensured.push(options);
      return repository.getLatestReplaceable(kinds.Metadata, options.pubkey);
    },
    dispose: vi.fn(),
  };

  return {
    ensured,
    core: createNostrCore({
      rxNostr: {} as Parameters<typeof createNostrCore>[0]["rxNostr"],
      repository,
      queryClient,
    }),
  };
};

describe("useCoreProfile", () => {
  test("returns cached repository profile metadata through the legacy cache shape", async () => {
    const repository = new MemoryNostrRepository();
    const event = createProfileEvent();
    await repository.putEvent({ event, relay: "wss://relay.example" });
    const { core, ensured } = createCore(repository);

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const data = useCoreProfile(() => event.pubkey);
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(data().data?.raw).toBe(event);
                expect(data().data?.parsed.name).toBe("alice");
              });
              expect(ensured).toEqual([]);
              dispose();
              resolve();
            });
            return null;
          },
        });
      });
    });
  });

  test("subscribes to ProfileView and updates when metadata is inserted", async () => {
    const repository = new MemoryNostrRepository();
    const { core, ensured } = createCore(repository);
    const event = createProfileEvent();

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const data = useCoreProfile(
              () => event.pubkey,
              () => ["wss://relay.example"],
            );
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(ensured).toEqual([
                  { pubkey: event.pubkey, relays: ["wss://relay.example"] },
                ]);
              });
              expect(data().data).toBeUndefined();

              await repository.putEvent({
                event,
                relay: "wss://relay.example",
              });

              await vi.waitFor(() => {
                expect(data().data?.raw.id).toBe(event.id);
                expect(data().data?.parsed.display_name).toBe("Alice");
              });
              expect(data().isFetching).toBe(false);
              dispose();
              resolve();
            });
            return null;
          },
        });
      });
    });
  });
});
