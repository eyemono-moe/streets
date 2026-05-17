import type { NostrEvent } from "nostr-tools";
import { describe, expect, it, vi } from "vitest";
import { MemoryFeedStateStore } from "./memory-feed-state-store";

const event = (
  overrides: Partial<NostrEvent> & { id: string },
): NostrEvent => ({
  id: overrides.id,
  pubkey: overrides.pubkey ?? "pubkey-a",
  created_at: overrides.created_at ?? 100,
  kind: overrides.kind ?? 1,
  tags: overrides.tags ?? [],
  content: overrides.content ?? "",
  sig: overrides.sig ?? `${overrides.id}-sig`,
});

describe("MemoryFeedStateStore", () => {
  it("stores feed membership separately from raw events and orders newest first", () => {
    const store = new MemoryFeedStateStore();
    const older = event({ id: "older", created_at: 100 });
    const newer = event({ id: "newer", created_at: 200 });

    store.addItem("home", older);
    store.addItem("home", newer);
    store.addItem("profile:alice", older);

    expect(store.getSnapshot("home").eventIds).toEqual(["newer", "older"]);
    expect(store.getSnapshot("profile:alice").eventIds).toEqual(["older"]);
  });

  it("deduplicates feed items and updates cursors", () => {
    const store = new MemoryFeedStateStore();
    const note = event({ id: "note", created_at: 100 });

    store.addItem("home", note);
    store.addItem("home", note);

    expect(store.getSnapshot("home")).toMatchObject({
      eventIds: ["note"],
      oldestCreatedAt: 100,
      newestCreatedAt: 100,
    });
  });

  it("notifies only listeners for the changed feed", () => {
    const store = new MemoryFeedStateStore();
    const homeListener = vi.fn();
    const otherListener = vi.fn();

    store.subscribe("home", homeListener);
    store.subscribe("other", otherListener);
    store.setStatus("home", "loading", {
      activeRelays: ["wss://relay-a"],
    });

    expect(homeListener).toHaveBeenCalledTimes(1);
    expect(otherListener).not.toHaveBeenCalled();
    expect(store.getSnapshot("home")).toMatchObject({
      status: "loading",
      activeRelays: ["wss://relay-a"],
    });
  });

  it("lists feed snapshots for devtools in stable order", () => {
    const store = new MemoryFeedStateStore();
    store.addItem("profile:alice", event({ id: "profile-note" }));
    store.setStatus("home", "loading", {
      activeRelays: ["wss://relay-a"],
    });

    expect(store.listSnapshots().map((snapshot) => snapshot.feedId)).toEqual([
      "home",
      "profile:alice",
    ]);
    expect(store.listSnapshots()[0]).toMatchObject({
      feedId: "home",
      status: "loading",
      activeRelays: ["wss://relay-a"],
    });
  });
});
