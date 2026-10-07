import type { FontId } from "./glyph-shard";
import { type HexColor, type Style, resolveOutline } from "./style";
import type { TextLayout } from "./text";

/** 描くのに要るものすべて。並べ方も縁取りの色も、決まった後の値。 */
export type EmojiSpec = TextLayout & {
  color: HexColor;
  /** 縁取りの色。`null` は縁取りなし。 */
  outline: HexColor | null;
  /** 縁取りの太さ（px）。 */
  outlineWidth: number;
  font: FontId;
};

export const specOf = (layout: TextLayout, style: Style): EmojiSpec => ({
  ...layout,
  color: style.color,
  outline: resolveOutline(style),
  outlineWidth: style.outlineWidth,
  font: style.font,
});
