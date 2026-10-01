import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "./event";
import {
  buildPollResponse,
  parsePoll,
  pollDeadlineLabel,
  tallyPoll,
} from "./poll";

const POLL_ID = "a".repeat(64);

const event = (
  kind: number,
  tags: string[][],
  pubkey = "b".repeat(64),
  created_at = 100,
  content = "",
): NostrEvent => ({
  id:
    kind === 1068
      ? POLL_ID
      : `${pubkey.slice(0, 32)}${created_at}`.padEnd(64, "0"),
  pubkey,
  created_at,
  kind,
  tags,
  content,
  sig: "0".repeat(128),
});

const pollEvent = (extra: string[][] = []) =>
  event(
    1068,
    [["option", "yay1", "Yay"], ["option", "nay1", "Nay"], ...extra],
    "c".repeat(64),
    50,
    "Pineapple on pizza",
  );

const vote = (pubkey: string, created_at: number, ...choices: string[]) =>
  event(
    1018,
    [["e", POLL_ID], ...choices.map((id) => ["response", id])],
    pubkey,
    created_at,
  );

describe("parsePoll", () => {
  it("問い・選択肢・種類・締め切り・リレーを読む", () => {
    const poll = parsePoll(
      pollEvent([
        ["polltype", "multiplechoice"],
        ["endsAt", "1000"],
        ["relay", "wss://a.example"],
        ["relay", "https://not-a-relay.example"],
      ]),
    );
    expect(poll).toEqual({
      id: POLL_ID,
      question: "Pineapple on pizza",
      options: [
        { id: "yay1", label: "Yay" },
        { id: "nay1", label: "Nay" },
      ],
      multiple: true,
      endsAt: 1000,
      relays: ["wss://a.example/"],
    });
  });

  it("polltype が無ければ 1 つ選ぶ投票", () => {
    expect(parsePoll(pollEvent())?.multiple).toBe(false);
  });

  it("リレーは 3 件までにする", () => {
    // 捕まえる変異: 投票が指すリレーを全部開き、同時接続の枠を食いつぶす
    const relays = Array.from({ length: 5 }, (_, i) => [
      "relay",
      `wss://r${i}.example`,
    ]);
    expect(parsePoll(pollEvent(relays))?.relays).toHaveLength(3);
  });

  it("選択肢が無ければ投票として読まない", () => {
    expect(parsePoll(event(1068, []))).toBeUndefined();
  });
});

describe("tallyPoll", () => {
  const alice = "1".repeat(64);
  const bob = "2".repeat(64);

  it("1 人につき最新の回答だけを数える", () => {
    // 捕まえる変異: 回答を全部数え、気が変わった人の票が 2 票になる
    const poll = parsePoll(pollEvent());
    if (!poll) throw new Error("poll");
    const tally = tallyPoll(poll, [
      vote(alice, 100, "yay1"),
      vote(alice, 200, "nay1"),
      vote(bob, 150, "nay1"),
    ]);
    expect(tally.counts).toEqual({ yay1: 0, nay1: 2 });
    expect(tally.voters).toBe(2);
  });

  it("1 つ選ぶ投票では最初の選択肢だけ、複数選ぶ投票では重複を除いて全部数える", () => {
    const single = parsePoll(pollEvent());
    const multiple = parsePoll(pollEvent([["polltype", "multiplechoice"]]));
    if (!single || !multiple) throw new Error("poll");
    const responses = [vote(alice, 100, "nay1", "yay1", "nay1")];
    expect(tallyPoll(single, responses).counts).toEqual({ yay1: 0, nay1: 1 });
    expect(tallyPoll(multiple, responses).counts).toEqual({
      yay1: 1,
      nay1: 1,
    });
  });

  it("締め切りの後の回答と、知らない選択肢だけの回答は数えない", () => {
    const poll = parsePoll(pollEvent([["endsAt", "150"]]));
    if (!poll) throw new Error("poll");
    const tally = tallyPoll(poll, [
      vote(alice, 100, "yay1"),
      vote(alice, 200, "nay1"),
      vote(bob, 120, "unknown"),
    ]);
    expect(tally.counts).toEqual({ yay1: 1, nay1: 0 });
    expect(tally.voters).toBe(1);
  });

  it("見ている人の選んだものを返す", () => {
    const poll = parsePoll(pollEvent());
    if (!poll) throw new Error("poll");
    expect(tallyPoll(poll, [vote(alice, 100, "nay1")], alice).mine).toEqual([
      "nay1",
    ]);
    expect(tallyPoll(poll, [], alice).mine).toBeUndefined();
  });
});

describe("buildPollResponse", () => {
  it("1 つ選ぶ投票には 1 つだけ書く", () => {
    const poll = parsePoll(pollEvent());
    if (!poll) throw new Error("poll");
    expect(buildPollResponse(poll, ["nay1", "yay1"]).tags).toEqual([
      ["e", POLL_ID],
      ["response", "nay1"],
    ]);
  });
});

describe("pollDeadlineLabel", () => {
  it("残りを日・時間・分で、過ぎたら締め切りと出す", () => {
    const poll = parsePoll(pollEvent([["endsAt", "200000"]]));
    if (!poll) throw new Error("poll");
    expect(pollDeadlineLabel(poll, 200_000 - 2 * 86_400 - 5)).toBe("あと 2 日");
    expect(pollDeadlineLabel(poll, 200_000 - 5 * 3600)).toBe("あと 5 時間");
    expect(pollDeadlineLabel(poll, 200_000 - 30)).toBe("あと 1 分");
    expect(pollDeadlineLabel(poll, 200_000)).toBe("締め切りました");
  });
});
