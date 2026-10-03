import { createRoot } from "solid-js";
import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { FALLBACK_RELAYS } from "../read/default-relays";
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

const storeOf = (events: NostrEvent[], seen: Record<string, string[]> = {}) =>
  ({
    get: (id: string) => events.find((event) => event.id === id),
    seenRelays: (id: string) => seen[id] ?? [],
  }) as unknown as EventStore;

describe("createThreadSource", () => {
  it("コメントを開くと、大文字の E の根を起点に投稿とコメントの両方を取る", () => {
    createRoot((dispose) => {
      const thread = createThreadSource({
        focusId: () => FOCUS,
        store: storeOf([comment]),
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

  it("記事へのコメントを開くと、同じ記事へのコメントを住所で集める", () => {
    const address = `30023:${"8".repeat(64)}:post`;
    const onArticle: NostrEvent = {
      ...comment,
      tags: [
        ["A", address],
        ["K", "30023"],
        ["e", PARENT, "", "d".repeat(64)],
        ["k", "1111"],
      ],
    };
    createRoot((dispose) => {
      const thread = createThreadSource({
        focusId: () => FOCUS,
        store: storeOf([onArticle]),
        columnRelays: () => undefined,
        relaysOverride: undefined,
      });
      // 捕まえる変異: 住所で集めない（記事へのコメントの祖先が取れず、上が欠ける）
      expect(thread.source().filters).toContainEqual({
        kinds: [1111],
        "#A": [address],
      });
      dispose();
    });
  });

  it("焦点を受け取ったリレーにも、根と返信を聞きに行く", () => {
    const note: NostrEvent = { ...comment, kind: 1, tags: [] };
    createRoot((dispose) => {
      const thread = createThreadSource({
        focusId: () => FOCUS,
        // 書いたばかりの投稿などは、リレーでない印で入っている。
        store: storeOf([note], {
          [FOCUS]: ["wss://search.example", "local"],
        }),
        columnRelays: () => undefined,
        relaysOverride: undefined,
      });
      // 捕まえる変異: 受け取ったリレーを見ない（検索リレーにしか無い投稿の根が取れない）
      // 捕まえる変異: 既定の fallback を落とす（受け取ったリレーだけに絞られる）
      expect(thread.source().relays).toEqual([
        ...FALLBACK_RELAYS,
        "wss://search.example/",
      ]);
      dispose();
    });
  });
});
