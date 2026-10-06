import { describe, expect, it } from "vite-plus/test";
import { autoLayout, graphemes, layoutOf, textProblem } from "./text";

describe("autoLayout", () => {
  it.each([
    ["草", ["草"], "square", "stretch", "center"],
    ["優勝", ["優勝"], "square", "stretch", "center"],
    ["えらい", ["えら", "い"], "square", "keep", "left"],
    ["ええやん", ["ええ", "やん"], "square", "stretch", "center"],
    ["ありがとう", ["ありがとう"], "wide", "stretch", "center"],
    ["おつかれさま", ["おつかれさま"], "wide", "stretch", "center"],
    ["完全に理解した", ["完全に理", "解した"], "wide", "stretch", "center"],
    [
      "ありがとうございます",
      ["ありがとう", "ございます"],
      "wide",
      "stretch",
      "center",
    ],
  ])("%s", (text, lines, shape, fit, align) => {
    expect(autoLayout(text)).toEqual({ lines, shape, fit, align });
  });

  it("打った改行と空白は使わない", () => {
    expect(autoLayout("え\nえ や ん").lines).toEqual(["ええ", "やん"]);
  });
});

describe("layoutOf（打った行のとおり）", () => {
  it("改行が無ければ 1 行", () => {
    expect(layoutOf("ええやん", false)).toMatchObject({
      lines: ["ええやん"],
      shape: "wide",
    });
  });

  it("改行で分ける。1 行の字数が行数より 2 字以上多ければ横長", () => {
    expect(layoutOf("え\nえやん", false)).toMatchObject({
      lines: ["え", "えやん"],
      shape: "square",
    });
    expect(layoutOf("え\nええやんな", false).shape).toBe("wide");
  });

  it("空の行は数えない", () => {
    expect(layoutOf("え\n\nえ\n", false).lines).toEqual(["え", "え"]);
  });
});

describe("textProblem", () => {
  it("空と字数の超過", () => {
    expect(textProblem(" \n", true)).toEqual({ type: "empty" });
    expect(textProblem("あ".repeat(13), true)).toEqual({
      type: "too-many-chars",
      count: 13,
    });
    expect(textProblem("あ".repeat(12), true)).toBeUndefined();
  });

  it("行数は、打った行のとおりに並べるときだけ数える", () => {
    expect(textProblem("あ\nい\nう\nえ", true)).toBeUndefined();
    expect(textProblem("あ\nい\nう\nえ", false)).toEqual({
      type: "too-many-lines",
      count: 4,
    });
  });
});

it("graphemes は絵文字の組み合わせを割らない", () => {
  expect(graphemes("あ👨‍👩‍👧い")).toEqual(["あ", "👨‍👩‍👧", "い"]);
});
