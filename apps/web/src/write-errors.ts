import { UploadFailedError } from "@streets/core/media/blossom";
import { NotUploadServerError } from "@streets/core/media/upload-servers";
import {
  InvalidPrivateItemsError,
  PrivateItemsUnavailableError,
} from "@streets/core/nostr/private-tags";
import { Nip46PermissionMissingError } from "@streets/core/signer/nip46/nip46-signer";
import {
  SignerDisconnectedError,
  SignerUnavailableError,
} from "@streets/core/signer/signer";
import { RefetchFailedError } from "@streets/core/write/fetch-latest";
import { WriteFailedError } from "@streets/core/write/writer";
import { EmojiCreateFailedError } from "./emoji/maker/api";
import { plural, t } from "./i18n/locale";
import { NoUploadServerError } from "./media/uploader";

export const actionErrorMessage = (error: unknown): string => {
  if (error instanceof WriteFailedError) {
    return plural("app.errors.writeFailed", error.rejected.length);
  }
  if (error instanceof RefetchFailedError) {
    return t("app.errors.refetchFailed");
  }
  if (error instanceof PrivateItemsUnavailableError) {
    return t("app.errors.privateItemsUnavailable");
  }
  if (error instanceof InvalidPrivateItemsError) {
    return t("app.errors.invalidPrivateItems");
  }
  if (error instanceof Nip46PermissionMissingError) {
    return t("app.errors.nip46PermissionMissing");
  }
  if (error instanceof SignerDisconnectedError) {
    return t("app.errors.signerDisconnected");
  }
  if (error instanceof SignerUnavailableError) {
    return t("app.errors.signerUnavailable");
  }
  if (error instanceof NoUploadServerError) {
    return t("app.errors.noUploadServer");
  }
  if (error instanceof NotUploadServerError) {
    return t("app.errors.notUploadServer", {
      server: error.server.replace(/^https:\/\//, ""),
    });
  }
  if (error instanceof EmojiCreateFailedError) {
    switch (error.reason) {
      case "missing-chars":
        return t("app.errors.emoji.missingChars", {
          chars: error.chars.join(" "),
        });
      case "denied":
        return t("app.errors.emoji.denied");
      case "rate-limited":
        return t("app.errors.emoji.rateLimited");
      case "server":
        return t("app.errors.emoji.server");
    }
  }
  return t("app.errors.sendFailed", {
    message: error instanceof Error ? error.message : String(error),
  });
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
    return t("app.errors.upload.chooseServer");
  }
  if (error instanceof UploadFailedError) {
    return error.status === 413
      ? t("app.errors.upload.tooLarge")
      : t("app.errors.upload.failed", { message: error.message });
  }
  return error instanceof Error ? error.message : String(error);
};
