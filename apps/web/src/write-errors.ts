import { SignerUnavailableError } from "@streets/core/signer/signer";
import { RefetchFailedError } from "@streets/core/write/fetch-latest";
import { WriteFailedError } from "@streets/core/write/writer";

export const actionErrorMessage = (error: unknown): string => {
  if (error instanceof WriteFailedError) {
    return `どのリレーにも届きませんでした（${error.rejected.length} 本が拒否）`;
  }
  if (error instanceof RefetchFailedError) {
    return "保存する前に今の状態を取得できませんでした。時間をおいて再試行してください";
  }
  if (error instanceof SignerUnavailableError) {
    return "署名器を利用できません。ログインし直してください";
  }
  return `送信に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
};

/** 進み具合のトーストがもう知らせた失敗。同じ失敗を 2 枚出さない。 */
const reported = new WeakSet<object>();

export const markReported = (cause: unknown): void => {
  if (typeof cause === "object" && cause !== null) reported.add(cause);
};

export const wasReported = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && reported.has(cause);
