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
    // need の初期化は min(redundancy, 宣言本数) で行っている (A は 1 本しか
    // 宣言していないので目標は 1)。ただしこのテストは min の値そのものは
    // 検証できない — gain は「need > 0 の著者数」を数えるブールな指標で
    // あり、min ありでも redundancy そのままの初期化でも、A の唯一の
    // 宣言リレーが選ばれた時点でその宣言リレーは candidates から消える
    // ので他候補の gain に影響しない。つまり picks / assignment /
    // uncovered は両方の初期化で同じになる (5000 試行のファズで divergence
    // 0 件を確認済み)。min が効くのは「宣言本数に対する充足率」という
    // 計測 (docs/research/2026-08-01-outbox-connection-budget.md) の方で、
    // この関数の出力ではない。ここで検証できるのはあくまで
    // 「1 本しか宣言していない著者もちゃんと assignment に入り、
    // uncovered として扱われない」という公開契約だけ。
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
    // x, y, z はそれぞれ別の著者にも必要とされるので 3 本とも選ばれるが、
    // A の redundancy は 2 なので購読するのは 2 本まで
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
    // stale はどの著者にも宣言されていない — candidates にすら入らない
    // という粗い失敗 (current を picks に無条件で unionする実装) は
    // 捕まえるが、粘着性の比較ロジック自体は通っていない
    const selection = selectRelays({
      ...base,
      demand: new Map([[A, ["wss://needed/"]]]),
      current: ["wss://stale/"],
      budget: 5,
    });

    expect(selection.picks).toEqual(["wss://needed/"]);
  });

  it("does not keep a declared current relay once its marginal gain hits zero", () => {
    // stale は A が宣言している (candidates に入り、粘着性の比較ロジックを
    // 実際に通る)。だが A の redundancy 1 は other で既に満たされ、A 以外は
    // 誰も stale を宣言していないので stale の gain は 0 に落ちる。
    // gain > bestGain || isCurrent のような「isCurrent が gain 比較を
    // 上書きする」バグはここを通り抜けて stale を picks に残してしまう。
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
    // p, q, r all cover 2 authors each (gain 2) on the first pick, and none
    // is in `current` -- so the tie is broken purely by URL string order,
    // not by calling the pure function twice and comparing (unfalsifiable
    // short of Math.random() leaking in). p wins pick 1 (lexicographically
    // smallest of p/q/r). Taking p satisfies both A and B, so q's gain
    // drops to 0 and is skipped; r (still gain 2, covering C and D) wins
    // pick 2.
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
    // 変異: degraded を無視すると落ちる。実地で観測された欠陥そのもの
    // (死んだリレーが枠を食い、その著者は永久に暗転する)。
    it("prefers a reachable relay over a degraded one that covers the same author", () => {
      // Deliberately named so "wss://a-dead/" sorts *before*
      // "wss://z-alive/" lexicographically: both have gain 1 for A (tied),
      // so if `degraded` were silently ignored the existing lexicographic
      // tie-break (see "breaks ties lexicographically when nothing is
      // current" above) would pick the dead one first, not by luck of a
      // name like "alive" < "dead". This is the only way the test actually
      // depends on the exclusion rather than on tie-break ordering.
      const selection = selectRelays({
        ...base,
        demand: new Map([[A, ["wss://a-dead/", "wss://z-alive/"]]]),
        degraded: ["wss://a-dead/"],
      });

      expect(selection.picks).toEqual(["wss://z-alive/"]);
      expect(selection.assignment.get(A)).toEqual(["wss://z-alive/"]);
      expect(selection.uncovered).toEqual([]);
    });

    // 変異: degraded を「最後の手段として残す」実装にすると落ちる。
    // 到達不能なリレーを割り当てても被覆は増えないので、枠を空ける方が
    // 常に良い。
    it("leaves an author uncovered when every declared relay is degraded", () => {
      const selection = selectRelays({
        ...base,
        demand: new Map([[B, ["wss://dead/"]]]),
        degraded: ["wss://dead/"],
      });

      expect(selection.picks).toEqual([]);
      expect(selection.uncovered).toEqual([B]);
    });

    // 変異: pinned にも degraded を適用すると落ちる。ブートストラップの
    // インデクサが選択器に黙って落とされ、経路ごと壊れる。
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
