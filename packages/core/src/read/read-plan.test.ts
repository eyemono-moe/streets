import { describe, expect, it } from "vitest";
import { summarizeReadPlan } from "./read-plan";

const fallbackRelays = ["wss://fallback/"];

describe("summarizeReadPlan", () => {
  it("著者ごとに選んだリレーを、読む人の多い順に並べる", () => {
    const plan = summarizeReadPlan({
      mode: "outbox",
      fallbackRelays,
      sections: [
        {
          explicit: false,
          perRelay: new Map([
            ["wss://a/", [{ kinds: [1], authors: ["p1"] }]],
            ["wss://b/", [{ kinds: [1], authors: ["p1", "p2"] }]],
          ]),
          unroutableAuthors: [],
          uncoveredAuthors: [],
        },
      ],
    });
    expect(plan.relays).toEqual([
      { url: "wss://b/", authors: 2, fallback: false, explicit: false },
      { url: "wss://a/", authors: 1, fallback: false, explicit: false },
    ]);
  });

  it("同じ人を複数のカラムが読んでいても 1 人と数える", () => {
    const section = {
      explicit: false,
      perRelay: new Map([["wss://a/", [{ kinds: [1], authors: ["p1"] }]]]),
      unroutableAuthors: [],
      uncoveredAuthors: ["p9"],
    };
    const plan = summarizeReadPlan({
      mode: "outbox",
      fallbackRelays,
      sections: [section, section],
    });
    expect(plan.relays[0].authors).toBe(1);
    expect(plan.uncoveredAuthors).toBe(1);
  });

  it("リレーの設定が分からない人は、既定のリレーの理由として数え、読む人には数えない", () => {
    const plan = summarizeReadPlan({
      mode: "outbox",
      fallbackRelays,
      sections: [
        {
          explicit: false,
          perRelay: new Map([
            ["wss://fallback/", [{ kinds: [1], authors: ["p1"] }]],
          ]),
          unroutableAuthors: ["p1"],
          uncoveredAuthors: [],
        },
      ],
    });
    expect(plan.relays).toEqual([
      { url: "wss://fallback/", authors: 0, fallback: true, explicit: false },
    ]);
    expect(plan.unroutableAuthors).toBe(1);
  });

  it("人を決めない読み取りは既定のリレーとして扱う", () => {
    const plan = summarizeReadPlan({
      mode: "outbox",
      fallbackRelays,
      sections: [
        {
          explicit: false,
          perRelay: new Map([["wss://fallback/", [{ "#e": ["x"] }]]]),
          unroutableAuthors: [],
          uncoveredAuthors: [],
        },
      ],
    });
    expect(plan.relays[0].fallback).toBe(true);
  });

  it("名指しのリレーは名指しとだけ記す", () => {
    const plan = summarizeReadPlan({
      mode: "outbox",
      fallbackRelays,
      sections: [
        {
          explicit: true,
          perRelay: new Map([["wss://mine/", [{ "#p": ["me"] }]]]),
          unroutableAuthors: [],
          uncoveredAuthors: [],
        },
      ],
    });
    expect(plan.relays).toEqual([
      { url: "wss://mine/", authors: 0, fallback: false, explicit: true },
    ]);
  });

  it("読み込みリレーだけのときは、全員をそのリレーの読む人に数える", () => {
    const plan = summarizeReadPlan({
      mode: "direct",
      fallbackRelays: ["wss://mine/"],
      sections: [
        {
          explicit: false,
          perRelay: new Map([
            [
              "wss://mine/",
              [{ kinds: [1], authors: ["p1", "p2"] }, { "#e": ["x"] }],
            ],
          ]),
          unroutableAuthors: [],
          uncoveredAuthors: [],
        },
      ],
    });
    expect(plan).toEqual({
      mode: "direct",
      relays: [
        { url: "wss://mine/", authors: 2, fallback: false, explicit: false },
      ],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    });
  });
});
