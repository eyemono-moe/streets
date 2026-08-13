/**
 * カラムが「いま何件まで描いてよいか」だけを決める。DOM も Solid も知らない
 * —— この規則 (spec 4.1) がこのスライスで最も間違えやすく、DOM を立ち上げずに
 * 全分岐を確かめたいから分けている。
 */

/** カラムの高さは約 900px、1 行のノートは約 60px なので 2〜3 画面ぶん。 */
export const INITIAL_RENDER_COUNT = 40;
export const RENDER_COUNT_STEP = 40;

export type RenderWindow = {
  /**
   * 描画済みの**末尾アイテムの id**。件数ではなく id で持つのが要点 ——
   * 先頭へ新着が挿入されても境界アイテムの同一性は変わらないので、
   * 「挿入されたぶん件数を足し直す」補正が要らない。件数で持つと、補正が
   * 効くまでの一瞬だけ末尾のアイテムが `<For>` から外れて再マウントされ、
   * 展開していた長文ノートが畳まれる。
   */
  boundaryId: string | undefined;
};

export const initialRenderWindow = (): RenderWindow => ({
  boundaryId: undefined,
});

export const renderCount = (
  windowState: RenderWindow,
  itemIds: readonly string[],
): number => {
  const initial = Math.min(INITIAL_RENDER_COUNT, itemIds.length);
  if (windowState.boundaryId === undefined) return initial;

  const index = itemIds.indexOf(windowState.boundaryId);
  // 見つからない = 別のイベント集合に入れ替わった、または上限で末尾から
  // 押し出された。どちらも古い境界を引き継ぐ意味が無いので初期値へ戻す。
  if (index < 0) return initial;

  return Math.min(Math.max(index + 1, INITIAL_RENDER_COUNT), itemIds.length);
};

export const growRenderWindow = (
  windowState: RenderWindow,
  itemIds: readonly string[],
): RenderWindow => {
  const next = Math.min(
    renderCount(windowState, itemIds) + RENDER_COUNT_STEP,
    itemIds.length,
  );
  return { boundaryId: next === 0 ? undefined : itemIds[next - 1] };
};
