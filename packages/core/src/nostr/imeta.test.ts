import { describe, expect, it } from "vite-plus/test";
import { inlineMediaMetadata } from "./imeta";

describe("inlineMediaMetadata", () => {
  it("順序に依存せず imeta の種類・寸法・Blurhash を URL に結び付ける", () => {
    const result = inlineMediaMetadata([
      [
        "imeta",
        "blurhash LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        "dim 400x300",
        "url https://example.com/a",
        "m image/png",
      ],
    ]);
    expect(result.get("https://example.com/a")).toEqual({
      mime: "image/png",
      dimensions: { width: 400, height: 300 },
      blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
    });
  });

  it("不正な寸法を無視し、同じ URL は最初のタグを優先する", () => {
    const result = inlineMediaMetadata([
      ["imeta", "url https://example.com/a", "dim 0x300"],
      ["imeta", "url https://example.com/a", "dim 400x300"],
      ["imeta", "url https://example.com/b", "dim 100001x1"],
      ["imeta", "url https://example.com/c", "dim 1x10000"],
      ["imeta", "m image/png"],
    ]);
    expect(result.get("https://example.com/a")?.dimensions).toBeUndefined();
    expect(result.get("https://example.com/b")?.dimensions).toBeUndefined();
    expect(result.get("https://example.com/c")?.dimensions).toBeUndefined();
    expect(result.size).toBe(3);
  });

  it("MIME の形でない m を捨て、小数点以下が 0 の寸法は読む", () => {
    const result = inlineMediaMetadata([
      [
        "imeta",
        "url https://blossom.primal.net/a.jpg",
        "m jpeg",
        "dim 4284.0x5712.0",
      ],
      ["imeta", "url https://example.com/b", "dim 400.5x300"],
    ]);
    expect(result.get("https://blossom.primal.net/a.jpg")).toEqual({
      mime: undefined,
      dimensions: { width: 4284, height: 5712 },
      blurhash: undefined,
    });
    expect(result.get("https://example.com/b")?.dimensions).toBeUndefined();
  });
});
