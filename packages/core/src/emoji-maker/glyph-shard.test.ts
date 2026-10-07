import { describe, expect, it } from "vite-plus/test";
import { decodeShard, encodeGlyph, shardName } from "./glyph-shard";

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out.buffer;
};

describe("輪郭のファイル", () => {
  it("書いたものを読める", () => {
    const shard = decodeShard(
      concat([
        encodeGlyph(0x3042, {
          advance: 1000,
          box: [10, -800, 990, 60],
          contours: [
            [10, -800, 990, -800, 990, 60],
            [100, -100, 200, -100, 200, 0, 100, 0],
          ],
        }),
        // 輪郭の無い字（空白）
        encodeGlyph(0x3000, { advance: 1000, box: [0, 0, 0, 0], contours: [] }),
      ]),
    );
    const glyph = shard.get(0x3042);
    expect(glyph?.advance).toBe(1000);
    expect(glyph?.box).toEqual([10, -800, 990, 60]);
    expect(glyph?.contours.map((points) => [...points])).toEqual([
      [10, -800, 990, -800, 990, 60],
      [100, -100, 200, -100, 200, 0, 100, 0],
    ]);
    expect(shard.get(0x3000)?.contours).toEqual([]);
    expect(shard.get(0x3043)).toBeUndefined();
  });

  it("64 字ごとに分ける", () => {
    expect(shardName(0x3042)).toBe("c1");
    expect(shardName(0x307f)).toBe("c1");
    expect(shardName(0x3080)).toBe("c2");
  });
});
