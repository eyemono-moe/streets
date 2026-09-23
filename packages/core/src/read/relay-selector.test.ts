import { describe, expect, it } from "vitest";
import { selectRelays } from "./relay-selector";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

const base = { pinned: [], current: [], budget: 10, redundancy: 1 } as const;

describe("selectRelays", () => {
  it("prefers the relay that covers the most authors", () => {
    const selection = selectRelays({
      ...base,
      demand: new Map([
        [A, ["wss://hub/", "wss://a-only/"]],
        [B, ["wss://hub/", "wss://b-only/"]],
        [C, ["wss://hub/"]],
      ]),
      budget: 1,
    });

    expect(selection.picks).toEqual(["wss://hub/"]);
    expect(selection.uncovered).toEqual([]);
  });

  it("never exceeds the budget", () => {
    const demand = new Map(
      Array.from({ length: 20 }, (_, i) => [
        `${i}`.padStart(64, "0"),
        [`wss://r${i}/`],
      ]),
    );

    const selection = selectRelays({ ...base, demand, budget: 5 });

    expect(selection.picks).toHaveLength(5);
    expect(selection.uncovered).toHaveLength(15);
  });

  it("keeps pinned relays even when they cover nobody", () => {
    const selection = selectRelays({
      ...base,
      demand: new Map([[A, ["wss://useful/"]]]),
      pinned: ["wss://fallback/"],
      budget: 2,
    });

    expect(selection.picks).toContain("wss://fallback/");
    expect(selection.picks).toContain("wss://useful/");
  });

  it("lets pinned relays win when the budget cannot hold them all", () => {
    const selection = selectRelays({
      ...base,
      demand: new Map([[A, ["wss://useful/"]]]),
      pinned: ["wss://p1/", "wss://p2/"],
      budget: 2,
    });

    expect(selection.picks).toEqual(["wss://p1/", "wss://p2/"]);
    expect(selection.uncovered).toEqual([A]);
  });

  it("assigns a single-declared relay to its author and does not report them uncovered", () => {
    // need は min(redundancy, 宣言数) だが gain はブールな「need>0」指標なので、
    // min の値はここでは検証不可。確認できるのは「1 本しか宣言していない著者も
    // assignment に入り uncovered にならない」という契約のみ。
    const selection = selectRelays({
      demand: new Map([
        [A, ["wss://solo/"]],
        [B, ["wss://x/", "wss://y/"]],
      ]),
      pinned: [],
      current: [],
      budget: 3,
      redundancy: 2,
    });

    expect(selection.assignment.get(A)).toEqual(["wss://solo/"]);
    expect(selection.assignment.get(B)).toEqual(["wss://x/", "wss://y/"]);
    expect(selection.uncovered).toEqual([]);
  });

  it("caps each author's assignment at the redundancy", () => {
    // x/y/z は他著者にも必要とされ 3 本とも選ばれるが、A の redundancy=2 で購読は 2 本まで。
    const selection = selectRelays({
      demand: new Map([
        [A, ["wss://x/", "wss://y/", "wss://z/"]],
        [B, ["wss://x/"]],
        [C, ["wss://y/"]],
        [D, ["wss://z/"]],
      ]),
      pinned: [],
      current: [],
      budget: 3,
      redundancy: 2,
    });

    expect(selection.picks).toHaveLength(3);
    expect(selection.assignment.get(A)).toEqual(["wss://x/", "wss://y/"]);
  });

  it("breaks ties toward relays that are already open", () => {
    const demand = new Map([
      [A, ["wss://new/", "wss://open/"]],
      [B, ["wss://new/", "wss://open/"]],
    ]);

    const fresh = selectRelays({ ...base, demand, budget: 1 });
    const sticky = selectRelays({
      ...base,
      demand,
      budget: 1,
      current: ["wss://open/"],
    });

    // 同点なら辞書順。current があるならそちらを優先する
    expect(fresh.picks).toEqual(["wss://new/"]);
    expect(sticky.picks).toEqual(["wss://open/"]);
  });

  it("does not keep a current relay that has become useless", () => {
    // stale は誰にも宣言されず candidates 未参入。current を無条件 union する
    // 粗い失敗は捕まえるが、粘着性の比較ロジック自体は通らない。
    const selection = selectRelays({
      ...base,
      demand: new Map([[A, ["wss://needed/"]]]),
      current: ["wss://stale/"],
      budget: 5,
    });

    expect(selection.picks).toEqual(["wss://needed/"]);
  });

  it("does not keep a declared current relay once its marginal gain hits zero", () => {
    // stale は A の宣言で candidates に入り比較ロジックを通るが、redundancy=1 は
    // other で満たされ gain は 0 に落ちる。isCurrent が gain 比較を上書きするバグは
    // ここを抜けて stale を残してしまう。
    const selection = selectRelays({
      demand: new Map([
        [A, ["wss://other/", "wss://stale/"]],
        [B, ["wss://other/"]],
      ]),
      pinned: [],
      current: ["wss://stale/"],
      budget: 2,
      redundancy: 1,
    });

    expect(selection.picks).toEqual(["wss://other/"]);
  });

  it("breaks ties lexicographically when nothing is current", () => {
    // p,q,r are tied at gain 2. Comparing two live runs would be unfalsifiable
    // if Math.random() leaked in, so this checks a fixed expected order instead.
    const demand = new Map([
      [A, ["wss://p/", "wss://q/"]],
      [B, ["wss://q/", "wss://p/"]],
      [C, ["wss://r/"]],
      [D, ["wss://r/"]],
    ]);

    const selection = selectRelays({ ...base, demand, budget: 2 });

    expect(selection.picks).toEqual(["wss://p/", "wss://r/"]);
  });

  it("returns an empty selection for empty demand", () => {
    const selection = selectRelays({ ...base, demand: new Map() });

    expect(selection.picks).toEqual([]);
    expect(selection.uncovered).toEqual([]);
  });

  describe("degraded relays", () => {
    // 変異: degraded を無視すると落ちる (死んだリレーが枠を食い著者が永久に暗転する、実際に観測された欠陥)。
    it("prefers a reachable relay over a degraded one that covers the same author", () => {
      // Named so "a-dead" sorts before "z-alive": both tie at gain 1, so if
      // `degraded` were ignored, the existing lexicographic tie-break would
      // still pick dead first -- proving the pass depends on exclusion, not luck.
      const selection = selectRelays({
        ...base,
        demand: new Map([[A, ["wss://a-dead/", "wss://z-alive/"]]]),
        degraded: ["wss://a-dead/"],
      });

      expect(selection.picks).toEqual(["wss://z-alive/"]);
      expect(selection.assignment.get(A)).toEqual(["wss://z-alive/"]);
      expect(selection.uncovered).toEqual([]);
    });

    // 変異: degraded を「最後の手段」として残すと落ちる (到達不能な割当は被覆を増やさず、枠を空ける方が常に良い)。
    it("leaves an author uncovered when every declared relay is degraded", () => {
      const selection = selectRelays({
        ...base,
        demand: new Map([[B, ["wss://dead/"]]]),
        degraded: ["wss://dead/"],
      });

      expect(selection.picks).toEqual([]);
      expect(selection.uncovered).toEqual([B]);
    });

    // 変異: pinned にも degraded を適用すると落ちる (ブートストラップのインデクサが黙って落とされ経路ごと壊れる)。
    it("still picks a pinned relay even when it is degraded", () => {
      const selection = selectRelays({
        ...base,
        demand: new Map(),
        pinned: ["wss://indexer/"],
        degraded: ["wss://indexer/"],
      });

      expect(selection.picks).toEqual(["wss://indexer/"]);
    });

    // 変異: degraded を必須にすると既存の呼び出しが全部落ちる。
    it("behaves exactly as before when degraded is omitted", () => {
      const withOmittedDegraded = selectRelays({
        ...base,
        demand: new Map([[A, ["wss://x/", "wss://y/"]]]),
      });
      const withEmptyDegraded = selectRelays({
        ...base,
        demand: new Map([[A, ["wss://x/", "wss://y/"]]]),
        degraded: [],
      });

      expect(withOmittedDegraded).toEqual(withEmptyDegraded);
    });
  });
});
