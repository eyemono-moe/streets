import { describe, expect, it } from "vite-plus/test";
import { chatModeration } from "../nostr/channel";
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import {
  channelReadRelays,
  chatReplyTransition,
  chatRows,
  emptyChatReply,
} from "./chat";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const VIEWER = "f".repeat(64);
// 端末の時刻帯に左右されないよう、日付は Date から作る。
const at = (day: number, hour: number, minute = 0) =>
  Math.floor(new Date(2026, 8, day, hour, minute).getTime() / 1000);

let seq = 0;
const message = (pubkey: string, created_at: number): NostrEvent =>
  ({
    id: `${++seq}`.padStart(64, "0"),
    pubkey,
    created_at,
    kind: 42,
    tags: [],
    content: "",
    sig: "c".repeat(128),
  }) as NostrEvent;

const kinds = (rows: ReturnType<typeof chatRows>) =>
  rows.map((row) =>
    row.type === "day" ? "day" : row.continued ? "cont" : "msg",
  );

describe("chatRows", () => {
  it("古い順に並べ、日付が変わるところに区切りを入れる", () => {
    const later = message(ALICE, at(2, 9));
    const earlier = message(ALICE, at(1, 23));
    // 捕まえる変異: 受け取った順（新しい順）のまま並べる
    const rows = chatRows([later, earlier], chatModeration([]), VIEWER);
    expect(kinds(rows)).toEqual(["day", "msg", "day", "msg"]);
    expect(rows[1]).toMatchObject({ event: earlier });
  });

  it("同じ人が 5 分以内に続けたものだけを続きにする", () => {
    const rows = chatRows(
      [
        message(ALICE, at(1, 10, 0)),
        message(ALICE, at(1, 10, 4)),
        message(ALICE, at(1, 10, 20)),
        message(BOB, at(1, 10, 21)),
      ],
      chatModeration([]),
      VIEWER,
    );
    expect(kinds(rows)).toEqual(["day", "msg", "cont", "msg", "msg"]);
  });

  it("畳む発言は続きにせず、その次の発言も名前を出し直す", () => {
    const first = message(ALICE, at(1, 10, 0));
    const hidden = message(ALICE, at(1, 10, 1));
    const after = message(ALICE, at(1, 10, 2));
    const rows = chatRows(
      [first, hidden, after],
      chatModeration([
        {
          ...message(BOB, at(1, 11)),
          kind: 43,
          tags: [["e", hidden.id]],
        },
      ]),
      VIEWER,
    );
    // 捕まえる変異: 畳んだ行をまたいで続きにする（誰の発言か分からなくなる）
    expect(kinds(rows)).toEqual(["day", "msg", "msg", "msg"]);
    expect(rows[2]).toMatchObject({ visibility: "muted-by-others" });
  });
});

describe("channelReadRelays", () => {
  const url = (host: string) => `wss://${host}/` as RelayUrl;

  it("チャンネルの情報のリレーとヒントを使い、自分のリレーは足さない", () => {
    expect(
      channelReadRelays({
        metadata: [url("a")],
        hints: [url("b"), url("a")],
        viewerRead: [url("mine")],
      }),
    ).toEqual([url("a"), url("b")]);
  });

  it("何も分からなければ自分の読み込みリレーで探す", () => {
    expect(
      channelReadRelays({ metadata: [], hints: [], viewerRead: [url("mine")] }),
    ).toEqual([url("mine")]);
  });

  it("本数に上限を切る", () => {
    // 捕まえる変異: 上限を切らない（明示リレーは予算から落ちず、接続を食い潰す）
    expect(
      channelReadRelays({
        metadata: ["a", "b", "c", "d", "e", "f"].map(url),
        hints: [],
        viewerRead: [],
      }),
    ).toHaveLength(5);
  });
});

describe("chatReplyTransition", () => {
  it("返信先を選び、取り消すと外れる", () => {
    const replying = chatReplyTransition(emptyChatReply(), {
      type: "chat/reply",
      target: "x",
    });
    expect(replying).toEqual({ replyTo: "x" });
    expect(
      chatReplyTransition(replying, { type: "chat/cancel-reply" }),
    ).toEqual({});
  });

  it("送れたら返信先を外す", () => {
    // 捕まえる変異: 送れても返信先を残す（続けて書くと同じ人への返信になる）
    expect(
      chatReplyTransition({ replyTo: "x" }, { type: "compose/sent" }),
    ).toEqual({});
  });
});
