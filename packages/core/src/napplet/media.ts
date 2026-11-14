/*
 * NIP-5D（PR #2303、2026-10-28 版）の Presentation media。アップレットの画面の見本
 * （スクリーンショット）と、短いプレビュー動画。
 *
 * > A manifest MAY include any number of screenshots and at most one preview video:
 * >   ["screenshot", "x <sha256>", "m image/png", "dim 1200x750", "size 184320", "alt The puzzle board"],
 * >   ["preview", "x <sha256>", "m video/webm", "dim 960x600", "duration 8.5", "alt Building a bridge"]
 * > Each tag describes one blob using NIP-92's `key value` field encoding, split at the first ASCII
 * > space. Field order is insignificant. Exactly one `x` field is REQUIRED, containing the
 * > 64-character lowercase-hex SHA-256 of the complete media bytes.
 * > Clients MUST ignore tags with missing, malformed or repeated `x` fields, and ignore unknown,
 * > malformed or repeated optional fields.
 * > Before rendering those bytes, clients MUST verify SHA-256 and decode screenshots as PNG, JPEG
 * > or WebP, or previews as a supported video format. When a valid `m` field is present, clients
 * > MUST also verify that it matches the decoded format.
 * > Clients SHOULD preserve screenshot tag order and MAY display a subset.
 * > If multiple `preview` tags are present, clients MUST ignore the preview.
 */

export type NappletMedia = {
  hash: string;
  mime?: string;
  dim?: { width: number; height: number };
  /** バイト数。取る前に大きさを見せるためのもので、取った中身の大きさが正。 */
  size?: number;
  alt?: string;
  /** 秒。プレビュー動画だけが持つ。 */
  duration?: number;
};

export type PresentationMedia = {
  screenshots: NappletMedia[];
  preview?: NappletMedia;
};

const SCREENSHOT_FORMATS = ["image/png", "image/jpeg", "image/webp"] as const;
const PREVIEW_FORMATS = ["video/webm", "video/mp4"] as const;

export type MediaFormat =
  | (typeof SCREENSHOT_FORMATS)[number]
  | (typeof PREVIEW_FORMATS)[number];

/** 情報のカラムに並べるスクリーンショットの数。多く並べても見られず、取る分だけ重くなる。 */
export const NAPPLET_SCREENSHOT_LIMIT = 8;

const HEX_64 = /^[0-9a-f]{64}$/;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const DIM = /^([1-9][0-9]*)x([1-9][0-9]*)$/;
const INTEGER = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;

/** タグの値を `key value` に分ける。空白の無い値は、鍵だけで値の無い（読めない）欄になる。 */
const fieldsOf = (
  tag: readonly string[],
): Map<string, (string | undefined)[]> => {
  const fields = new Map<string, (string | undefined)[]>();
  for (const raw of tag.slice(1)) {
    if (typeof raw !== "string") continue;
    const space = raw.indexOf(" ");
    const key = space < 0 ? raw : raw.slice(0, space);
    const value = space < 0 ? undefined : raw.slice(space + 1);
    fields.set(key, [...(fields.get(key) ?? []), value]);
  }
  return fields;
};

/** 1 度だけ現れ、形が合う欄の値。重なる・読めないものは無かったことにする。 */
const single = (
  fields: Map<string, (string | undefined)[]>,
  key: string,
  pattern: RegExp,
): string | undefined => {
  const found = fields.get(key);
  if (found?.length !== 1) return undefined;
  const value = found[0];
  return value !== undefined && pattern.test(value) ? value : undefined;
};

const mediaOf = (tag: readonly string[]): NappletMedia | undefined => {
  const fields = fieldsOf(tag);
  const hash = single(fields, "x", HEX_64);
  if (!hash) return undefined;
  const mime = single(fields, "m", MIME);
  const dim = DIM.exec(single(fields, "dim", DIM) ?? "");
  const size = single(fields, "size", INTEGER);
  const alt = single(fields, "alt", /\S/);
  const duration = single(fields, "duration", DECIMAL);
  return {
    hash,
    ...(mime ? { mime } : {}),
    ...(dim ? { dim: { width: Number(dim[1]), height: Number(dim[2]) } } : {}),
    ...(size && Number.isSafeInteger(Number(size))
      ? { size: Number(size) }
      : {}),
    ...(alt ? { alt } : {}),
    ...(duration ? { duration: Number(duration) } : {}),
  };
};

/**
 * `m` が見本に使えない形を名乗るものは、取っても中身と食い違って捨てることになるので、
 * 取る前に外す。
 */
const usable = (
  media: NappletMedia | undefined,
  formats: readonly string[],
): media is NappletMedia =>
  media !== undefined &&
  (media.mime === undefined || formats.includes(media.mime));

export const parsePresentationMedia = (
  tags: readonly (readonly string[])[],
): PresentationMedia => {
  const screenshots = tags
    .filter((tag) => tag[0] === "screenshot")
    .map(mediaOf)
    .filter((media) => usable(media, SCREENSHOT_FORMATS));
  const previews = tags.filter((tag) => tag[0] === "preview");
  const preview =
    previews.length === 1 ? mediaOf(previews[0] ?? []) : undefined;
  return {
    screenshots,
    ...(usable(preview, PREVIEW_FORMATS) ? { preview } : {}),
  };
};

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/** 先頭のバイトから形を見分ける。名乗った `m` やサーバーの Content-Type は信じない。 */
export const sniffMediaFormat = (
  bytes: Uint8Array,
): MediaFormat | undefined => {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return "image/png";
  }
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  // Matroska の中で、ブラウザが再生できるのは DocType が webm のものだけ。
  if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) {
    return ascii(bytes, 0, 64).includes("webm") ? "video/webm" : undefined;
  }
  // QuickTime（`qt  `）も ftyp で始まるが、多くのブラウザは再生できない。
  if (ascii(bytes, 4, 8) === "ftyp" && ascii(bytes, 8, 12) !== "qt  ") {
    return "video/mp4";
  }
  return undefined;
};

/**
 * 照合の済んだ中身を、見本として出してよいか確かめ、出すときの形を返す。
 * 返した形で blob を作り、名乗った `m` は使わない。
 */
export const acceptPresentationBytes = (
  role: "screenshot" | "preview",
  media: NappletMedia,
  bytes: Uint8Array,
): MediaFormat | undefined => {
  const format = sniffMediaFormat(bytes);
  if (!format) return undefined;
  const formats: readonly string[] =
    role === "screenshot" ? SCREENSHOT_FORMATS : PREVIEW_FORMATS;
  if (!formats.includes(format)) return undefined;
  if (media.mime !== undefined && media.mime !== format) return undefined;
  return format;
};
