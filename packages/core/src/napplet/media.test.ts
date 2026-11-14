import { describe, expect, it } from "vite-plus/test";
import {
  acceptPresentationBytes,
  parsePresentationMedia,
  sniffMediaFormat,
} from "./media";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
const WEBM = new Uint8Array([
  0x1a,
  0x45,
  0xdf,
  0xa3,
  0x9f,
  0x42,
  0x86,
  0x81,
  0x01,
  0x42,
  0x82,
  0x84,
  ...new TextEncoder().encode("webm"),
]);
const MP4 = new TextEncoder().encode("\u0000\u0000\u0000\u0018ftypisom");

describe("parsePresentationMedia", () => {
  /*
   * NIP-5D（PR #2303、2026-10-28 版）の Presentation media の例:
   * > ["screenshot", "x <sha256>", "m image/png", "dim 1200x750", "size 184320", "alt The puzzle board"],
   * > ["preview", "x <sha256>", "m video/webm", "dim 960x600", "duration 8.5", "alt Building a bridge"]
   */
  it("NIP-5D の例のスクリーンショットとプレビューを読む", () => {
    expect(
      parsePresentationMedia([
        [
          "screenshot",
          `x ${A}`,
          "m image/png",
          "dim 1200x750",
          "size 184320",
          "alt The puzzle board",
        ],
        [
          "preview",
          `x ${B}`,
          "m video/webm",
          "dim 960x600",
          "duration 8.5",
          "alt Building a bridge",
        ],
      ]),
    ).toEqual({
      screenshots: [
        {
          hash: A,
          mime: "image/png",
          dim: { width: 1200, height: 750 },
          size: 184320,
          alt: "The puzzle board",
        },
      ],
      preview: {
        hash: B,
        mime: "video/webm",
        dim: { width: 960, height: 600 },
        duration: 8.5,
        alt: "Building a bridge",
      },
    });
  });

  // > Field order is insignificant.
  // > No `url` field or matching URL in the event content is required.
  it("欄の順は問わず、x だけでも読む", () => {
    expect(
      parsePresentationMedia([
        ["screenshot", "alt Board", `x ${A}`],
        ["screenshot", `x ${B}`],
      ]).screenshots,
    ).toEqual([{ hash: A, alt: "Board" }, { hash: B }]);
  });

  // > Clients MUST ignore tags with missing, malformed or repeated `x` fields
  // > Extra or unusable entries MUST NOT suppress other usable screenshots
  it("x が無い・読めない・重なるタグだけを捨て、ほかのスクリーンショットは残す", () => {
    expect(
      parsePresentationMedia([
        ["screenshot", "m image/png"],
        ["screenshot", `x ${A.toUpperCase()}`],
        ["screenshot", "x abc"],
        ["screenshot", `x ${A}`, `x ${B}`],
        ["screenshot", A, "m image/png"],
        ["screenshot", `x ${C}`],
      ]).screenshots,
    ).toEqual([{ hash: C }]);
  });

  // > and ignore unknown, malformed or repeated optional fields.
  it("知らない欄・読めない欄・重なる欄は、その欄だけを無視する", () => {
    expect(
      parsePresentationMedia([
        [
          "screenshot",
          `x ${A}`,
          "blurhash LEHV6nWB2yk8",
          "dim 0x750",
          "size -1",
          "alt one",
          "alt two",
          "m image/png",
        ],
      ]).screenshots,
    ).toEqual([{ hash: A, mime: "image/png" }]);
  });

  // > Clients SHOULD preserve screenshot tag order
  it("スクリーンショットはタグの順に並べる", () => {
    expect(
      parsePresentationMedia([
        ["screenshot", `x ${C}`],
        ["x", A],
        ["screenshot", `x ${A}`],
        ["screenshot", `x ${B}`],
      ]).screenshots.map((media) => media.hash),
    ).toEqual([C, A, B]);
  });

  // > If multiple `preview` tags are present, clients MUST ignore the preview.
  it("preview が 2 つ以上あれば、プレビューを出さない", () => {
    expect(
      parsePresentationMedia([
        ["preview", `x ${A}`, "m video/webm"],
        ["preview", `x ${B}`, "m video/webm"],
      ]).preview,
    ).toBeUndefined();
  });

  // > decode screenshots as PNG, JPEG or WebP, or previews as a supported video format.
  // > When a valid `m` field is present, clients MUST also verify that it matches the decoded format.
  it("m が見本に使えない形を名乗るものは、取る前に外す", () => {
    const media = parsePresentationMedia([
      ["screenshot", `x ${A}`, "m image/gif"],
      ["screenshot", `x ${B}`, "m image/webp"],
      ["preview", `x ${C}`, "m image/png"],
    ]);
    expect(media.screenshots).toEqual([{ hash: B, mime: "image/webp" }]);
    expect(media.preview).toBeUndefined();
  });
});

describe("sniffMediaFormat", () => {
  it("先頭のバイトから PNG・JPEG・WebP・WebM・MP4 を見分ける", () => {
    expect(sniffMediaFormat(PNG)).toBe("image/png");
    expect(sniffMediaFormat(JPEG)).toBe("image/jpeg");
    expect(sniffMediaFormat(WEBP)).toBe("image/webp");
    expect(sniffMediaFormat(WEBM)).toBe("video/webm");
    expect(sniffMediaFormat(MP4)).toBe("video/mp4");
    expect(
      sniffMediaFormat(new TextEncoder().encode("<svg xmlns=")),
    ).toBeUndefined();
  });
});

describe("acceptPresentationBytes", () => {
  // > decode screenshots as PNG, JPEG or WebP
  it("スクリーンショットは PNG・JPEG・WebP だけを出す", () => {
    expect(acceptPresentationBytes("screenshot", { hash: A }, JPEG)).toBe(
      "image/jpeg",
    );
    expect(
      acceptPresentationBytes("screenshot", { hash: A }, WEBM),
    ).toBeUndefined();
  });

  // > When a valid `m` field is present, clients MUST also verify that it matches the decoded format.
  it("m があれば、中身の形と同じときだけ出す", () => {
    expect(
      acceptPresentationBytes(
        "screenshot",
        { hash: A, mime: "image/png" },
        PNG,
      ),
    ).toBe("image/png");
    expect(
      acceptPresentationBytes(
        "screenshot",
        { hash: A, mime: "image/jpeg" },
        PNG,
      ),
    ).toBeUndefined();
  });

  // > or previews as a supported video format.
  it("プレビューは動画だけを出す", () => {
    expect(
      acceptPresentationBytes("preview", { hash: A, mime: "video/webm" }, WEBM),
    ).toBe("video/webm");
    expect(acceptPresentationBytes("preview", { hash: A }, MP4)).toBe(
      "video/mp4",
    );
    expect(
      acceptPresentationBytes("preview", { hash: A }, PNG),
    ).toBeUndefined();
  });
});
