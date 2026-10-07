import { missingChars, renderEmoji } from "@streets/core/emoji-maker/render";
import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import { emojiKey } from "@streets/core/emoji-maker/url";
import { type Accessor, createResource } from "solid-js";
import { glyphsFor } from "./glyphs";

export type Preview =
  | { type: "image"; src: string; width: number; height: number }
  /** 輪郭の無い字がある。送れない。 */
  | { type: "missing"; chars: string[] };

/** 描いた見本。同じ見た目は描き直さない（ピッカーを開くたびに同じ候補を描くため）。 */
const drawn = new Map<string, Preview>();

/**
 * 見本を描く。サーバーと同じ処理で描くので、送られる画像と画素まで同じになる。
 * canvas に置いて PNG の data URL にする（<img> で並べられるように）。
 */
export const previewOf = async (spec: EmojiSpec): Promise<Preview> => {
  const key = emojiKey(spec);
  const cached = drawn.get(key);
  if (cached) return cached;
  const lookup = await glyphsFor(spec);
  const missing = missingChars(spec, lookup);
  let preview: Preview;
  const rendered = missing.length === 0 ? renderEmoji(spec, lookup) : undefined;
  if (!rendered) {
    preview = { type: "missing", chars: missing };
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    canvas
      .getContext("2d")
      ?.putImageData(
        new ImageData(
          rendered.pixels as Uint8ClampedArray<ArrayBuffer>,
          rendered.width,
          rendered.height,
        ),
        0,
        0,
      );
    preview = {
      type: "image",
      src: canvas.toDataURL("image/png"),
      width: rendered.width,
      height: rendered.height,
    };
  }
  drawn.set(key, preview);
  return preview;
};

/** 指定が変わるたびに描き直す。描いている間は前の見本を出したままにする（`latest`）。 */
export const createPreview = (spec: Accessor<EmojiSpec | undefined>) => {
  const [preview] = createResource(
    () => {
      const value = spec();
      return value ? { key: emojiKey(value), value } : undefined;
    },
    ({ value }) => previewOf(value),
  );
  return preview;
};
