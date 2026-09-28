import type { EventDraft } from "./draft";

/**
 * 注意書き（NIP-36）を付ける。`undefined` は付けない、空文字は理由なしで付ける。
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
