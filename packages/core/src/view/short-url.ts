const TAIL_LIMIT = 20;

// どこへ飛ぶかはスキームとホストで決まるので、そこは切らない。
const ORIGIN_RE = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i;

// 空白・改行・書字方向の制御文字などに戻ると、見えている URL と飛び先がずれて見える。
const UNSAFE_DECODED_RE = /[\s\p{C}]/u;

/** `%E6%97%A5` のように符号化された文字を読める形に戻す。戻せないものは元のまま。 */
const decodeForDisplay = (url: string): string => {
  let decoded: string;
  try {
    decoded = decodeURI(url);
  } catch {
    return url;
  }
  return UNSAFE_DECODED_RE.test(decoded) ? url : decoded;
};

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * 本文に出す URL を作る。符号化された文字を戻し、スキームとホストは残して、
 * その後ろを 20 文字までに縮める。
 */
export const shortenUrl = (url: string): string => {
  const readable = decodeForDisplay(url);
  const origin = ORIGIN_RE.exec(readable)?.[0];
  if (origin === undefined) return readable;
  const tail = Array.from(
    graphemes.segment(readable.slice(origin.length)),
    (part) => part.segment,
  );
  if (tail.length <= TAIL_LIMIT) return readable;
  return `${origin}${tail.slice(0, TAIL_LIMIT).join("")}…`;
};
