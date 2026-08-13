import { describe, expect, it } from "vitest";
import {
  INITIAL_RENDER_COUNT,
  RENDER_COUNT_STEP,
  growRenderWindow,
  initialRenderWindow,
  renderCount,
} from "./render-window";

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `id-${from + i}`);

describe("render-window", () => {
  it("初期は INITIAL_RENDER_COUNT 件", () => {
    // 捕まえる変異: 初期値を itemIds.length にする (全部描いてしまい、
    // このスライスが解こうとしている初回のブロッキングがそのまま残る)
    expect(renderCount(initialRenderWindow(), ids(0, 600))).toBe(
      INITIAL_RENDER_COUNT,
    );
  });

  it("増やすと RENDER_COUNT_STEP 件増える", () => {
    // 捕まえる変異: 増分を 1 件にする / 増やさない
    const list = ids(0, 600);
    const grown = growRenderWindow(initialRenderWindow(), list);
    expect(renderCount(grown, list)).toBe(
      INITIAL_RENDER_COUNT + RENDER_COUNT_STEP,
    );
  });

  it("先頭へ挿入されても、それまで描いていた末尾が窓から落ちない", () => {
    // 捕まえる変異: 境界を id ではなく件数で持つ。深くスクロール中に新着が
    // 来ると、窓の末尾にあった「いま見ている行」が押し出されて再マウント
    // され、展開していた長文ノートが畳まれる (仕様 4.1)
    const before = ids(100, 500);
    const windowState = growRenderWindow(initialRenderWindow(), before);
    const lastVisible = before[renderCount(windowState, before) - 1];

    const after = [...ids(0, 10), ...before];

    // 挿入された 10 件ぶん窓が伸び、境界のアイテムは依然として窓の中にある
    expect(renderCount(windowState, after)).toBe(
      renderCount(windowState, before) + 10,
    );
    expect(after.slice(0, renderCount(windowState, after))).toContain(
      lastVisible,
    );
  });

  it("境界 id が見つからないときは初期値へ戻る", () => {
    // 捕まえる変異: indexOf の -1 をそのまま使う (件数 0 になって何も
    // 描かれなくなる) / 前回の件数を据え置く
    const list = ids(0, 600);
    const grown = growRenderWindow(initialRenderWindow(), list);
    expect(renderCount(grown, list)).toBeGreaterThan(INITIAL_RENDER_COUNT);

    expect(renderCount(grown, ids(9000, 600))).toBe(INITIAL_RENDER_COUNT);
  });

  it("件数が INITIAL_RENDER_COUNT を下回るときは件数どまり", () => {
    // 捕まえる変異: 上限で丸めない (件数を超える数を返し、「まだ描いて
    // いないものがある」の判定が常に真になって番兵が張り付く)
    expect(renderCount(initialRenderWindow(), ids(0, 5))).toBe(5);
  });

  it("空配列では 0 件", () => {
    // 捕まえる変異: 空でも INITIAL_RENDER_COUNT を返す (slice は 0 件を
    // 返すので描画は壊れないが、番兵の判定が狂う)
    expect(renderCount(initialRenderWindow(), [])).toBe(0);
    expect(growRenderWindow(initialRenderWindow(), [])).toEqual({
      boundaryId: undefined,
    });
  });

  it("末尾まで描いたらそれ以上伸びない", () => {
    // 捕まえる変異: 件数で丸めずに境界を進める (itemIds[next - 1] が
    // undefined になり、以降 renderCount が初期値へ落ちて表示が縮む)
    const list = ids(0, 50);
    let windowState = initialRenderWindow();
    for (let i = 0; i < 5; i += 1)
      windowState = growRenderWindow(windowState, list);
    expect(renderCount(windowState, list)).toBe(50);
  });

  it("renderCount は渡された窓を書き換えない", () => {
    // 捕まえる変異: renderCount の中で windowState.boundaryId を進める
    // (items() が再計算されるたび窓が伸び、番兵と無関係に全件描いてしまう)。
    // 同じ引数で 2 回呼んで比べるだけでは、値を返す前に書き換える実装を
    // 捕まえられない —— 窓そのものが変わっていないことを見る。
    const list = ids(0, 600);
    const windowState = growRenderWindow(initialRenderWindow(), list);
    const snapshot = { ...windowState };
    renderCount(windowState, list);
    expect(windowState).toEqual(snapshot);
  });
});
