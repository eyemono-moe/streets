import { describe, expect, it } from "vite-plus/test";
import {
  loadImageDownscaling,
  saveImageDownscaling,
} from "./image-downscaling-setting";

describe("画像を縮めて表示する設定", () => {
  it("未保存と読めない値では縮める", () => {
    expect(loadImageDownscaling(null)).toBe(true);
    expect(loadImageDownscaling("unknown")).toBe(true);
  });

  it("保存したオン・オフを読み戻せる", () => {
    expect(loadImageDownscaling(saveImageDownscaling(true))).toBe(true);
    expect(loadImageDownscaling(saveImageDownscaling(false))).toBe(false);
  });
});
