/**
 * 例外を握りつぶして処理を続けるときに、その例外を外へ知らせる。
 *
 * `console.error` に書くだけだと、不具合の報告（Sentry）に届かない。コンソールの
 * 記録は本文が混ざるので取っていない。`reportError` はページの `error` イベントと
 * して流すので、捕まえなかった例外と同じ経路で報告に乗る。core は報告の送り先を
 * 知らないまま済む。
 */
export const reportIsolated = (message: string, cause?: unknown): void => {
  const error = new Error(message, { cause });
  // Node（テスト）には無い。
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
    return;
  }
  console.error(error);
};
