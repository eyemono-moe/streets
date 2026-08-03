import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { SortedEvents, compareEvents } from "./sorted-events";

const ev = (id: string, createdAt: number): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: createdAt,
  kind: 1,
  tags: [],
  content: id,
  sig: "sig",
});

const ids = (s: SortedEvents) =>
  s
    .toArray()
    .map((e) => e.id)
    .join(",");

// 期待値は手で導出したものではなく、意図した実装を実際に走らせて得た出力である
// (計画作成時に scratchpad で計算済み)。「捕まえる変異」は、その主張が何を
// 守っているかを明示するためのもの。
describe("SortedEvents", () => {
  it("同値は id 昇順に並ぶ", () => {
    // 捕まえる変異: tiebreak を落とす / 降順にする
    const s = new SortedEvents(500);
    for (const e of [ev("c", 100), ev("a", 100), ev("b", 100)]) s.add(e);
    expect(ids(s)).toBe("a,b,c");
  });

  it("created_at 降順が id より優先される", () => {
    // 捕まえる変異: 比較の主従を入れ替える
    const s = new SortedEvents(500);
    for (const e of [ev("a", 100), ev("b", 300), ev("c", 200)]) s.add(e);
    expect(ids(s)).toBe("b,c,a");
  });

  it("先頭・中間・末尾のどこへでも正しく挿入する", () => {
    // 捕まえる変異: 二分探索の境界の取り違え (lo/hi の更新方向)
    const s = new SortedEvents(500);
    for (const e of [ev("m", 200), ev("z", 100)]) s.add(e);
    expect(ids(s)).toBe("m,z");
    s.add(ev("t", 300));
    expect(ids(s)).toBe("t,m,z");
    s.add(ev("n", 150));
    expect(ids(s)).toBe("t,m,n,z");
    s.add(ev("b", 50));
    expect(ids(s)).toBe("t,m,n,z,b");
  });

  it("上限に達した後、末尾より後ろに来るイベントは挿入すらしない", () => {
    // 捕まえる変異: 先に挿入してから追い出す実装 (結果の配列は同じでも
    // add の戻り値が true になり、呼び出し側が無駄な通知を積む)
    const s = new SortedEvents(3);
    for (const e of [ev("a", 300), ev("b", 200), ev("c", 100)]) s.add(e);
    expect(ids(s)).toBe("a,b,c");

    expect(s.add(ev("d", 50))).toBe(false);
    expect(s.has("d")).toBe(false);
    expect(ids(s)).toBe("a,b,c");
    expect(s.size).toBe(3);
  });

  it("上限に達した後、末尾より前に来るイベントは採用され末尾が落ちる", () => {
    // 捕まえる変異: 追い出し時に id 集合を更新し忘れる
    const s = new SortedEvents(3);
    for (const e of [ev("a", 300), ev("b", 200), ev("c", 100)]) s.add(e);

    expect(s.add(ev("d", 250))).toBe(true);
    expect(ids(s)).toBe("a,d,b");
    expect(s.has("c")).toBe(false);
    expect(s.size).toBe(3);
  });

  it("上限の境界で同値のときは id が採否を決める", () => {
    // 捕まえる変異: 上限判定で created_at しか見ない
    // (どちらの add も同じ結果になってしまう)
    const s = new SortedEvents(3);
    for (const e of [ev("a", 300), ev("b", 200), ev("m", 100)]) s.add(e);
    expect(ids(s)).toBe("a,b,m");

    // 同値だが id が末尾より後ろ -> 却下
    expect(s.add(ev("z", 100))).toBe(false);
    expect(ids(s)).toBe("a,b,m");

    // 同値だが id が末尾より前 -> 採用され、m が落ちる
    expect(s.add(ev("d", 100))).toBe(true);
    expect(ids(s)).toBe("a,b,d");
  });

  it("同値が上限の境界をまたぐとき、残るのは id の小さい方である", () => {
    // 捕まえる変異: 上限判定を created_at だけで行う
    // (境界の同値 5 件から「先に着いた 3 件」が残ってしまう)
    //
    // これは旧実装からの**内容の**変化であり、順序だけの変化ではない。
    // 旧実装 (安定ソート) は y,z,e,d,c を残していた —— 到着順で決まるため、
    // Outbox では実行ごとに変わりうる。新実装は入力の集合だけで決まる。
    const s = new SortedEvents(5);
    for (const e of [
      ev("y", 200),
      ev("z", 200),
      ev("e", 100),
      ev("d", 100),
      ev("c", 100),
      ev("b", 100),
      ev("a", 100),
    ]) {
      s.add(e);
    }
    expect(ids(s)).toBe("y,z,a,b,c");
  });

  it("重複 id は採用しない", () => {
    // 捕まえる変異: 重複判定の欠落
    const s = new SortedEvents(500);
    expect(s.add(ev("a", 100))).toBe(true);
    expect(s.add(ev("a", 999))).toBe(false);
    expect(s.size).toBe(1);
    expect(ids(s)).toBe("a");
  });

  it("上限ちょうどでは追い出しが起きない", () => {
    // 捕まえる変異: off-by-one (>= を > にする / その逆)
    const s = new SortedEvents(3);
    const results = [ev("a", 300), ev("b", 200), ev("c", 100)].map((e) =>
      s.add(e),
    );
    expect(results).toEqual([true, true, true]);
    expect(s.size).toBe(3);
  });

  it("clear() で配列も id 集合も空になる", () => {
    const s = new SortedEvents(3);
    s.add(ev("a", 100));
    s.clear();
    expect(s.size).toBe(0);
    expect(s.has("a")).toBe(false);
    expect(s.toArray()).toEqual([]);
  });

  it("toArray() は内部配列を露出しない", () => {
    // 捕まえる変異: this.#items をそのまま返す
    const s = new SortedEvents(3);
    s.add(ev("a", 100));
    s.toArray().push(ev("x", 999));
    expect(s.size).toBe(1);
  });

  // 個別ケースではなく性質そのものを主張する。同値だらけの入力で、
  // 逐次 add が「全件を compareEvents で並べて先頭 N 件」と一致すること。
  // 上の個別ケースが全部通っても挿入位置がどこかでずれていれば、これが落ちる。
  it("逐次 add は『全件ソートして先頭 N 件』と一致する", () => {
    const CAP = 500;
    let x = 12345;
    const events = Array.from({ length: 3000 }, (_, i) => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      // created_at は 500 通りしかない = 同値が大量に発生する
      return ev(`e-${String(i).padStart(4, "0")}`, 1_700_000_000 + (x % 500));
    });

    const s = new SortedEvents(CAP);
    for (const e of events) s.add(e);

    const oracle = [...events].sort(compareEvents).slice(0, CAP);
    expect(s.toArray().map((e) => e.id)).toEqual(oracle.map((e) => e.id));

    // has() と配列の内容が食い違っていないこと
    const kept = new Set(oracle.map((e) => e.id));
    for (const e of events) expect(s.has(e.id)).toBe(kept.has(e.id));
  });
});
