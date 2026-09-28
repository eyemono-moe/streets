import { contentWarning } from "../nostr/content-warning";
import type { NostrEvent } from "../nostr/event";

/**
 * 注意書きの付いた投稿の扱い。
 * - `hide`：中身を隠し、押すと出す
 * - `show`：隠さない
 * - `exclude`：一覧に並べない
 */
export type ContentWarningMode = "hide" | "show" | "exclude";

export const CONTENT_WARNING_STORAGE_KEY = "streets.v1.contentWarning";

/** 未保存・読めない値は隠す。 */
export const loadContentWarningMode = (
  raw: string | null,
): ContentWarningMode => (raw === "show" || raw === "exclude" ? raw : "hide");

export const saveContentWarningMode = (mode: ContentWarningMode): string =>
  mode;

/**
 * 一覧に並べるか。自分の投稿は除かない —— 送った直後に消えると、送れたのかが
 * 分からなくなる。
 */
export const listsUnderWarning = (
  mode: ContentWarningMode,
  event: NostrEvent,
  viewer: string | undefined,
): boolean =>
  mode !== "exclude" ||
  event.pubkey === viewer ||
  contentWarning(event) === undefined;

/** 中身を隠すか。 */
export const hidesUnderWarning = (
  mode: ContentWarningMode,
  event: NostrEvent,
): boolean => mode !== "show" && contentWarning(event) !== undefined;
