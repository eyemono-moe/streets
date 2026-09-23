/**
 * 動きのある画像（GIF・APNG・アニメーション WebP）かどうかを、中身の先頭から
 * 見分ける。切り抜くと 1 枚の静止画になってしまうので、切る前に知らせるために使う。
 * 拡張子や種類だけでは分からない —— `.gif` でも 1 枚だけのものがある。
 */
import { ascii, eachPngChunk, eachRiffChunk, isPng, isRiffWebp } from "./bytes";

/** APNG は `acTL` を持つ。`IDAT` より前に置くと決まっているので、そこで打ち切る。 */
const isAnimatedPng = (bytes: Uint8Array): boolean => {
  let animated = false;
  eachPngChunk(bytes, (type) => {
    if (type === "acTL") {
      animated = true;
      return "stop";
    }
    return type === "IDAT" ? "stop" : undefined;
  });
  return animated;
};

/** アニメーション WebP は `ANIM` チャンクを持つ。 */
const isAnimatedWebp = (bytes: Uint8Array): boolean => {
  let animated = false;
  eachRiffChunk(bytes, (type) => {
    if (type === "ANIM") {
      animated = true;
      return "stop";
    }
    return undefined;
  });
  return animated;
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
  if (isPng(bytes)) return isAnimatedPng(bytes);
  if (isRiffWebp(bytes)) return isAnimatedWebp(bytes);
  return false;
};
