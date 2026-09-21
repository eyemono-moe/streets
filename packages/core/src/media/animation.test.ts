import { describe, expect, it } from "vitest";
import { isAnimatedImage } from "./animation";

const bytes = (...values: (number | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") out.push(value);
    else for (const char of value) out.push(char.charCodeAt(0));
  }
  return new Uint8Array(out);
};

/** 画面の情報（全体のカラーテーブル無し）までの見出し。 */
const gifHeader = ["GIF89a", 1, 0, 1, 0, 0x00, 0, 0] as const;
/** 画像 1 枚ぶん（ローカルのカラーテーブル無し・中身は空）。 */
const gifFrame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x00] as const;

describe("isAnimatedImage", () => {
  it("1 枚だけの GIF は動かない", () => {
    expect(isAnimatedImage(bytes(...gifHeader, ...gifFrame, 0x3b))).toBe(false);
  });

  it("2 枚以上ある GIF は動く", () => {
    expect(
      isAnimatedImage(bytes(...gifHeader, ...gifFrame, ...gifFrame, 0x3b)),
    ).toBe(true);
  });

  it("拡張ブロック（動きの指定）をまたいで数える", () => {
    const graphicControl = [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0x00] as const;
    expect(
      isAnimatedImage(
        bytes(
          ...gifHeader,
          ...graphicControl,
          ...gifFrame,
          ...graphicControl,
          ...gifFrame,
          0x3b,
        ),
      ),
    ).toBe(true);
  });

  const png = [137, "PNG", 13, 10, 26, 10] as const;
  const chunk = (type: string) => [0, 0, 0, 0, type] as const;

  it("acTL を持つ PNG（APNG）は動く", () => {
    expect(isAnimatedImage(bytes(...png, ...chunk("acTL")))).toBe(true);
  });

  it("ふつうの PNG は動かない", () => {
    expect(
      isAnimatedImage(bytes(...png, ...chunk("IDAT"), ...chunk("acTL"))),
    ).toBe(false);
  });

  it("ANIM を持つ WebP は動く", () => {
    expect(
      isAnimatedImage(bytes("RIFF", 0, 0, 0, 0, "WEBP", "ANIM", 0, 0, 0, 0)),
    ).toBe(true);
  });

  it("ふつうの WebP は動かない", () => {
    expect(
      isAnimatedImage(bytes("RIFF", 0, 0, 0, 0, "WEBP", "VP8 ", 0, 0, 0, 0)),
    ).toBe(false);
  });

  it("空でも壊れない", () => {
    expect(isAnimatedImage(new Uint8Array())).toBe(false);
  });
});
