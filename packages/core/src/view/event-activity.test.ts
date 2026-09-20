import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { eventActivity } from "./event-activity";

const TARGET = "a".repeat(64);
const event = (kind: number, pubkey: string, tags: string[][], content = "") =>
  ({
    id: `${kind}`.padStart(64, "0"),
    pubkey,
    kind,
    tags,
    content,
    created_at: 1,
    sig: "b".repeat(128),
  }) satisfies NostrEvent;

describe("eventActivity", () => {
  it("操作を種類ごとに分け、同じ利用者を重複させない", () => {
    const result = eventActivity(
      [
        event(6, "reposter", [["e", TARGET]]),
        event(6, "reposter", [["e", TARGET]]),
        event(1, "quoter", [["q", TARGET]]),
        event(7, "reactor", [["e", TARGET]], "+"),
        event(7, "reactor", [["e", TARGET]], "🎉"),
      ],
      TARGET,
    );

    expect(result.reposts).toEqual(["reposter"]);
    expect(result.quotes).toEqual(["quoter"]);
    expect(result.reactions).toEqual([
      {
        pubkey: "reactor",
        contents: [{ type: "like" }, { type: "text", content: "🎉" }],
      },
    ]);
  });

  it("別の対象や壊れたイベントを含めない", () => {
    expect(
      eventActivity(
        [
          event(6, "other", [["e", "c".repeat(64)]]),
          event(7, "broken", [], "+"),
        ],
        TARGET,
      ),
    ).toEqual({ reposts: [], quotes: [], reactions: [] });
  });
});
