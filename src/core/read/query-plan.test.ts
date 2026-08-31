import { describe, expect, it } from "vitest";
import { planQuery } from "./query-plan";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const assignment = new Map<string, string[]>([
  [A, ["wss://one/"]],
  [B, ["wss://two/"]],
  [C, ["wss://one/", "wss://two/"]],
]);
const fallbackRelays = ["wss://fallback/"];

describe("planQuery", () => {
  it("splits one filter into per-relay filters by assignment", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [A, B], limit: 50 }],
      assignment: new Map([
        [A, ["wss://one/"]],
        [B, ["wss://two/"]],
      ]),
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://one/")).toEqual([
      { kinds: [1], authors: [A], limit: 50 },
    ]);
    expect(plan.perRelay.get("wss://two/")).toEqual([
      { kinds: [1], authors: [B], limit: 50 },
    ]);
    expect(plan.unroutableAuthors).toEqual([]);
  });

  it("sends an author with several write relays to each of them", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [C] }],
      assignment,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://one/")).toEqual([
      { kinds: [1], authors: [C] },
    ]);
    expect(plan.perRelay.get("wss://two/")).toEqual([
      { kinds: [1], authors: [C] },
    ]);
  });

  it("routes unroutable authors to the fallback relays and reports them", () => {
    const unknown = "d".repeat(64);
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [A, unknown] }],
      assignment,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://one/")).toEqual([
      { kinds: [1], authors: [A] },
    ]);
    expect(plan.perRelay.get("wss://fallback/")).toEqual([
      { kinds: [1], authors: [unknown] },
    ]);
    expect(plan.unroutableAuthors).toEqual([unknown]);
  });

  it("sends an author with no relay list to the fallback relays", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [A] }],
      assignment: new Map(), // A は kind:10002 が引けていない
      fallbackRelays: ["wss://fallback/"],
    });

    expect(plan.perRelay.get("wss://fallback/")).toEqual([
      { kinds: [1], authors: [A] },
    ]);
    expect(plan.unroutableAuthors).toEqual([A]);
    expect(plan.uncoveredAuthors).toEqual([]);
  });

  it("sends an author whose budget ran out nowhere, and counts them", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [A] }],
      assignment: new Map([[A, []]]), // 宣言はあるが予算で落ちた
      fallbackRelays: ["wss://fallback/"],
    });

    // fallback へ送ってはいけない (予算超過で落としたのに開き直しては意味がない)。
    expect(plan.perRelay.size).toBe(0);
    expect(plan.unroutableAuthors).toEqual([]);
    expect(plan.uncoveredAuthors).toEqual([A]);
  });

  it("skips a filter with an explicitly empty authors array instead of broadcasting it", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [] }],
      assignment,
      fallbackRelays,
    });

    expect(plan.perRelay.size).toBe(0);
    expect(plan.unroutableAuthors).toEqual([]);
  });

  it("still broadcasts a filter with authors omitted (undefined) to every fallback relay", () => {
    const plan = planQuery({
      filters: [{ kinds: [1] }, { kinds: [7], authors: [] }],
      assignment,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://fallback/")).toEqual([{ kinds: [1] }]);
  });

  it("sends an author-less filter to the fallback relays without reporting it", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], limit: 20 }],
      assignment,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://fallback/")).toEqual([
      { kinds: [1], limit: 20 },
    ]);
    // 著者を指定していないのだから「ルーティングできなかった著者」は 0 人
    expect(plan.unroutableAuthors).toEqual([]);
  });

  it("broadcasts author-less filter to each fallback relay with independent objects", () => {
    const multiRelay = [
      "wss://fallback1/",
      "wss://fallback2/",
      "wss://fallback3/",
    ];
    const plan = planQuery({
      filters: [{ kinds: [1], limit: 20 }],
      assignment,
      fallbackRelays: multiRelay,
    });

    const filter1 = plan.perRelay.get("wss://fallback1/")?.[0];
    const filter2 = plan.perRelay.get("wss://fallback2/")?.[0];
    const filter3 = plan.perRelay.get("wss://fallback3/")?.[0];

    expect(filter1).toEqual({ kinds: [1], limit: 20 });
    expect(filter2).toEqual({ kinds: [1], limit: 20 });
    expect(filter3).toEqual({ kinds: [1], limit: 20 });

    expect(filter1).not.toBe(filter2);
    expect(filter2).not.toBe(filter3);
    expect(filter1).not.toBe(filter3);
  });

  it("merges filters destined for the same relay", () => {
    const plan = planQuery({
      filters: [
        { kinds: [1], authors: [A] },
        { kinds: [7], authors: [A] },
      ],
      assignment,
      fallbackRelays,
    });

    expect(plan.perRelay.get("wss://one/")).toEqual([
      { kinds: [1], authors: [A] },
      { kinds: [7], authors: [A] },
    ]);
    expect(plan.perRelay.size).toBe(1);
  });

  it("does not report the same unroutable author twice", () => {
    const unknown = "d".repeat(64);
    const plan = planQuery({
      filters: [
        { kinds: [1], authors: [unknown] },
        { kinds: [7], authors: [unknown] },
      ],
      assignment,
      fallbackRelays,
    });

    expect(plan.unroutableAuthors).toEqual([unknown]);
  });

  it("returns an empty plan for no filters", () => {
    const plan = planQuery({ filters: [], assignment, fallbackRelays });
    expect(plan.perRelay.size).toBe(0);
    expect(plan.unroutableAuthors).toEqual([]);
  });
});
