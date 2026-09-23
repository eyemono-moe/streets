import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { eventEngagements } from "./event-engagements";

const TARGET = "a".repeat(64);
const PARENT = "b".repeat(64);
const VIEWER = "c".repeat(64);
const OTHER = "d".repeat(64);

const event = (
  id: string,
  kind: number,
  pubkey: string,
  tags: string[][],
  content = "",
): NostrEvent => ({
  id,
  kind,
  pubkey,
  tags,
  content,
  created_at: 1,
  sig: "e".repeat(128),
});

describe("eventEngagements", () => {
  it("直接返信だけを数え、root を共有する子孫を混ぜない", () => {
    const direct = event("1".repeat(64), 1, OTHER, [
      ["e", TARGET, "", "root", VIEWER],
    ]);
    const descendant = event("2".repeat(64), 1, OTHER, [
      ["e", TARGET, "", "root", VIEWER],
      ["e", PARENT, "", "reply", OTHER],
    ]);
    const store = {
      eventsByTag: () => [direct, descendant],
    };

    // 捕まえる変異: kind:1 で targetId の e タグを持つものを無条件に数える（返信の返信まで「直接返信」に混ざる）。
    expect(eventEngagements(store, TARGET, VIEWER).replies).toBe(1);
  });

  it("リポストとLikeだけを数え、viewer自身の状態も返す", () => {
    const viewerRepost = event("3".repeat(64), 6, VIEWER, [
      ["e", TARGET],
      ["p", OTHER],
    ]);
    const otherRepost = event("4".repeat(64), 6, OTHER, [["e", TARGET]]);
    const viewerLike = event(
      "5".repeat(64),
      7,
      VIEWER,
      [
        ["e", TARGET],
        ["p", OTHER],
        ["k", "1"],
      ],
      "+",
    );
    const textReaction = event(
      "6".repeat(64),
      7,
      OTHER,
      [
        ["e", TARGET],
        ["p", OTHER],
        ["k", "1"],
      ],
      "🔥",
    );
    const store = {
      eventsByTag: () => [viewerRepost, otherRepost, viewerLike, textReaction],
    };

    const result = eventEngagements(store, TARGET, VIEWER);
    // 捕まえる変異: 全 kind:7 をハート件数へ加える（任意絵文字のチップと Like のハートを区別できなくなる）。
    expect(result).toEqual({
      replies: 0,
      reposts: 2,
      likes: 1,
      viewerReposted: true,
      viewerLiked: true,
    });
  });
});
