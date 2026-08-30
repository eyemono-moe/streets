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
   * 錨を打った時点の**先頭アイテムの id**。まだ打っていなければ `undefined`。
   *
   * 末尾ではなく先頭に錨を打つのが要点。`SortedEvents`（上限超過時に
   * `pop()` で末尾＝最古を追い出す）と組み合わせると、末尾に錨を打つ設計は
   * 件数が上限へ収束した瞬間に「錨アイテム＝次に追い出されるアイテム」に
   * なり、次の 1 件で錨ごと消えて `indexOf` が -1 → 件数が
   * `INITIAL_RENDER_COUNT` へ崩壊する（描画済み数百件が一斉にアンマウント
   * され、ブラウザが `scrollTop` をクランプして読んでいた位置が飛ぶ）。
   * 先頭に錨を打てば、末尾からの追い出しは錨の添字に一切影響しない
   * （下記 `renderCount` の `prependedSince` 参照）ので、この崩壊は構造的に
   * 起きない。
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
  // 錨が見つからない = 錨より新しいイベントが上限件数ぶん流れて押し出された
  // (これが起きた時点で錨が指していたアイテムはもうセクションに無い)、
  // または別のイベント集合に入れ替わった。どちらも「いま見ていたものは
  // もう無い」ので初期値へ戻してよい。
  if (prependedSince < 0) return Math.min(INITIAL_RENDER_COUNT, itemIds.length);

  // 錨を打った後に先頭へ入った件数だけ窓も伸ばす —— これで、それまで
  // 描いていたアイテムが窓から押し出されない。末尾からの追い出しは
  // `prependedSince` を変えないので、件数は `itemIds.length` で頭打ちに
  // なるだけで落ちない。
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
