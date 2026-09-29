import type { NostrEvent } from "./event";

/** 投稿者が付けた閲覧注意（NIP-36）。理由は書かれていないことがある。 */
export type ContentWarning = { reason?: string };

/**
 * `content-warning` タグを読む。NIP-32 のラベル（`L content-warning`）だけの
 * ものは閲覧注意とみなさない —— NIP-36 でラベルはタグに添える補足で、
 * 読み手に確かめさせる印はタグのほう。
 */
export const contentWarning = (
  event: NostrEvent,
): ContentWarning | undefined => {
  const tag = event.tags.find((tag) => tag[0] === "content-warning");
  if (!tag) return undefined;
  const reason = tag[1]?.trim();
  return reason ? { reason } : {};
};
