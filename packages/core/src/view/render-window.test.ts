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
    // 捕まえる変異: 初期値を itemIds.length にする（初回の全件描画ブロッキングが残る）。
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

  it("末尾から追い出され続けても窓が崩壊しない (C1 本体)", () => {
    // 捕まえる変異: 錨を末尾に打つ (旧設計)。`SortedEvents` は末尾を `pop()`
    // するので、上限到達時に錨ごと消えて `INITIAL_RENDER_COUNT` へ崩壊する。
    const capacity = 200;
    let list = ids(0, capacity);
    let windowState = initialRenderWindow();
    // 番兵を数回発火させ、件数を上限まで伸ばす
    for (let i = 0; i < 10; i += 1) {
      windowState = growRenderWindow(windowState, list);
    }
    expect(renderCount(windowState, list)).toBe(capacity);

    // 「先頭へ1件挿入し末尾を1件捨てる」を繰り返す (growRenderWindow は呼ばず、新着到着自体が引き金になるか見る)。
    for (let i = 0; i < 50; i += 1) {
      list = [`new-${i}`, ...list.slice(0, capacity - 1)];
      expect(renderCount(windowState, list)).toBeGreaterThan(
        INITIAL_RENDER_COUNT,
      );
    }
  });

  it("錨を打った後に先頭へ N 件挿入されても、それまで描いていた末尾が窓から落ちない", () => {
    // 捕まえる変異: 境界を id ではなく件数で持つ（新着で「いま見ている行」が押し出され再マウントされ展開ノートが畳まれる）。
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

  it("錨が見つからないときは初期値へ戻る", () => {
    // 捕まえる変異: indexOf の -1 をそのまま使う（件数 0 になる）／前回の件数を据え置く。
    const list = ids(0, 600);
    const grown = growRenderWindow(initialRenderWindow(), list);
    expect(renderCount(grown, list)).toBeGreaterThan(INITIAL_RENDER_COUNT);

    expect(renderCount(grown, ids(9000, 600))).toBe(INITIAL_RENDER_COUNT);
  });

  it("錨を打つ前 (番兵が一度も発火していないカラム) に先頭へ挿入されると旧末尾が落ちる —— 意図した縮退", () => {
    // 既知のトレードオフ（バグではない）。headId が undefined の窓は「先頭
    // count 件」の素朴な規則で、挿入ぶんだけ旧末尾 (旧添字 30〜39、画面外)
    // が押し出されるが scrollHeight はほぼ変わらず飛ばない —— C1 (末尾から
    // 追い出す旧設計) の「数百件が消える」とは異なる。捕まえる変異: headId
    // が undefined でも挿入ぶんを足す。
    const before = ids(0, 100);
    const oldLast = before[INITIAL_RENDER_COUNT - 1];

    const after = [...ids(1000, 10), ...before];

    expect(renderCount(initialRenderWindow(), after)).toBe(
      INITIAL_RENDER_COUNT,
    );
    expect(after.slice(0, INITIAL_RENDER_COUNT)).not.toContain(oldLast);
  });

  it("空配列では 0 件", () => {
    // 捕まえる変異: 空でも INITIAL_RENDER_COUNT を返す（slice は無害だが番兵の判定が狂う）。
    expect(renderCount(initialRenderWindow(), [])).toBe(0);
    expect(growRenderWindow(initialRenderWindow(), [])).toEqual(
      initialRenderWindow(),
    );
  });

  it("末尾まで描いたらそれ以上伸びない", () => {
    // 捕まえる変異: itemIds.length で丸めずに件数を進める（「まだある」判定が常に真になり番兵が張り付く）。
    const list = ids(0, 50);
    let windowState = initialRenderWindow();
    for (let i = 0; i < 5; i += 1)
      windowState = growRenderWindow(windowState, list);
    expect(renderCount(windowState, list)).toBe(50);
  });

  it("renderCount は渡された窓を書き換えない", () => {
    // 捕まえる変異: renderCount 内で windowState.count/headId を進める。同じ
    // 引数を 2 回呼ぶだけでは検出できないので、窓自体が不変かを見る。
    const list = ids(0, 600);
    const windowState = growRenderWindow(initialRenderWindow(), list);
    const snapshot = { ...windowState };
    renderCount(windowState, list);
    expect(windowState).toEqual(snapshot);
  });

  it("renderCount は件数を itemIds.length で丸める", () => {
    // 捕まえる変異: itemIds.length によるクランプを外す（存在しないアイテムを描こうとする）。
    const list = ids(0, 20);
    const grown = growRenderWindow(initialRenderWindow(), list);
    expect(renderCount(grown, list)).toBe(20);

    // 錨は残ったまま items() だけが縮んでも、返す件数は今の itemIds.length を超えない。
    expect(renderCount(grown, list.slice(0, 5))).toBe(5);
  });
});
