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

const reaction = (id: string, pubkey: string, content: string) =>
  event(
    id.repeat(64),
    7,
    pubkey,
    [
      ["e", TARGET],
      ["p", OTHER],
      ["k", "1"],
    ],
    content,
  );

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

  it("リポストと、中身を問わないリアクションの総数を数え、viewer自身の状態も返す", () => {
    const viewerRepost = event("3".repeat(64), 6, VIEWER, [
      ["e", TARGET],
      ["p", OTHER],
    ]);
    const otherRepost = event("4".repeat(64), 6, OTHER, [["e", TARGET]]);
    const store = {
      eventsByTag: () => [
        viewerRepost,
        otherRepost,
        reaction("5", VIEWER, "+"),
        reaction("6", OTHER, "🔥"),
        reaction("7", OTHER, "-"),
      ],
    };

    const result = eventEngagements(store, TARGET, VIEWER);
    // 捕まえる変異: `+` だけを数える（ボタンの数字が絵文字のリアクションを落とす）。
    expect(result).toEqual({
      replies: 0,
      reposts: 2,
      reactions: 3,
      viewerReposted: true,
      viewerReacted: true,
    });
  });

  it("ボタンで送る中身と同じものを自分が送ったときだけ「済み」にする", () => {
    const store = {
      eventsByTag: () => [
        reaction("5", VIEWER, "+"),
        reaction("6", OTHER, "🔥"),
      ],
    };

    // 捕まえる変異: 自分のリアクションなら中身を問わず済みにする（既定を 🔥 に変えると、前の `+` で押せなくなる）。
    expect(
      eventEngagements(store, TARGET, VIEWER, { type: "text", content: "🔥" })
        .viewerReacted,
    ).toBe(false);
    expect(
      eventEngagements(store, TARGET, VIEWER, { type: "like" }).viewerReacted,
    ).toBe(true);
  });

  it("カスタム絵文字はショートコードで突き合わせる", () => {
    const custom = event(
      "8".repeat(64),
      7,
      VIEWER,
      [
        ["e", TARGET],
        ["emoji", "wave", "https://a.example/wave.png"],
      ],
      ":wave:",
    );
    const store = { eventsByTag: () => [custom] };

    // 捕まえる変異: URL まで比べる（チップの山と、ボタンの済みが食い違う）。
    expect(
      eventEngagements(store, TARGET, VIEWER, {
        type: "emoji",
        name: "wave",
        url: "https://b.example/wave.png",
      }).viewerReacted,
    ).toBe(true);
  });

  it("返信の祖先として e タグに載っているだけのリアクションは数えない", () => {
    const ancestor = event(
      "9".repeat(64),
      7,
      OTHER,
      [
        ["e", TARGET],
        ["e", PARENT],
      ],
      "+",
    );
    const store = { eventsByTag: () => [ancestor] };

    expect(eventEngagements(store, TARGET, VIEWER).reactions).toBe(0);
  });
});
