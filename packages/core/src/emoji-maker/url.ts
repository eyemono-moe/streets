import { base64urlnopad } from "@scure/base";
import type { FontId } from "./glyph-shard";
import type { EmojiSpec } from "./spec";
import type { HexColor } from "./style";
import {
  type Align,
  type Fit,
  MAX_CHARS,
  MAX_LINES,
  type Shape,
  graphemes,
} from "./text";

/**
 * 作った絵文字の置き場所。投稿に書き込まれて後から変えられないので、形は ADR-0035 で固定する。
 *
 * `https://emoji.streets.eyemono.moe/v1/<見た目>/<文字>.png`
 * - 見た目：`<書体>-<形>-<字の形>-<そろえ>-<文字色>-<縁取りの色|none>-<縁取りの太さ>`
 * - 文字：行を改行でつないだ UTF-8 を、base64url（詰め物なし）にしたもの
 */
export const EMOJI_ORIGIN = "https://emoji.streets.eyemono.moe";
const VERSION = "v1";

const FONTS: readonly FontId[] = ["gothic", "rounded", "serif"];
const SHAPES: readonly Shape[] = ["square", "wide"];
const FITS: readonly Fit[] = ["stretch", "keep"];
const ALIGNS: readonly Align[] = ["left", "center", "right"];
/** 縁取りの太さの上限（px）。 */
export const MAX_OUTLINE_WIDTH = 12;
const HEX = /^#[0-9a-f]{6}$/;

/**
 * 同じ見た目になる指定を 1 つの形にそろえる。伸ばすときはそろえを使わないので中央に、
 * 縁取りが無いときは太さを 0 にする。色は小文字にする。
 */
export const canonicalSpec = (spec: EmojiSpec): EmojiSpec => {
  const outline = spec.outline
    ? (spec.outline.toLowerCase() as HexColor)
    : null;
  return {
    lines: spec.lines,
    shape: spec.shape,
    fit: spec.fit,
    align: spec.fit === "stretch" ? "center" : spec.align,
    color: spec.color.toLowerCase() as HexColor,
    outline,
    outlineWidth: outline ? spec.outlineWidth : 0,
    font: spec.font,
  };
};

/** 描いて置いてよい指定か。描けない字（輪郭が無い字）はここでは見ない。 */
export const isValidSpec = (spec: EmojiSpec): boolean => {
  const count = spec.lines.reduce(
    (sum, line) => sum + graphemes(line).length,
    0,
  );
  return (
    spec.lines.length >= 1 &&
    spec.lines.length <= MAX_LINES &&
    spec.lines.every((line) => line !== "" && !/\s/.test(line)) &&
    count <= MAX_CHARS &&
    FONTS.includes(spec.font) &&
    SHAPES.includes(spec.shape) &&
    FITS.includes(spec.fit) &&
    ALIGNS.includes(spec.align) &&
    HEX.test(spec.color.toLowerCase()) &&
    // 縁取りが無いときの太さは見ない（そろえるときに 0 にする）。
    (spec.outline === null ||
      (HEX.test(spec.outline.toLowerCase()) &&
        Number.isInteger(spec.outlineWidth) &&
        spec.outlineWidth >= 1 &&
        spec.outlineWidth <= MAX_OUTLINE_WIDTH))
  );
};

/** R2 の中の名前（URL の、オリジンの後ろ）。指定は先に `canonicalSpec` でそろえる。 */
export const emojiKey = (spec: EmojiSpec): string => {
  const s = canonicalSpec(spec);
  const style = [
    s.font,
    s.shape,
    s.fit,
    s.align,
    s.color.slice(1),
    s.outline ? s.outline.slice(1) : "none",
    s.outlineWidth,
  ].join("-");
  const text = base64urlnopad.encode(
    new TextEncoder().encode(s.lines.join("\n")),
  );
  return `${VERSION}/${style}/${text}.png`;
};

export const emojiUrl = (spec: EmojiSpec): string =>
  `${EMOJI_ORIGIN}/${emojiKey(spec)}`;

const pick = <T extends string>(
  list: readonly T[],
  value: string | undefined,
) => list.find((item) => item === value);

/**
 * 名前から指定を読み戻す。そろえた形で書かれていないもの・描いてよい指定でないものは
 * `undefined`（同じ見た目に別の名前ができないように）。
 */
export const parseEmojiKey = (key: string): EmojiSpec | undefined => {
  const match = /^v1\/([a-z0-9-]+)\/([A-Za-z0-9_-]+)\.png$/.exec(key);
  if (!match) return undefined;
  const [font, shape, fit, align, color, outline, width, ...rest] = (
    match[1] ?? ""
  ).split("-");
  if (rest.length > 0) return undefined;
  const parsedFont = pick(FONTS, font);
  const parsedShape = pick(SHAPES, shape);
  const parsedFit = pick(FITS, fit);
  const parsedAlign = pick(ALIGNS, align);
  if (!parsedFont || !parsedShape || !parsedFit || !parsedAlign)
    return undefined;
  if (!/^\d+$/.test(width ?? "")) return undefined;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      base64urlnopad.decode(match[2] ?? ""),
    );
  } catch {
    return undefined;
  }
  const spec: EmojiSpec = {
    lines: text.split("\n"),
    shape: parsedShape,
    fit: parsedFit,
    align: parsedAlign,
    color: `#${color ?? ""}`,
    outline: outline === "none" ? null : `#${outline ?? ""}`,
    outlineWidth: Number(width),
    font: parsedFont,
  };
  if (!isValidSpec(spec) || emojiKey(spec) !== key) return undefined;
  return spec;
};

/** 作った絵文字の URL なら、指定を読み戻す（「これを元に作る」で使う）。 */
export const parseEmojiUrl = (url: string): EmojiSpec | undefined => {
  const prefix = `${EMOJI_ORIGIN}/`;
  return url.startsWith(prefix)
    ? parseEmojiKey(url.slice(prefix.length))
    : undefined;
};
