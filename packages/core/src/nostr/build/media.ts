import type { BlobDescriptor } from "../../media/blossom";
import type { EventDraft } from "./draft";

/**
 * 添えたファイルの情報（NIP-92 の `imeta`）。読む側が、本文の URL を開く前に
 * 種類や大きさを知れる。並びは `key value` の形で、URL は必須。
 */
export const imetaTag = (blob: BlobDescriptor): string[] => [
  "imeta",
  `url ${blob.url}`,
  ...(blob.type ? [`m ${blob.type}`] : []),
  `x ${blob.sha256}`,
  ...(blob.size > 0 ? [`size ${blob.size}`] : []),
];

/**
 * 本文の末尾に URL を足す。同じ URL が本文にもう入っていれば足さない
 * （貼り付けと選び直しで 2 回入るのを防ぐ）。
 */
export const appendMediaUrl = (content: string, url: string): string => {
  if (content.includes(url)) return content;
  const base = content.trimEnd();
  return base.length === 0 ? url : `${base}\n${url}`;
};

/** 添えたファイルを本文とタグへ入れる。 */
export const withMedia = (
  draft: EventDraft,
  blobs: readonly BlobDescriptor[],
): EventDraft => {
  if (blobs.length === 0) return draft;
  return {
    ...draft,
    content: blobs.reduce(
      (content, blob) => appendMediaUrl(content, blob.url),
      draft.content,
    ),
    tags: [...draft.tags, ...blobs.map(imetaTag)],
  };
};
