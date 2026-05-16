import { type NostrEvent, kinds } from "nostr-tools";
import { createRoot } from "solid-js";
import { describe, expect, test, vi } from "vitest";
import type { NostrCoreQueryClient } from "../query/query-client";
import { MemoryNostrRepository } from "../repository/memory-repository";
import type {
  NostrEventQuery,
  NostrRepository,
} from "../repository/nostr-repository";
import { NostrCoreProvider, createNostrCore } from "./provider";
import {
  useCoreEmojiSets,
  useCoreEventList,
  useCoreFollowees,
  useCoreFollowers,
  useCoreUserList,
} from "./use-social-read";

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
      rxNostr: {} as Parameters<typeof createNostrCore>[0]["rxNostr"],
      repository,
      queryClient,
    }),
  };
};

describe("social read core hooks", () => {
  test("returns latest followee contact list through the legacy packet shape", async () => {
    const repository = new MemoryNostrRepository();
    const contactList = createEvent({
      id: "contacts-1",
      kind: kinds.Contacts,
      pubkey: "alice",
      tags: [
        ["p", "bob"],
        ["p", "carol"],
      ],
      created_at: 10,
    });
    await repository.putEvent({
      event: contactList,
      relay: "wss://relay.example",
    });
    const { core, ensuredRelations } = createCore(repository);

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const data = useCoreFollowees(() => "alice");
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(data().data?.raw.id).toBe(contactList.id);
              });
              expect(
                data().data?.parsed.followees.map((tag) => tag.pubkey),
              ).toEqual(["bob", "carol"]);
              expect(ensuredRelations).toEqual([
                {
                  query: {
                    kinds: [kinds.Contacts],
                    authors: ["alice"],
                    limit: 1,
                  },
                  relays: undefined,
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

  test("returns unique followers from contact lists that reference the target pubkey", async () => {
    const repository = new MemoryNostrRepository();
    const target = "alice";
    const oldBobContacts = createEvent({
      id: "contacts-bob-old",
      kind: kinds.Contacts,
      pubkey: "bob",
      tags: [["p", target]],
      created_at: 10,
    });
    const bobContacts = createEvent({
      id: "contacts-bob-new",
      kind: kinds.Contacts,
      pubkey: "bob",
      tags: [],
      created_at: 12,
    });
    const carolContacts = createEvent({
      id: "contacts-carol",
      kind: kinds.Contacts,
      pubkey: "carol",
      tags: [["p", target]],
      created_at: 11,
    });
    await repository.putEvent({
      event: oldBobContacts,
      relay: "wss://relay.example",
    });
    await repository.putEvent({
      event: bobContacts,
      relay: "wss://relay.example",
    });
    await repository.putEvent({
      event: carolContacts,
      relay: "wss://relay.example",
    });
    const { core, ensuredRelations } = createCore(repository);

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const data = useCoreFollowers(() => target);
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(data().data).toEqual(["carol"]);
              });
              expect(ensuredRelations).toContainEqual({
                query: { kinds: [kinds.Contacts], tags: { p: [target] } },
                relays: undefined,
              });
              expect(ensuredRelations).toContainEqual({
                query: {
                  kinds: [kinds.Contacts],
                  authors: ["bob", "carol"],
                },
                relays: undefined,
              });
              expect(ensuredRelations.length).toBeLessThanOrEqual(3);
              dispose();
              resolve();
            });
            return null;
          },
        });
      });
    });
  });

  test("subscribes list hooks to EventStore updates", async () => {
    const repository = new MemoryNostrRepository();
    const { core } = createCore(repository);
    const muteList = createEvent({
      id: "mute-1",
      kind: kinds.Mutelist,
      pubkey: "alice",
      tags: [["p", "mallory"]],
      created_at: 12,
    });

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const data = useCoreEventList(() => ({
              kinds: [kinds.Mutelist],
              authors: ["alice"],
              limit: 1,
            }));
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(data().data).toEqual(undefined);
              });
              await repository.putEvent({
                event: muteList,
                relay: "wss://relay.example",
              });

              await vi.waitFor(() => {
                expect(data().data?.raw.id).toBe(muteList.id);
              });
              expect(data().data?.parsed.publicItems.users).toEqual([
                "mallory",
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

  test("returns emoji sets referenced by a user emoji list", async () => {
    const repository = new MemoryNostrRepository();
    const emojiSet = createEvent({
      id: "emoji-set-1",
      kind: kinds.Emojisets,
      pubkey: "emoji-author",
      tags: [
        ["d", "default"],
        ["emoji", "blob", "https://example.com/blob.png"],
      ],
      created_at: 10,
    });
    await repository.putEvent({
      event: emojiSet,
      relay: "wss://relay.example",
    });
    const { core, ensuredRelations } = createCore(repository);

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const sets = useCoreEmojiSets(() => [
              { pubkey: "emoji-author", tag: "default" },
            ]);
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(sets().map((packet) => packet.data?.raw.id)).toEqual([
                  emojiSet.id,
                ]);
              });
              expect(sets()[0]?.data?.parsed.emojis[0]?.name).toBe("blob");
              expect(ensuredRelations).toEqual([
                {
                  query: {
                    kinds: [kinds.Emojisets],
                    authors: ["emoji-author"],
                    tags: { d: ["default"] },
                    limit: 1,
                  },
                  relays: undefined,
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

  test("returns one emoji set packet for each referenced replaceable query", async () => {
    const repository = new MemoryNostrRepository();
    const firstSet = createEvent({
      id: "emoji-set-first",
      kind: kinds.Emojisets,
      pubkey: "emoji-author",
      tags: [
        ["d", "first"],
        ["emoji", "first", "https://example.com/first.png"],
      ],
      created_at: 10,
    });
    const secondSet = createEvent({
      id: "emoji-set-second",
      kind: kinds.Emojisets,
      pubkey: "emoji-author",
      tags: [
        ["d", "second"],
        ["emoji", "second", "https://example.com/second.png"],
      ],
      created_at: 20,
    });
    await repository.putEvent({
      event: firstSet,
      relay: "wss://relay.example",
    });
    await repository.putEvent({
      event: secondSet,
      relay: "wss://relay.example",
    });
    const { core } = createCore(repository);

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const sets = useCoreEmojiSets(() => [
              { pubkey: "emoji-author", tag: "first" },
              { pubkey: "emoji-author", tag: "second" },
            ]);
            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(sets().map((packet) => packet.data?.raw.id)).toEqual([
                  firstSet.id,
                  secondSet.id,
                ]);
              });
              dispose();
              resolve();
            });
            return null;
          },
        });
      });
    });
  });

  test("returns EventStore-derived profiles as the legacy user list shape", async () => {
    const repository = new MemoryNostrRepository();
    const profile = createEvent({
      id: "profile-alice",
      kind: kinds.Metadata,
      pubkey: "alice",
      content: JSON.stringify({
        name: "alice",
        display_name: "Alice",
        displayName: "Alice deprecated",
        username: "alice-deprecated",
        about: "legacy metadata shape",
        picture: "https://example.com/alice.png",
        banner: "https://example.com/banner.png",
        website: "https://example.com",
        bot: "true",
        lud06: "lnurl1test",
        lud16: "alice@example.com",
      }),
      tags: [["alt", "metadata"]],
      created_at: 20,
      sig: "profile-sig",
    });
    const { core } = createCore(repository);

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const users = useCoreUserList();
            queueMicrotask(async () => {
              expect(users()).toEqual([]);

              await repository.putEvent({
                event: profile,
                relay: "wss://relay.example",
              });

              await vi.waitFor(() => {
                expect(users().map((user) => user.data?.raw.id)).toEqual([
                  profile.id,
                ]);
              });
              expect(users()[0]?.data?.raw).toEqual(profile);
              expect(users()[0]?.data?.parsed.name).toBe("alice");
              expect(users()[0]?.data?.parsed.display_name).toBe("Alice");
              expect(users()[0]?.data?.parsed.displayName).toBe(
                "Alice deprecated",
              );
              expect(users()[0]?.data?.parsed.username).toBe(
                "alice-deprecated",
              );
              expect(users()[0]?.data?.parsed.about).toBe(
                "legacy metadata shape",
              );
              expect(users()[0]?.data?.parsed.banner).toBe(
                "https://example.com/banner.png",
              );
              expect(users()[0]?.data?.parsed.website).toBe(
                "https://example.com",
              );
              expect(users()[0]?.data?.parsed.bot).toBe(true);
              expect(users()[0]?.data?.parsed.lud06).toBe("lnurl1test");
              expect(users()[0]?.data?.parsed.lud16).toBe("alice@example.com");
              expect(users()[0]?.dataUpdatedAt).toBeGreaterThan(0);
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
