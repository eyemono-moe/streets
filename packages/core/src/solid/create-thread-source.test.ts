import { createRoot } from "solid-js";
import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import type { EventStore } from "../read/event-store";
import { createThreadSource } from "./create-thread-source";

const ROOT = "1".repeat(64);
const PARENT = "2".repeat(64);
const FOCUS = "3".repeat(64);

const comment: NostrEvent = {
  id: FOCUS,
  pubkey: "b".repeat(64),
  created_at: 0,
  kind: 1111,
  tags: [
    ["E", ROOT, "wss://root.example/", "c".repeat(64)],
    ["K", "1"],
    ["e", PARENT, "", "d".repeat(64)],
    ["k", "1111"],
  ],
  content: "",
  sig: "",
};

const storeOf = (...events: NostrEvent[]) =>
  ({
    get: (id: string) => events.find((event) => event.id === id),
  }) as unknown as EventStore;

describe("createThreadSource", () => {
  it("コメントを開くと、大文字の E の根を起点に投稿とコメントの両方を取る", () => {
    createRoot((dispose) => {
      const thread = createThreadSource({
        focusId: () => FOCUS,
        store: storeOf(comment),
        columnRelays: () => undefined,
        relaysOverride: undefined,
      });
      // 捕まえる変異: 根を小文字の e から取る（親のコメントを根とみなし、上が欠ける）
      expect(thread.rootId()).toBe(ROOT);
      // 捕まえる変異: kind:1 の #e だけを取る（返信への返信になったコメントは #e に根を持たない）
      expect(thread.source().filters).toEqual([
        { ids: [ROOT] },
        { kinds: [1], "#e": [ROOT] },
        { kinds: [1111], "#E": [ROOT] },
      ]);
      expect(thread.relayHints()).toContain("wss://root.example/");
      dispose();
    });
  });
});
