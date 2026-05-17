import type { NostrEvent } from "nostr-tools";
import { EMPTY } from "rxjs";
import { createRoot } from "solid-js";
import { describe, expect, test, vi } from "vitest";
import type { NostrCoreQueryClient } from "../query/query-client";
import { MemoryNostrRepository } from "../repository/memory-repository";
import type { NostrRepository } from "../repository/nostr-repository";
import { NostrCoreProvider, createNostrCore } from "./provider";
import { useCoreEventByID } from "./use-event";

const createEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: "event-1",
  pubkey: "pubkey-1",
  kind: 1,
  content: "hello",
  tags: [],
  created_at: 1,
  sig: "sig",
  ...overrides,
});

const createCore = (repository: NostrRepository) => {
  const ensured: Array<{ id: string; relays?: readonly string[] }> = [];
  const queryClient: NostrCoreQueryClient = {
    async ensureEvent(options) {
      ensured.push(options);
      return repository.getEvent(options.id);
    },
    async ensureProfile() {
      return undefined;
    },
    dispose: vi.fn(),
  };

  return {
    ensured,
    core: createNostrCore({
      rxNostr: {
        createConnectionStateObservable: () => EMPTY,
      } as Parameters<typeof createNostrCore>[0]["rxNostr"],
      repository,
      queryClient,
    }),
  };
};

describe("useCoreEventByID", () => {
  test("returns cached repository events through the legacy cache shape", async () => {
    const repository = new MemoryNostrRepository();
    const event = createEvent();
    await repository.putEvent({ event, relay: "wss://relay.example" });
    const { core, ensured } = createCore(repository);

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const data = useCoreEventByID(() => event.id);
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(data().data?.raw).toBe(event);
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

  test("subscribes to EventStore and updates when the event is inserted", async () => {
    const repository = new MemoryNostrRepository();
    const { core, ensured } = createCore(repository);
    const event = createEvent();

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const data = useCoreEventByID(
              () => event.id,
              () => ["wss://relay.example"],
            );
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(ensured).toEqual([
                  { id: event.id, relays: ["wss://relay.example"] },
                ]);
              });
              expect(data().data).toBeUndefined();

              await repository.putEvent({
                event,
                relay: "wss://relay.example",
              });

              await vi.waitFor(() => {
                expect(data().data?.raw).toBe(event);
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
