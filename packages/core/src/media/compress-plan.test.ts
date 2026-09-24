import { describe, expect, it } from "vite-plus/test";
import {
  FIRST_QUALITY,
  MAX_EDGE,
  compressionAttempts,
  fitWithin,
  outputTypeFor,
} from "./compress-plan";

describe("outputTypeFor", () => {
  it("JPEG と WebP はそのまま", () => {
    for (const inputType of ["image/jpeg", "image/webp"]) {
      expect(
        outputTypeFor({ inputType, overLimit: true, hasAlpha: true }),
      ).toBe(inputType);
    }
  });

  it("PNG は上限に収まるなら PNG のまま", () => {
    // 捕まえる変異: いつも変える（スクリーンショットの文字が JPEG で滲む）
    expect(
      outputTypeFor({
        inputType: "image/png",
        overLimit: false,
        hasAlpha: false,
      }),
    ).toBe("image/png");
  });

  it("PNG が上限を超えるなら、透明が無ければ JPEG、あれば WebP", () => {
    expect(
      outputTypeFor({
        inputType: "image/png",
        overLimit: true,
        hasAlpha: false,
      }),
    ).toBe("image/jpeg");
    // 捕まえる変異: 透明があっても JPEG にする（透明が黒く潰れる）
    expect(
      outputTypeFor({
        inputType: "image/png",
        overLimit: true,
        hasAlpha: true,
      }),
    ).toBe("image/webp");
  });
});

describe("fitWithin", () => {
  it("長辺を上限に合わせ、縦横比を保つ", () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1920)).toEqual({
      width: 1920,
      height: 1440,
    });
    expect(fitWithin({ width: 1000, height: 4000 }, 1920)).toEqual({
      width: 480,
      height: 1920,
    });
  });

  it("小さい画像は引き伸ばさない", () => {
    expect(fitWithin({ width: 800, height: 600 }, 1920)).toEqual({
      width: 800,
      height: 600,
    });
  });
});

describe("compressionAttempts", () => {
  it("最初は長辺 1920px・最初の画質で試す", () => {
    const [first] = compressionAttempts(
      { width: 4000, height: 3000 },
      "image/jpeg",
    );
    expect(first).toEqual({
      width: MAX_EDGE,
      height: 1440,
      quality: FIRST_QUALITY,
    });
  });

  it("写真は画質を下げきってから、長辺を縮めて画質を戻す", () => {
    const attempts = [
      ...compressionAttempts({ width: 4000, height: 3000 }, "image/jpeg"),
    ];
    const qualities = attempts.slice(0, 6).map((attempt) => attempt.quality);
    expect(qualities).toEqual([0.92, 0.85, 0.75, 0.65, 0.55, 0.92]);
    expect(attempts[5]?.width).toBeLessThan(MAX_EDGE);
  });

  it("PNG は画質を下げず、大きさだけを縮める", () => {
    const attempts = [
      ...compressionAttempts({ width: 3000, height: 3000 }, "image/png"),
    ];
    expect(new Set(attempts.map((attempt) => attempt.quality))).toEqual(
      new Set([FIRST_QUALITY]),
    );
    const edges = attempts.map((attempt) => attempt.width);
    expect(edges).toEqual([...edges].sort((a, b) => b - a));
  });

  it("長辺 640px まで縮めたら終わる", () => {
    // 捕まえる変異: 下限を持たない（どこまでも縮めて、見られない大きさになる）
    const attempts = [
      ...compressionAttempts({ width: 4000, height: 3000 }, "image/jpeg"),
    ];
    const last = attempts.at(-1);
    expect(Math.max(last?.width ?? 0, last?.height ?? 0)).toBe(640);
    expect(attempts.length).toBeLessThan(40);
  });
});
