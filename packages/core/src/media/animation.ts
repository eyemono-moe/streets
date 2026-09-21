/**
 * 動きのある画像（GIF・APNG・アニメーション WebP）かどうかを、中身の先頭から
 * 見分ける。切り抜くと 1 枚の静止画になってしまうので、切る前に知らせるために使う。
 * 拡張子や種類だけでは分からない —— `.gif` でも 1 枚だけのものがある。
 */

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  Array.from(bytes.subarray(offset, offset + length), (byte) =>
    String.fromCharCode(byte),
  ).join("");

const uint32BE = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] ?? 0) << 24) +
  ((bytes[offset + 1] ?? 0) << 16) +
  ((bytes[offset + 2] ?? 0) << 8) +
  (bytes[offset + 3] ?? 0);

const uint32LE = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) +
  ((bytes[offset + 1] ?? 0) << 8) +
  ((bytes[offset + 2] ?? 0) << 16) +
  ((bytes[offset + 3] ?? 0) << 24);

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** APNG は `acTL` を持つ。`IDAT` より前に置くと決まっているので、そこで打ち切る。 */
const isAnimatedPng = (bytes: Uint8Array): boolean => {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = uint32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL") return true;
    if (type === "IDAT") return false;
    offset += 12 + length;
  }
  return false;
};

/** アニメーション WebP は `ANIM` チャンクを持つ。 */
const isAnimatedWebp = (bytes: Uint8Array): boolean => {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    if (type === "ANIM") return true;
    const size = uint32LE(bytes, offset + 4);
    offset += 8 + size + (size % 2);
  }
  return false;
};

/** 画像の塊（`0x2C`）が 2 つ以上あれば動く。ブロックをたどって数える。 */
const isAnimatedGif = (bytes: Uint8Array): boolean => {
  // 見出し 6 バイト＋画面の情報 7 バイト。全体のカラーテーブルがあれば、その分も飛ばす。
  let offset = 13;
  const packed = bytes[10] ?? 0;
  if (packed & 0x80) offset += 3 * 2 ** ((packed & 0x07) + 1);

  const skipSubBlocks = () => {
    while (offset < bytes.length) {
      const size = bytes[offset] ?? 0;
      offset += 1 + size;
      if (size === 0) return;
    }
  };

  let frames = 0;
  while (offset < bytes.length) {
    const marker = bytes[offset];
    if (marker === 0x3b) return false; // 終わり
    if (marker === 0x21) {
      // 拡張ブロック：種類 1 バイトのあとに、続きの塊が並ぶ。
      offset += 2;
      skipSubBlocks();
      continue;
    }
    if (marker === 0x2c) {
      frames += 1;
      if (frames > 1) return true;
      const localPacked = bytes[offset + 9] ?? 0;
      offset += 10;
      if (localPacked & 0x80) offset += 3 * 2 ** ((localPacked & 0x07) + 1);
      offset += 1; // LZW の最小符号長
      skipSubBlocks();
      continue;
    }
    return false;
  }
  return false;
};

export const isAnimatedImage = (bytes: Uint8Array): boolean => {
  if (ascii(bytes, 0, 3) === "GIF") return isAnimatedGif(bytes);
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return isAnimatedPng(bytes);
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return isAnimatedWebp(bytes);
  }
  return false;
};
