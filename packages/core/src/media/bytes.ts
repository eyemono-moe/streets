/** 画像の中身を覗くための小さな道具。どの形式も先頭に決まった並びを持つ。 */

export const ascii = (
  bytes: Uint8Array,
  offset: number,
  length: number,
): string =>
  Array.from(bytes.subarray(offset, offset + length), (byte) =>
    String.fromCharCode(byte),
  ).join("");

export const uint16BE = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] ?? 0) << 8) + (bytes[offset + 1] ?? 0);

export const uint32BE = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] ?? 0) << 24) +
  ((bytes[offset + 1] ?? 0) << 16) +
  ((bytes[offset + 2] ?? 0) << 8) +
  (bytes[offset + 3] ?? 0);

export const uint32LE = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) +
  ((bytes[offset + 1] ?? 0) << 8) +
  ((bytes[offset + 2] ?? 0) << 16) +
  ((bytes[offset + 3] ?? 0) << 24);

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export const isPng = (bytes: Uint8Array): boolean =>
  PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);

export const isRiffWebp = (bytes: Uint8Array): boolean =>
  ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";

export const isJpeg = (bytes: Uint8Array): boolean =>
  bytes[0] === 0xff && bytes[1] === 0xd8;

/** PNG のチャンクを先頭から順に渡す。`stop` を返すと打ち切る。 */
export const eachPngChunk = (
  bytes: Uint8Array,
  visit: (type: string) => "stop" | undefined,
): void => {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = uint32BE(bytes, offset);
    if (visit(ascii(bytes, offset + 4, 4)) === "stop") return;
    offset += 12 + length;
  }
};

/** RIFF（WebP）のチャンクを先頭から順に渡す。 */
export const eachRiffChunk = (
  bytes: Uint8Array,
  visit: (type: string) => "stop" | undefined,
): void => {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    if (visit(ascii(bytes, offset, 4)) === "stop") return;
    const size = uint32LE(bytes, offset + 4);
    offset += 8 + size + (size % 2);
  }
};
