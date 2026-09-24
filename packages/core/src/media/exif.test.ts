import { describe, expect, it } from "vite-plus/test";
import { hasExif } from "./exif";

const bytes = (...values: (number | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") out.push(value);
    else for (const char of value) out.push(char.charCodeAt(0));
  }
  return new Uint8Array(out);
};

/** マーカー 1 つぶん（長さは中身＋2 バイト）。 */
const segment = (marker: number, body: (number | string)[]) => [
  0xff,
  marker,
  0,
  body.length + 2,
  ...body,
];

describe("hasExif", () => {
  it("APP1 に Exif を持つ jpeg", () => {
    expect(
      hasExif(
        bytes(0xff, 0xd8, ...segment(0xe1, ["Exif", 0, 0, 1, 2]), 0xff, 0xda),
      ),
    ).toBe(true);
  });

  it("別の APP1（XMP など）だけの jpeg は持っていない", () => {
    expect(
      hasExif(
        bytes(0xff, 0xd8, ...segment(0xe1, ["http://ns.adobe"]), 0xff, 0xda),
      ),
    ).toBe(false);
  });

  it("画像の中身に Exif という並びがあっても数えない", () => {
    expect(hasExif(bytes(0xff, 0xd8, 0xff, 0xda, "Exif", 0, 0))).toBe(false);
  });

  const png = [137, "PNG", 13, 10, 26, 10] as const;
  /** 長さ 0 のチャンク（長さ 4 ＋ 種類 4 ＋ CRC 4 バイト）。 */
  const chunk = (type: string) => [0, 0, 0, 0, type, 0, 0, 0, 0] as const;

  it("eXIf チャンクを持つ png", () => {
    expect(hasExif(bytes(...png, ...chunk("IHDR"), ...chunk("eXIf")))).toBe(
      true,
    );
  });

  it("ふつうの png は持っていない", () => {
    expect(hasExif(bytes(...png, ...chunk("IHDR"), ...chunk("IDAT")))).toBe(
      false,
    );
  });

  it("EXIF チャンクを持つ webp", () => {
    expect(hasExif(bytes("RIFF", 0, 0, 0, 0, "WEBP", "EXIF", 0, 0, 0, 0))).toBe(
      true,
    );
  });

  it("ふつうの webp は持っていない", () => {
    expect(hasExif(bytes("RIFF", 0, 0, 0, 0, "WEBP", "VP8 ", 0, 0, 0, 0))).toBe(
      false,
    );
  });

  it("空でも壊れない", () => {
    expect(hasExif(new Uint8Array())).toBe(false);
  });
});
