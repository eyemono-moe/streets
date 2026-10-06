import { describe, expect, it } from "vite-plus/test";
import type { EmojiSpec } from "./spec";
import {
  EMOJI_ORIGIN,
  canonicalSpec,
  defaultShortcode,
  emojiKey,
  emojiUrl,
  isValidSpec,
  parseEmojiKey,
} from "./url";

const spec: EmojiSpec = {
  lines: ["ええ", "やん"],
  shape: "square",
  fit: "stretch",
  align: "center",
  color: "#3ee0f0",
  outline: "#1b1b1f",
  outlineWidth: 7,
  font: "rounded",
};

describe("URL", () => {
  it("見た目と文字を、決まった形で並べる", () => {
    expect(emojiKey(spec)).toBe(
      "v1/rounded-square-stretch-center-3ee0f0-1b1b1f-7/44GI44GICuOChOOCkw.png",
    );
    expect(emojiUrl(spec)).toBe(`${EMOJI_ORIGIN}/${emojiKey(spec)}`);
  });

  it("名前だけから指定を読み戻せる（R2 から消えても描き直せる）", () => {
    expect(parseEmojiKey(emojiKey(spec))).toEqual(spec);
    const keep: EmojiSpec = {
      ...spec,
      lines: ["えら", "い"],
      fit: "keep",
      align: "left",
      outline: null,
      outlineWidth: 0,
    };
    expect(parseEmojiKey(emojiKey(keep))).toEqual(keep);
  });

  it("同じ見た目になる指定は、同じ URL になる", () => {
    const same = [
      { ...spec, align: "left" as const }, // 伸ばすときはそろえを使わない
      { ...spec, color: "#3EE0F0" as const },
    ];
    for (const other of same) expect(emojiKey(other)).toBe(emojiKey(spec));
    expect(emojiKey({ ...spec, outline: null, outlineWidth: 7 })).toBe(
      emojiKey({ ...spec, outline: null, outlineWidth: 0 }),
    );
  });

  it("そろえた形でない名前は読まない（同じ見た目に別の名前を作らせない）", () => {
    const key = emojiKey(spec);
    expect(parseEmojiKey(key.replace("center", "left"))).toBeUndefined();
    expect(parseEmojiKey(key.replace("3ee0f0", "3EE0F0"))).toBeUndefined();
    expect(parseEmojiKey(key.replace("v1/", "v2/"))).toBeUndefined();
    expect(parseEmojiKey(`${key}x`)).toBeUndefined();
  });
});

describe("isValidSpec", () => {
  it("字数・行数・空白・色・太さを見る", () => {
    expect(isValidSpec(spec)).toBe(true);
    expect(isValidSpec({ ...spec, lines: ["あ".repeat(13)] })).toBe(false);
    expect(isValidSpec({ ...spec, lines: ["あ", "い", "う", "え"] })).toBe(
      false,
    );
    expect(isValidSpec({ ...spec, lines: ["あ い"] })).toBe(false);
    expect(isValidSpec({ ...spec, lines: [""] })).toBe(false);
    expect(isValidSpec({ ...spec, color: "#fff" })).toBe(false);
    expect(isValidSpec({ ...spec, outlineWidth: 0 })).toBe(false);
    expect(isValidSpec({ ...spec, outlineWidth: 13 })).toBe(false);
    expect(isValidSpec({ ...spec, outline: null, outlineWidth: 99 })).toBe(
      true,
    );
  });
});

it("canonicalSpec", () => {
  expect(
    canonicalSpec({ ...spec, outline: null, align: "right" }),
  ).toMatchObject({
    outline: null,
    outlineWidth: 0,
    align: "center",
  });
});

it("defaultShortcode は見た目ごとに決まり、英数字と _ だけ", () => {
  const code = defaultShortcode(spec);
  expect(code).toMatch(/^streets_[0-9a-f]{6}$/);
  expect(defaultShortcode({ ...spec, align: "left" })).toBe(code);
  expect(defaultShortcode({ ...spec, color: "#ffffff" })).not.toBe(code);
});
