import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import {
  groupActors,
  groupReactionContents,
  notificationRows,
} from "./notification-rows";

const hex = (seed: string) => seed.repeat(64).slice(0, 64);

// 並べる順（新しい順）は呼ぶ順で決める。id は連番で衝突させない。
let serial = 0;
const event = (
  kind: number,
  pubkey: string,
  tags: string[][],
  content = "",
): NostrEvent => {
  serial += 1;
  return {
    id: serial.toString(16).padStart(64, "0"),
    pubkey: hex(pubkey),
    created_at: 1_720_000_000 - serial,
    kind,
    tags,
    content,
    sig: "",
  };
};

const noteA = hex("a");
const noteB = hex("b");
const reaction = (pubkey: string, target: string, content = "+") =>
  event(
    7,
    pubkey,
    [
      ["e", target],
      ["p", hex("f")],
    ],
    content,
  );
const repost = (pubkey: string, target: string) =>
  event(6, pubkey, [
    ["e", target],
    ["p", hex("f")],
  ]);
const reply = (pubkey: string, target: string) =>
  event(1, pubkey, [["e", target, "", "root"]], "返信");

describe("notificationRows", () => {
  it("まとめないときは、1 件ずつの行にする", () => {
    const events = [reaction("1", noteA), reaction("2", noteA)];
    expect(notificationRows(events, false).map((row) => row.type)).toEqual([
      "event",
      "event",
    ]);
  });

  it("隣り合う同じノートへのリアクションを 1 行にまとめる", () => {
    const events = [
      reaction("1", noteA),
      reaction("2", noteA, "🥰"),
      reaction("3", noteA),
    ];
    const rows = notificationRows(events, true);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.type === "group" && row.events).toEqual(events);
    expect(row?.type === "group" && row.action).toBe("reaction");
  });

  it("間に別の通知が挟まったら、そこで切る", () => {
    const events = [
      reaction("1", noteA),
      reply("9", noteA),
      reaction("2", noteA),
      reaction("3", noteA),
    ];
    expect(notificationRows(events, true).map((row) => row.type)).toEqual([
      "event",
      "event",
      "group",
    ]);
  });

  it("リアクションとリポストは別々にまとめる", () => {
    const events = [
      reaction("1", noteA),
      reaction("2", noteA),
      repost("3", noteA),
      repost("4", noteA),
    ];
    const rows = notificationRows(events, true);
    expect(rows.map((row) => row.type === "group" && row.action)).toEqual([
      "reaction",
      "repost",
    ]);
  });

  it("対象のノートが違えば、まとめない", () => {
    const events = [reaction("1", noteA), reaction("2", noteB)];
    expect(notificationRows(events, true).map((row) => row.type)).toEqual([
      "event",
      "event",
    ]);
  });

  it("まとまりの鍵は、新しい通知が上に足されても変わらない", () => {
    const older = [reaction("2", noteA), reaction("3", noteA)];
    const before = notificationRows(older, true)[0]?.key;
    const after = notificationRows([reaction("1", noteA), ...older], true)[0]
      ?.key;
    expect(after).toBe(before);
  });

  it("対象が読めないリアクションは、まとめずにそのまま出す", () => {
    const broken = event(7, "1", [], "+");
    const events = [broken, reaction("2", noteA)];
    expect(notificationRows(events, true).map((row) => row.type)).toEqual([
      "event",
      "event",
    ]);
  });
});

describe("groupActors", () => {
  it("同じ人は 1 人と数え、新しい順に並べる", () => {
    const events = [
      reaction("1", noteA, "🥰"),
      reaction("2", noteA),
      reaction("1", noteA),
    ];
    expect(groupActors(events)).toEqual([hex("1"), hex("2")]);
  });
});

describe("groupReactionContents", () => {
  it("同じ絵文字は 1 つにまとめ、新しい順に並べる", () => {
    const events = [
      reaction("1", noteA, "🥰"),
      reaction("2", noteA, "+"),
      reaction("3", noteA, "🥰"),
      reaction("4", noteA, ""),
    ];
    expect(groupReactionContents(events)).toEqual([
      { type: "text", content: "🥰" },
      { type: "like" },
    ]);
  });
});
