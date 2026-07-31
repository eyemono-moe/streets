import { describe, expect, it } from "vitest";
import { planQuery } from "./query-plan";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const routing: Record<string, string[]> = {
  [A]: ["wss://one/"],
  [B]: ["wss://two/"],
  [C]: ["wss://one/", "wss://two/"],
};
const writeRelaysFor = (pubkey: string) => routing[pubkey] ?? [];
const fallbackRelays = ["wss://fallback/"];

describe("planQuery", () => {
  it("splits one filter into per-relay filters by author", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], authors: [A, B], limit: 50 }],
      writeRelaysFor,
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
      writeRelaysFor,
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
      writeRelaysFor,
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

  it("sends an author-less filter to the fallback relays without reporting it", () => {
    const plan = planQuery({
      filters: [{ kinds: [1], limit: 20 }],
      writeRelaysFor,
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
      writeRelaysFor,
      fallbackRelays: multiRelay,
    });

    const filter1 = plan.perRelay.get("wss://fallback1/")?.[0];
    const filter2 = plan.perRelay.get("wss://fallback2/")?.[0];
    const filter3 = plan.perRelay.get("wss://fallback3/")?.[0];

    // All filters should be deeply equal (same values)
    expect(filter1).toEqual({ kinds: [1], limit: 20 });
    expect(filter2).toEqual({ kinds: [1], limit: 20 });
    expect(filter3).toEqual({ kinds: [1], limit: 20 });

    // But each relay must get its own object, not aliased references
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
      writeRelaysFor,
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
      writeRelaysFor,
      fallbackRelays,
    });

    expect(plan.unroutableAuthors).toEqual([unknown]);
  });

  it("returns an empty plan for no filters", () => {
    const plan = planQuery({ filters: [], writeRelaysFor, fallbackRelays });
    expect(plan.perRelay.size).toBe(0);
    expect(plan.unroutableAuthors).toEqual([]);
  });
});
