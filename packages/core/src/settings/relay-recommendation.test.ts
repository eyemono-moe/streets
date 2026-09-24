import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import {
  countFolloweeRelays,
  discoveryFilter,
  latestDiscoveries,
  parseRelayDiscovery,
  recommendRelays,
  scoreRelay,
  topCandidates,
} from "./relay-recommendation";

const A = "wss://a.example/" as RelayUrl;
const B = "wss://b.example/" as RelayUrl;
const C = "wss://c.example/" as RelayUrl;

const discovery = (
  tags: string[][],
  createdAt = 1_700_000_000,
): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: createdAt,
  kind: 30166,
  tags,
  content: "",
  sig: "c".repeat(128),
});

describe("parseRelayDiscovery", () => {
  it("応答時間・対応 NIP・要件を読む", () => {
    expect(
      parseRelayDiscovery(
        discovery([
          ["d", "wss://a.example"],
          ["rtt-open", "120"],
          ["rtt-read", "240"],
          ["N", "11"],
          ["N", "1"],
          ["N", "1"],
          ["N", "x"],
          ["R", "!payment"],
          ["R", "auth"],
        ]),
      ),
    ).toEqual({
      url: A,
      rttOpen: 120,
      rttRead: 240,
      nips: [1, 11],
      payment: false,
      auth: true,
      measuredAt: 1_700_000_000,
    });
  });

  it("d がリレーの URL でなければ捨てる", () => {
    expect(
      parseRelayDiscovery(discovery([["d", "not a url"]])),
    ).toBeUndefined();
  });

  it("同じリレーの計測は新しいものを使う", () => {
    const latest = latestDiscoveries([
      discovery(
        [
          ["d", A],
          ["rtt-open", "900"],
        ],
        10,
      ),
      discovery(
        [
          ["d", "wss://a.example"],
          ["rtt-open", "100"],
        ],
        20,
      ),
    ]);
    expect(latest.get(A)?.rttOpen).toBe(100);
  });

  it("末尾の / がある形と無い形の両方で聞く", () => {
    expect(discoveryFilter([A])["#d"]).toEqual([A, "wss://a.example"]);
  });
});

describe("フォロー中の人のリレー", () => {
  it("1 人が同じリレーを 2 回書いていても 1 人と数える", () => {
    const users = countFolloweeRelays([
      [
        { url: A, read: true, write: false },
        { url: A, read: false, write: true },
      ],
      [
        { url: A, read: true, write: true },
        { url: B, read: true, write: true },
      ],
    ]);
    expect(users).toEqual(
      new Map([
        [A, 2],
        [B, 1],
      ]),
    );
  });

  it("使っている人の多い順に候補を切り出す", () => {
    expect(
      topCandidates(
        new Map([
          [A, 1],
          [B, 5],
          [C, 5],
        ]),
        2,
      ),
    ).toEqual([B, C]);
  });
});

describe("scoreRelay", () => {
  it("フォロー中の人の半分が使っていれば、人数の点は満点", () => {
    expect(scoreRelay({ users: 50, followees: 100 }).score).toBe(60);
    expect(scoreRelay({ users: 25, followees: 100 }).score).toBe(30);
    expect(scoreRelay({ users: 0, followees: 0 }).score).toBe(0);
  });

  it("速さ・対応機能・要件で足し引きし、0〜100 に収める", () => {
    const fast = scoreRelay({
      users: 100,
      followees: 100,
      discovery: { url: A, rttRead: 200, nips: [1, 9, 11], measuredAt: 0 },
    });
    expect(fast.score).toBe(90);
    expect(fast.reasons.map((reason) => reason.type)).toEqual([
      "users",
      "latency",
      "nips",
    ]);

    const paid = scoreRelay({
      users: 10,
      followees: 100,
      discovery: {
        url: A,
        rttOpen: 5000,
        nips: [1],
        payment: true,
        auth: true,
        measuredAt: 0,
      },
    });
    expect(paid.score).toBe(0);
    expect(paid.reasons).toContainEqual({
      type: "nips",
      missing: [9, 11],
      points: 0,
    });
  });
});

describe("recommendRelays", () => {
  const input = {
    candidates: [A, B, C],
    users: new Map([
      [A, 10],
      [B, 40],
      [C, 30],
    ]),
    followees: 100,
    discoveries: new Map([
      [A, { url: A, rttRead: 100, nips: [1, 9, 11], measuredAt: 0 }],
      [C, { url: C, rttRead: 50, nips: [], measuredAt: 0 }],
    ]),
    own: [{ url: B, read: true, write: true }],
  };

  it("おすすめ度の順に並べ、自分の一覧にあるものに印を付ける", () => {
    const items = recommendRelays(input);
    expect(items.map((item) => [item.url, item.score, item.added])).toEqual([
      [C, 56, false],
      [B, 48, true],
      [A, 42, false],
    ]);
  });
});
