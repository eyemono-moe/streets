/**
 * 「初回だけ記録する」部分。2 回目以降は無視する —— 許すと「最初の描画」
 * ではなく「直近に埋まった時刻」という別の値になる。
 */
export const createFirstRenderRecorder = (): ((
  ms: number,
) => number | undefined) => {
  let recorded = false;
  return (ms: number): number | undefined => {
    if (recorded) return undefined;
    recorded = true;
    return ms;
  };
};
