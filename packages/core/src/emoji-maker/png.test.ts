import { crc32, inflateSync } from "node:zlib";
import { expect, it } from "vite-plus/test";
import { encodePng } from "./png";

it("PNG にした RGBA を、そのまま読み戻せる", async () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40,
  ]);
  const png = await encodePng(pixels, 2, 2);
  const view = new DataView(png.buffer);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  const chunks = new Map<string, Uint8Array>();
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + length);
    expect(view.getUint32(at + 8 + length)).toBe(
      crc32(png.subarray(at + 4, at + 8 + length)),
    );
    chunks.set(type, data);
    at += 12 + length;
  }
  expect([...chunks.keys()]).toEqual(["IHDR", "IDAT", "IEND"]);
  const header = new DataView(
    chunks.get("IHDR")!.buffer,
    chunks.get("IHDR")!.byteOffset,
  );
  expect([header.getUint32(0), header.getUint32(4)]).toEqual([2, 2]);
  expect([...inflateSync(chunks.get("IDAT")!)]).toEqual([
    0,
    ...pixels.subarray(0, 8),
    0,
    ...pixels.subarray(8, 16),
  ]);
});
