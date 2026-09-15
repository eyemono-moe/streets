/** カラムが「いま何件まで描いてよいか」だけを決める。DOM 無しで全分岐を確かめたいので DOM/Solid を知らない。 */

/** カラムの高さは約 900px、1 行のノートは約 60px なので 2〜3 画面ぶん。 */
export const INITIAL_RENDER_COUNT = 40;
export const RENDER_COUNT_STEP = 40;

export type RenderWindow = {
  /**
   * 錨を打った時点の先頭アイテムの id (`undefined` は未設定)。末尾ではなく
   * 先頭に打つのが要点 —— `SortedEvents` は上限超過時に末尾を `pop()` で
   * 追い出すので、末尾に錨を打つと上限到達時に錨ごと消えて件数が
   * `INITIAL_RENDER_COUNT` へ崩壊する（数百件アンマウントでスクロール位置が飛ぶ）。
   */
  headId: string | undefined;
  /** 錨を打った時点で描いてよいと決めた件数。 */
  count: number;
};

export const initialRenderWindow = (): RenderWindow => ({
  headId: undefined,
  count: INITIAL_RENDER_COUNT,
});

export const renderCount = (
  windowState: RenderWindow,
  itemIds: readonly string[],
): number => {
  if (itemIds.length === 0) return 0;
  if (windowState.headId === undefined)
    return Math.min(windowState.count, itemIds.length);

  const prependedSince = itemIds.indexOf(windowState.headId);
  // 錨が見つからない = 押し出されたか別集合に入れ替わった。どちらも
  // 「いま見ていたものはもう無い」ので初期値へ戻す。
  if (prependedSince < 0) return Math.min(INITIAL_RENDER_COUNT, itemIds.length);

  // 先頭へ入った件数だけ窓を伸ばし、既存アイテムを押し出さない。末尾の
  // 追い出しは `prependedSince` を変えないので `itemIds.length` で頭打ちになるだけ。
  return Math.min(windowState.count + prependedSince, itemIds.length);
};

export const growRenderWindow = (
  windowState: RenderWindow,
  itemIds: readonly string[],
): RenderWindow => {
  if (itemIds.length === 0) return initialRenderWindow();
  return {
    headId: itemIds[0],
    count: Math.min(
      renderCount(windowState, itemIds) + RENDER_COUNT_STEP,
      itemIds.length,
    ),
  };
};
