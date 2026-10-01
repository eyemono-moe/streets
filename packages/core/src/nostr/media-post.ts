import type { NostrEvent } from "./event";

/** 画像を見せるための投稿（NIP-68）。本文は説明で、画像は `imeta` にだけある。 */
export const PICTURE_KIND = 20;
/** 動画の投稿（NIP-71）。kind:22 は縦長の短い動画。 */
export const VIDEO_KIND = 21;
export const SHORT_VIDEO_KIND = 22;

export const isMediaPostKind = (kind: number): boolean =>
  kind === PICTURE_KIND || kind === VIDEO_KIND || kind === SHORT_VIDEO_KIND;

export const mediaPostTitle = (event: NostrEvent): string | undefined => {
  const title = event.tags.find((tag) => tag[0] === "title")?.[1]?.trim();
  return title ? title : undefined;
};
