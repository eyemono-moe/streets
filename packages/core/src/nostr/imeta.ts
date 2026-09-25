/** NIP-92 の `dim`。申告値なので、表示後は画像・動画の実寸を優先する。 */
export type MediaDimensions = { width: number; height: number };

export type InlineMediaMetadata = {
  mime?: string;
  dimensions?: MediaDimensions;
  blurhash?: string;
};

const parseDimensions = (value: string): MediaDimensions | undefined => {
  // 小数点以下が 0 の書き方（`4284.0x5712.0`）で送るクライアントがある。
  const match = /^([1-9][0-9]*)(?:\.0+)?x([1-9][0-9]*)(?:\.0+)?$/.exec(value);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  // 外から来る申告値をそのまま CSS の大きさに使わない。
  if (
    width > 100_000 ||
    height > 100_000 ||
    width / height > 20 ||
    height / width > 20
  ) {
    return undefined;
  }
  return { width, height };
};

/**
 * `type/subtype` の形をしていない `m`（`jpeg` など）は捨てる。残すと拡張子より
 * 優先されて、画像の URL がリンクに落ちる。
 */
const parseMime = (value: string | undefined): string | undefined =>
  value && /^[^\s/]+\/[^\s/]+$/.test(value) ? value : undefined;

/** `imeta` の項目を URL で引ける形にする。同じ URL は最初のタグを使う。 */
export const inlineMediaMetadata = (
  tags: readonly string[][],
): Map<string, InlineMediaMetadata> => {
  const result = new Map<string, InlineMediaMetadata>();
  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    const fields = new Map<string, string>();
    for (const field of tag.slice(1)) {
      const space = field.indexOf(" ");
      if (space <= 0) continue;
      const key = field.slice(0, space);
      if (!fields.has(key)) fields.set(key, field.slice(space + 1));
    }
    const url = fields.get("url");
    if (!url || result.has(url)) continue;
    result.set(url, {
      mime: parseMime(fields.get("m")),
      dimensions: parseDimensions(fields.get("dim") ?? ""),
      blurhash: fields.get("blurhash") || undefined,
    });
  }
  return result;
};
