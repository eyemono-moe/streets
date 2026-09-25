const TAIL_LIMIT = 20;

// どこへ飛ぶかはスキームとホストで決まるので、そこは切らない。
const ORIGIN_RE = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i;

/** 本文に出す URL を、スキームとホストは残し、その後ろを 20 文字までに縮める。 */
export const shortenUrl = (url: string): string => {
  const origin = ORIGIN_RE.exec(url)?.[0];
  if (origin === undefined) return url;
  const tail = url.slice(origin.length);
  if (tail.length <= TAIL_LIMIT) return url;
  return `${origin}${tail.slice(0, TAIL_LIMIT)}…`;
};
