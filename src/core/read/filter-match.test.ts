import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";
import { matchesAnyFilter, matchesFilter } from "./filter-match";

const A = "a".repeat(64);
const B = "b".repeat(64);
const ID = "1".repeat(64);

const base: NostrEvent = {
  id: ID,
  pubkey: A,
  created_at: 1000,
  kind: 1,
  tags: [],
  content: "",
  sig: "0".repeat(128),
};
const ev = (o: Partial<NostrEvent> = {}): NostrEvent => ({ ...base, ...o });

// 期待値は手で導出したものではなく、意図した実装を実際に走らせて得た出力である
// (計画作成時に scratchpad で計算済み)。各行の「捕まえる変異」は、その主張が
// 何を守っているかを明示するためのもの — 変異を入れたらその行だけが落ちること。
describe("matchesFilter", () => {
  it.each<[string, NostrEvent, RelayFilter, boolean, string]>([
    [
      "limit だけのフィルタは全一致",
      ev(),
      { limit: 50 },
      true,
      "limit を件数条件として扱う変異",
    ],
    ["空フィルタは全一致", ev(), {}, true, "条件ゼロを不一致に倒す変異"],
    ["authors 一致", ev(), { authors: [A] }, true, "authors を無視する変異"],
    ["authors 不一致", ev(), { authors: [B] }, false, "authors を無視する変異"],
    [
      "authors: [] は何にも一致しない",
      ev(),
      { authors: [] },
      false,
      "空配列を『条件なし』として扱う変異",
    ],
    [
      "大文字 hex は一致しない",
      ev({ pubkey: A.toUpperCase() }),
      { authors: [A] },
      false,
      "toLowerCase() を挟んで緩める変異",
    ],
    [
      "since は境界を含む",
      ev({ created_at: 1000 }),
      { since: 1000 },
      true,
      ">= を > にする off-by-one",
    ],
    [
      "since の 1 つ下は不一致",
      ev({ created_at: 999 }),
      { since: 1000 },
      false,
      ">= を <= に取り違える変異",
    ],
    [
      "until は境界を含む",
      ev({ created_at: 1000 }),
      { until: 1000 },
      true,
      "<= を < にする off-by-one",
    ],
    [
      "until の 1 つ上は不一致",
      ev({ created_at: 1001 }),
      { until: 1000 },
      false,
      "until を無視する変異",
    ],
    [
      "フィルタ内は AND",
      ev(),
      { kinds: [1], authors: [B] },
      false,
      "AND を OR にする変異",
    ],
    [
      "タグは tags[i][1] を見る",
      ev({ tags: [["e", ID]] }),
      { "#e": [ID] },
      true,
      "添字の取り違え",
    ],
    [
      "タグ名は tags[i][0]",
      ev({ tags: [[ID, "e"]] }),
      { "#e": [ID] },
      false,
      "tags[i][1] でタグ名を引く変異",
    ],
    [
      "複数タグのうち 1 つ一致で足りる",
      ev({
        tags: [
          ["p", B],
          ["e", ID],
        ],
      }),
      { "#e": [ID] },
      true,
      "全タグ一致を要求する変異",
    ],
    [
      "search は照合に使わない",
      ev(),
      { search: "zzz", authors: [A] },
      true,
      "search を不一致に倒す変異",
    ],
    [
      "未知のキーは無視する",
      ev(),
      { unknownKey: "zzz", authors: [A] } as RelayFilter,
      true,
      "未知キーで捨てる変異",
    ],
    [
      "複数文字タグも扱う",
      ev({ tags: [["foo", "v"]] }),
      { "#foo": ["v"] },
      true,
      "単一文字タグ以外を無視する変異",
    ],
    [
      "複数文字タグの不一致",
      ev({ tags: [["bar", "v"]] }),
      { "#foo": ["v"] },
      false,
      "タグ名を比較しない変異",
    ],
  ])("%s", (_name, event, filter, expected) => {
    expect(matchesFilter(event, filter)).toBe(expected);
  });
});

describe("matchesAnyFilter", () => {
  it("フィルタ間は OR", () => {
    expect(matchesAnyFilter(ev(), [{ authors: [B] }, { authors: [A] }])).toBe(
      true,
    );
  });

  it("どれにも一致しなければ false", () => {
    expect(matchesAnyFilter(ev(), [{ authors: [B] }, { kinds: [7] }])).toBe(
      false,
    );
  });

  it("空のフィルタ列は何にも一致しない", () => {
    // REQ を送っていない = 何も要求していない。OR の単位元は偽。
    expect(matchesAnyFilter(ev(), [])).toBe(false);
  });
});

describe("matchesFilter は全域関数である", () => {
  // 照合器は EventStore.put の *手前* に立つので、isNostrEvent を通っていない
  // 生のワイヤデータを受け取る (websocket-relay-connection.ts:152-160)。
  // ここで投げると、そのリレーを見ている他セクションへの配信ごと巻き込む。
  it.each<[string, unknown, RelayFilter]>([
    [
      "tags が欠落",
      { id: ID, pubkey: A, created_at: 1, kind: 1 },
      { "#e": [ID] },
    ],
    ["tags が非配列", { ...base, tags: "nope" }, { "#e": [ID] }],
    ["タグ要素が非配列", { ...base, tags: ["nope"] }, { "#e": [ID] }],
    ["created_at が文字列", { ...base, created_at: "1000" }, { since: 1 }],
    ["pubkey が数値", { ...base, pubkey: 123 }, { authors: [A] }],
    ["event が null", null, { authors: [A] }],
    [
      "filter 値が非配列",
      base,
      { authors: "not-an-array" } as unknown as RelayFilter,
    ],
    [
      "filter のタグ値が非配列",
      { ...base, tags: [["e", ID]] },
      { "#e": ID } as unknown as RelayFilter,
    ],
    ["filter が null", base, null as unknown as RelayFilter],
    ["filter が undefined", base, undefined as unknown as RelayFilter],
  ])("投げない: %s", (_name, event, filter) => {
    expect(() => matchesFilter(event as NostrEvent, filter)).not.toThrow();
    expect(typeof matchesFilter(event as NostrEvent, filter)).toBe("boolean");
  });

  it("matchesAnyFilter の filters 配列に null 要素が混ざっていても投げない", () => {
    expect(() =>
      matchesAnyFilter(ev(), [
        { authors: [A] },
        null as unknown as RelayFilter,
      ]),
    ).not.toThrow();
    expect(
      typeof matchesAnyFilter(ev(), [
        { authors: [A] },
        null as unknown as RelayFilter,
      ]),
    ).toBe("boolean");
  });
});
