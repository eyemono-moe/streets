import type { EventDraft } from "./draft";

/**
 * 閲覧注意（NIP-36）にする。`undefined` は付けない、空文字は理由なしで付ける。
 * NIP-32 のラベル（`L` / `l`）は付けない —— 読む側の扱いはタグで決まる。
 */
export const withContentWarning = (
  draft: EventDraft,
  reason: string | undefined,
): EventDraft => {
  if (reason === undefined) return draft;
  const tag = reason ? ["content-warning", reason] : ["content-warning"];
  return { ...draft, tags: [...draft.tags, tag] };
};
