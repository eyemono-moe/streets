import { describe, expect, it } from "vite-plus/test";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import {
  type ReadEnvironment,
  type ReadRequest,
  planReads,
} from "./read-planner";

const FALLBACK = "wss://fallback/";

const request = (
  id: number,
  filters: RelayFilter[],
  options: Partial<Pick<ReadRequest, "explicitRelays" | "extraRelays">> = {},
): ReadRequest => ({
  id,
  filters,
  explicitRelays: options.explicitRelays,
  extraRelays: options.extraRelays ?? [],
});

const environment = (
  options: {
    writeRelays?: Record<string, RelayUrl[]>;
  } & Partial<ReadEnvironment> = {},
): ReadEnvironment => {
  const { writeRelays = {}, ...rest } = options;
  return {
    routing: { mode: "outbox" },
    defaultRelays: [FALLBACK],
    writeRelaysFor: (author) => writeRelays[author] ?? [],
    budget: 10,
    redundancy: 2,
    openRelays: [],
    degraded: [],
    blocked: [],
    isBlocked: () => false,
    isLocalRefused: () => false,
    ...rest,
  };
};

describe("planReads", () => {
  it("Outbox では著者を、その人の書き込みリレーごとのフィルタに分ける", () => {
    const { routes, assignment } = planReads(
      [request(1, [{ kinds: [1], authors: ["a", "b"] }])],
      environment({
        writeRelays: { a: ["wss://a/"], b: ["wss://b/"] },
        redundancy: 1,
      }),
    );

    expect(routes[0].perRelay.get("wss://a/")).toEqual([
      { kinds: [1], authors: ["a"] },
    ]);
    expect(routes[0].perRelay.get("wss://b/")).toEqual([
      { kinds: [1], authors: ["b"] },
    ]);
    expect(assignment.get("a")).toEqual(["wss://a/"]);
    expect(routes[0].unroutableAuthors).toEqual([]);
  });

  it("行き先の分からない著者は既定のリレーへ送り、行き先の分からない著者に数える", () => {
    const { routes, readPlan } = planReads(
      [request(1, [{ kinds: [1], authors: ["unknown"] }])],
      environment(),
    );

    expect([...routes[0].perRelay.keys()]).toEqual([FALLBACK]);
    expect(routes[0].unroutableAuthors).toEqual(["unknown"]);
    expect(readPlan.unroutableAuthors).toBe(1);
  });

  it("他人の localhost しか持たない著者は、行き先の分からない著者として既定のリレーへ送る", () => {
    const { routes } = planReads(
      [request(1, [{ kinds: [1], authors: ["a"] }])],
      environment({
        writeRelays: { a: ["ws://localhost:7777/"] },
        isLocalRefused: (url) => url.includes("localhost"),
        isBlocked: (url) => url.includes("localhost"),
      }),
    );

    expect([...routes[0].perRelay.keys()]).toEqual([FALLBACK]);
    expect(routes[0].unroutableAuthors).toEqual(["a"]);
  });

  it("予算に収まらなかった著者を、取れない著者に数える", () => {
    const writeRelays: Record<string, RelayUrl[]> = {};
    const authors = ["a", "b", "c"];
    for (const author of authors) writeRelays[author] = [`wss://${author}/`];

    const { routes, readPlan } = planReads(
      [request(1, [{ kinds: [1], authors }])],
      environment({ writeRelays, budget: 1, defaultRelays: [] }),
    );

    expect(routes[0].uncoveredAuthors.length).toBeGreaterThan(0);
    expect(readPlan.uncoveredAuthors).toBe(routes[0].uncoveredAuthors.length);
  });

  it("宣言リレーが全部 degraded な著者は、取れない著者に数える", () => {
    const { routes } = planReads(
      [request(1, [{ kinds: [1], authors: ["a"] }])],
      environment({
        writeRelays: { a: ["wss://a/"] },
        degraded: ["wss://a/"],
      }),
    );

    expect(routes[0].uncoveredAuthors).toEqual(["a"]);
  });

  it("繋がないリレーしか持たない著者は、取れない著者に数える", () => {
    const { routes } = planReads(
      [request(1, [{ kinds: [1], authors: ["a"] }])],
      environment({
        writeRelays: { a: ["wss://a/"] },
        blocked: ["wss://a/"],
        isBlocked: (url) => url === "wss://a/",
      }),
    );

    expect(routes[0].perRelay.has("wss://a/")).toBe(false);
    expect(routes[0].uncoveredAuthors).toEqual(["a"]);
  });

  it("複数のセクションが同じ著者を持つとき、割り当ては 1 つだけ作る", () => {
    const { routes, assignment } = planReads(
      [
        request(1, [{ kinds: [1], authors: ["a"] }]),
        request(2, [{ kinds: [6], authors: ["a"] }]),
      ],
      environment({ writeRelays: { a: ["wss://a/"] } }),
    );

    expect(assignment.size).toBe(1);
    expect(routes[0].perRelay.get("wss://a/")).toEqual([
      { kinds: [1], authors: ["a"] },
    ]);
    expect(routes[1].perRelay.get("wss://a/")).toEqual([
      { kinds: [6], authors: ["a"] },
    ]);
  });

  describe("明示リレー", () => {
    it("選択を通さず、リレーごとに別の配列でフィルタをそのまま送る", () => {
      const filters = [{ kinds: [1], authors: ["a"] }];
      const { routes, assignment } = planReads(
        [request(1, filters, { explicitRelays: ["wss://one/", "wss://two/"] })],
        environment({ writeRelays: { a: ["wss://a/"] } }),
      );

      const one = routes[0].perRelay.get("wss://one/");
      const two = routes[0].perRelay.get("wss://two/");
      expect(one).toEqual(filters);
      expect(two).toEqual(filters);
      expect(one).not.toBe(two);
      expect(routes[0].perRelay.has("wss://a/")).toBe(false);
      expect(assignment.size).toBe(0);
      expect(routes[0].unroutableAuthors).toEqual([]);
    });

    it("足したリレーは使わない", () => {
      const { routes } = planReads(
        [
          request(1, [{ kinds: [1] }], {
            explicitRelays: ["wss://given/"],
            extraRelays: ["wss://extra/"],
          }),
        ],
        environment(),
      );

      expect([...routes[0].perRelay.keys()]).toEqual(["wss://given/"]);
    });

    it("繋がないリレーは待たない", () => {
      const { routes } = planReads(
        [request(1, [{ kinds: [1] }], { explicitRelays: ["wss://x/"] })],
        environment({ isBlocked: (url) => url === "wss://x/" }),
      );

      expect(routes[0].perRelay.size).toBe(0);
    });

    it("空配列は、リレー 0 本の明示指定として既定のリレーへも送らない", () => {
      const { routes } = planReads(
        [request(1, [{ kinds: [1] }], { explicitRelays: [] })],
        environment(),
      );

      expect(routes[0].perRelay.size).toBe(0);
    });
  });

  describe("足すリレー", () => {
    it("Outbox の行き先に加えて、全フィルタをそのまま送る", () => {
      const filters = [{ kinds: [30_023], authors: ["a"] }];
      const { routes } = planReads(
        [request(1, filters, { extraRelays: ["wss://search/"] })],
        environment({ writeRelays: { a: ["wss://a/"] } }),
      );

      expect([...routes[0].perRelay.keys()].sort()).toEqual([
        "wss://a/",
        "wss://search/",
      ]);
      expect(routes[0].perRelay.get("wss://search/")).toEqual(filters);
    });

    it("繋がないリレーには送らない", () => {
      const { routes } = planReads(
        [request(1, [{ kinds: [1] }], { extraRelays: ["wss://search/"] })],
        environment({ isBlocked: (url) => url === "wss://search/" }),
      );

      expect(routes[0].perRelay.has("wss://search/")).toBe(false);
    });
  });

  describe("direct", () => {
    it("kind:10002 を見ず、全著者を指定のリレーから読む。欠落には数えない", () => {
      const { routes, assignment, readPlan } = planReads(
        [request(1, [{ kinds: [1], authors: ["a"] }])],
        environment({
          routing: { mode: "direct", relays: ["wss://direct/"] },
          defaultRelays: ["wss://direct/"],
          writeRelays: { a: ["wss://a/"] },
        }),
      );

      expect([...routes[0].perRelay.keys()]).toEqual(["wss://direct/"]);
      expect(routes[0].unroutableAuthors).toEqual([]);
      expect(assignment.size).toBe(0);
      expect(readPlan.mode).toBe("direct");
    });

    it("direct のリレーが 0 本なら、どこへも送らない", () => {
      const { routes } = planReads(
        [request(1, [{ kinds: [1], authors: ["a"] }])],
        environment({
          routing: { mode: "direct", relays: [] },
          defaultRelays: [],
        }),
      );

      expect(routes[0].perRelay.size).toBe(0);
    });
  });

  it("要求が無ければ、空の計画を返す", () => {
    const { routes, assignment, readPlan } = planReads([], environment());

    expect(routes).toEqual([]);
    expect(assignment.size).toBe(0);
    expect(readPlan.unroutableAuthors).toBe(0);
  });
});
