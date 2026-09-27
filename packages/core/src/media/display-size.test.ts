import { describe, expect, test } from "vite-plus/test";
import { MEDIA_MAX_EDGE, displaySize } from "./display-size";

describe("displaySize", () => {
  test("長辺を上限に合わせ、縦横の比を保つ", () => {
    expect(displaySize({ width: 4284, height: 5712 }, MEDIA_MAX_EDGE)).toEqual({
      width: 720,
      height: 960,
    });
    expect(displaySize({ width: 2880, height: 1620 }, 1200)).toEqual({
      width: 1200,
      height: 675,
    });
  });

  test("上限を少し超えるだけなら縮めない", () => {
    expect(displaySize({ width: 1200, height: 800 }, 960)).toBeUndefined();
    expect(displaySize({ width: 400, height: 300 }, 960)).toBeUndefined();
  });

  test("極端に細長くても 1px より小さくしない", () => {
    expect(displaySize({ width: 10000, height: 2 }, 960)).toEqual({
      width: 960,
      height: 1,
    });
  });
});
