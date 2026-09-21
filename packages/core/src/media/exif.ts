import {
  ascii,
  eachPngChunk,
  eachRiffChunk,
  isJpeg,
  isPng,
  isRiffWebp,
  uint16BE,
} from "./bytes";

/**
 * 撮ったときの情報（EXIF）を持っているか。撮影場所・日時・機種が入っていること
 * があるので、持っているものだけ描き直して外す（描き直すと中身だけが残る）。
 * 中身を見て判断する —— jpeg でも持っていないものは触らずに済ませたい。
 */
export const hasExif = (bytes: Uint8Array): boolean => {
  if (isJpeg(bytes)) {
    // FFD8 のあとにマーカーが並ぶ。APP1 の中身が "Exif" で始まれば持っている。
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return false;
      const marker = bytes[offset + 1] ?? 0;
      // 画像の中身（SOS）から先はマーカーが並んでいないので、そこで打ち切る。
      if (marker === 0xda || marker === 0xd9) return false;
      const length = uint16BE(bytes, offset + 2);
      if (marker === 0xe1 && ascii(bytes, offset + 4, 4) === "Exif") {
        return true;
      }
      offset += 2 + length;
    }
    return false;
  }
  if (isPng(bytes)) {
    let found = false;
    eachPngChunk(bytes, (type) => {
      if (type === "eXIf") {
        found = true;
        return "stop";
      }
      return undefined;
    });
    return found;
  }
  if (isRiffWebp(bytes)) {
    let found = false;
    eachRiffChunk(bytes, (type) => {
      if (type === "EXIF") {
        found = true;
        return "stop";
      }
      return undefined;
    });
    return found;
  }
  return false;
};
