import { UploadFailedError } from "@streets/core/media/blossom";
import {
  InvalidPrivateItemsError,
  PrivateItemsUnavailableError,
} from "@streets/core/nostr/private-tags";
import { SignerUnavailableError } from "@streets/core/signer/signer";
import { RefetchFailedError } from "@streets/core/write/fetch-latest";
import { WriteFailedError } from "@streets/core/write/writer";
import { NoUploadServerError } from "./media/uploader";

export const actionErrorMessage = (error: unknown): string => {
  if (error instanceof WriteFailedError) {
    return `どのリレーにも届きませんでした（${error.rejected.length} 本が拒否）`;
  }
  if (error instanceof RefetchFailedError) {
    return "保存する前に今の状態を取得できませんでした。時間をおいて再試行してください";
  }
  if (error instanceof PrivateItemsUnavailableError) {
    return "今のログインの方法では、非公開の項目を扱えません";
  }
  if (error instanceof InvalidPrivateItemsError) {
    return "非公開の項目を読み取れなかったため、保存しませんでした";
  }
  if (error instanceof SignerUnavailableError) {
    return "署名器を利用できません。ログインし直してください";
  }
  if (error instanceof NoUploadServerError) {
    return "画像のアップロード先がありません。設定の「画像」で追加してください";
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

/** アップロードできなかった理由。添えたファイルの行に短く出す。 */
export const uploadErrorMessage = (error: unknown): string => {
  if (error instanceof NoUploadServerError) {
    return "設定で画像のアップロード先を決めてください";
  }
  if (error instanceof UploadFailedError) {
    return error.status === 413
      ? "ファイルが大きすぎます"
      : `アップロードできませんでした（${error.message}）`;
  }
  return error instanceof Error ? error.message : String(error);
};
