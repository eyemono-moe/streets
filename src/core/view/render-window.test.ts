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

  it("末尾から追い出され続けても窓が崩壊しない (C1 本体)", () => {
    // 捕まえる変異: 錨を先頭ではなく末尾に打つ (旧設計への差し戻し)。
    //
    // `SortedEvents` は上限超過時に末尾 (最古) を `pop()` で捨てる。件数が
    // 上限まで伸びた状態で末尾に錨を打つ旧設計だと、錨アイテム = 末尾
    // アイテム = 次に捨てられるアイテムになり、次の1件で錨ごと消えて
    // `indexOf` が -1 → 件数が INITIAL_RENDER_COUNT へ崩壊する
    // (描画済み数百件が一斉にアンマウントされ、読んでいた位置が飛ぶ)。
    // 先頭に錨を打つこの設計では、末尾からの追い出しは錨の添字に影響しない
    // ので件数は上限に張り付いたまま落ちない。
    const capacity = 200;
    let list = ids(0, capacity);
    let windowState = initialRenderWindow();
    // 番兵を数回発火させ、件数を上限まで伸ばす
    for (let i = 0; i < 10; i += 1) {
      windowState = growRenderWindow(windowState, list);
    }
    expect(renderCount(windowState, list)).toBe(capacity);

    // 「先頭へ1件挿入し、上限超過ぶんを末尾から1件捨てる」を繰り返す
    // (SortedEvents.add と同じ形)。窓は growRenderWindow を呼ばない
    // (= 番兵は交差していない) ままにする —— 新着の到着そのものが崩壊の
    // 引き金になるかどうかを見たいので。
    for (let i = 0; i < 50; i += 1) {
      list = [`new-${i}`, ...list.slice(0, capacity - 1)];
      expect(renderCount(windowState, list)).toBeGreaterThan(
        INITIAL_RENDER_COUNT,
      );
    }
  });

  it("錨を打った後に先頭へ N 件挿入されても、それまで描いていた末尾が窓から落ちない", () => {
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

  it("錨が見つからないときは初期値へ戻る", () => {
    // 捕まえる変異: indexOf の -1 をそのまま使う (件数 0 になって何も
    // 描かれなくなる) / 前回の件数を据え置く
    const list = ids(0, 600);
    const grown = growRenderWindow(initialRenderWindow(), list);
    expect(renderCount(grown, list)).toBeGreaterThan(INITIAL_RENDER_COUNT);

    expect(renderCount(grown, ids(9000, 600))).toBe(INITIAL_RENDER_COUNT);
  });

  it("錨を打つ前 (番兵が一度も発火していないカラム) に先頭へ挿入されると旧末尾が落ちる —— 意図した縮退", () => {
    // これはバグではなく既知のトレードオフ (spec 4.1 の「既知の穴」)。
    // headId が undefined のときの窓は「先頭から count 件」という素朴な
    // 規則しか持たないので、先頭へ挿入されたぶんだけ旧末尾が押し出される。
    // ただしこの時点で利用者が見ているのは画面内の先頭 15 件程度で、
    // 押し出される旧添字 30〜39 は画面外。加えて先頭に同数増えているので
    // scrollHeight はほぼ変わらず、スクロール位置は飛ばない —— C1 が
    // 問題にした「描画済み数百件が一斉に消える」とは質的に異なる。
    //
    // 捕まえる変異: headId が undefined でも挿入ぶんを足してしまう
    // (この既知の穴を意図せず塞いでしまい、挙動が変わったことに誰も
    // 気づかなくなる)
    const before = ids(0, 100);
    const oldLast = before[INITIAL_RENDER_COUNT - 1]; // "id-39"

    const after = [...ids(1000, 10), ...before];

    expect(renderCount(initialRenderWindow(), after)).toBe(
      INITIAL_RENDER_COUNT,
    );
    expect(after.slice(0, INITIAL_RENDER_COUNT)).not.toContain(oldLast);
  });

  it("空配列では 0 件", () => {
    // 捕まえる変異: 空でも INITIAL_RENDER_COUNT を返す (slice は 0 件を
    // 返すので描画は壊れないが、番兵の判定が狂う)
    expect(renderCount(initialRenderWindow(), [])).toBe(0);
    expect(growRenderWindow(initialRenderWindow(), [])).toEqual(
      initialRenderWindow(),
    );
  });

  it("末尾まで描いたらそれ以上伸びない", () => {
    // 捕まえる変異: itemIds.length で丸めずに件数を進める (実際の件数を
    // 超える数を返し、「まだ描いていないものがある」の判定が常に真になって
    // 番兵が張り付く)
    const list = ids(0, 50);
    let windowState = initialRenderWindow();
    for (let i = 0; i < 5; i += 1)
      windowState = growRenderWindow(windowState, list);
    expect(renderCount(windowState, list)).toBe(50);
  });

  it("renderCount は渡された窓を書き換えない", () => {
    // 捕まえる変異: renderCount の中で windowState.count や headId を進める
    // (items() が再計算されるたび窓が伸び、番兵と無関係に全件描いてしまう)。
    // 同じ引数で 2 回呼んで比べるだけでは、値を返す前に書き換える実装を
    // 捕まえられない —— 窓そのものが変わっていないことを見る。
    const list = ids(0, 600);
    const windowState = growRenderWindow(initialRenderWindow(), list);
    const snapshot = { ...windowState };
    renderCount(windowState, list);
    expect(windowState).toEqual(snapshot);
  });

  it("renderCount は件数を itemIds.length で丸める", () => {
    // 捕まえる変異: itemIds.length によるクランプを外す (実際の件数を超える
    // 数を返し、番兵が張り付く／存在しないアイテムを描こうとする)
    const list = ids(0, 20);
    const grown = growRenderWindow(initialRenderWindow(), list);
    expect(renderCount(grown, list)).toBe(20);

    // 錨は残ったまま items() だけが縮む (別のイベント集合や大量の追い出し)
    // 場合でも、返す件数は今の itemIds.length を超えない
    expect(renderCount(grown, list.slice(0, 5))).toBe(5);
  });
});
