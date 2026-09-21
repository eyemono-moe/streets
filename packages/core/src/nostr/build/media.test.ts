import { describe, expect, it } from "vitest";
import type { BlobDescriptor } from "../../media/blossom";
import { appendMediaUrl, imetaTag, withMedia } from "./media";
import { buildNote } from "./note";

const blob: BlobDescriptor = {
  url: "https://a.example/cat.png",
  sha256: "f".repeat(64),
  size: 1234,
  type: "image/png",
};

describe("imetaTag", () => {
  it("URL・種類・ハッシュ・大きさを 1 つのタグにまとめる", () => {
    expect(imetaTag(blob)).toEqual([
      "imeta",
      "url https://a.example/cat.png",
      "m image/png",
      `x ${"f".repeat(64)}`,
      "size 1234",
    ]);
  });

  it("分からない項目は書かない", () => {
    expect(imetaTag({ url: blob.url, sha256: blob.sha256, size: 0 })).toEqual([
      "imeta",
      "url https://a.example/cat.png",
      `x ${"f".repeat(64)}`,
    ]);
  });
});

describe("appendMediaUrl", () => {
  it("本文の末尾に改行して足す", () => {
    expect(appendMediaUrl("ねこ", blob.url)).toBe(`ねこ\n${blob.url}`);
  });

  it("空の本文なら URL だけ", () => {
    expect(appendMediaUrl("  ", blob.url)).toBe(blob.url);
  });

  it("もう本文にある URL は足さない", () => {
    const content = `見て ${blob.url}`;
    expect(appendMediaUrl(content, blob.url)).toBe(content);
  });
});

describe("withMedia", () => {
  it("本文へ URL を足し、imeta タグを添える", () => {
    const draft = withMedia(buildNote("ねこ"), [blob]);
    expect(draft.content).toBe(`ねこ\n${blob.url}`);
    expect(draft.tags).toContainEqual(imetaTag(blob));
  });

  it("添えるものが無ければそのまま", () => {
    const note = buildNote("ねこ");
    expect(withMedia(note, [])).toBe(note);
  });
});
