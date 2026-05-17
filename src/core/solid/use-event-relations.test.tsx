import { type NostrEvent, kinds } from "nostr-tools";
import { EMPTY } from "rxjs";
import { createRoot } from "solid-js";
import { describe, expect, test, vi } from "vitest";
import type { NostrCoreQueryClient } from "../query/query-client";
import { MemoryNostrRepository } from "../repository/memory-repository";
import type {
  NostrEventQuery,
  NostrRepository,
} from "../repository/nostr-repository";
import { NostrCoreProvider, createNostrCore } from "./provider";
import { useCoreEventRelations } from "./use-event-relations";

const createEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: "event-1",
  pubkey: "pubkey-1",
  kind: kinds.ShortTextNote,
  content: "hello",
  tags: [],
  created_at: 1,
  sig: "sig",
  ...overrides,
});

const createCore = (repository: NostrRepository) => {
  const ensuredRelations: Array<{
    query: NostrEventQuery;
    relays?: readonly string[];
  }> = [];
  const queryClient: NostrCoreQueryClient = {
    async ensureEvent() {
      return undefined;
    },
    async ensureProfile() {
      return undefined;
    },
    async ensureEventRelations(options) {
      ensuredRelations.push(options);
      return repository.queryEvents(options.query);
    },
    dispose: vi.fn(),
  };

  return {
    ensuredRelations,
    core: createNostrCore({
      rxNostr: {
        createConnectionStateObservable: () => EMPTY,
      } as Parameters<typeof createNostrCore>[0]["rxNostr"],
      repository,
      queryClient,
    }),
  };
};

describe("useCoreEventRelations", () => {
  test("returns cached matching relation events through the legacy array shape", async () => {
    const repository = new MemoryNostrRepository();
    const target = createEvent({ id: "target" });
    const reaction = createEvent({
      id: "reaction-1",
      kind: kinds.Reaction,
      tags: [
        ["e", target.id],
        ["p", target.pubkey],
      ],
      content: "+",
      created_at: 10,
    });
    await repository.putEvent({
      event: reaction,
      relay: "wss://relay.example",
    });
    const { core, ensuredRelations } = createCore(repository);

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const data = useCoreEventRelations(
              () => ({ kinds: [kinds.Reaction], tags: { e: [target.id] } }),
              () => ["wss://relay.example"],
            );
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(data().data?.map((packet) => packet.raw.id)).toEqual([
                  reaction.id,
                ]);
              });
              expect(ensuredRelations).toEqual([
                {
                  query: { kinds: [kinds.Reaction], tags: { e: [target.id] } },
                  relays: ["wss://relay.example"],
                },
              ]);
              dispose();
              resolve();
            });
            return null;
          },
        });
      });
    });
  });

  test("subscribes to EventStore and updates when a matching relation is inserted", async () => {
    const repository = new MemoryNostrRepository();
    const { core, ensuredRelations } = createCore(repository);
    const target = createEvent({ id: "target" });
    const reply = createEvent({
      id: "reply-1",
      tags: [["e", target.id, "", "reply"]],
      content: "reply",
      created_at: 11,
    });

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const data = useCoreEventRelations(() => ({
              kinds: [kinds.ShortTextNote],
              tags: { e: [target.id] },
            }));
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(ensuredRelations).toEqual([
                  {
                    query: {
                      kinds: [kinds.ShortTextNote],
                      tags: { e: [target.id] },
                    },
                    relays: undefined,
                  },
                ]);
              });
              expect(data().data).toEqual([]);

              await repository.putEvent({
                event: reply,
                relay: "wss://relay.example",
              });

              await vi.waitFor(() => {
                expect(data().data?.map((packet) => packet.raw.id)).toEqual([
                  reply.id,
                ]);
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
