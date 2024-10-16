import { describe, expect, test } from "vitest";
import { parseTextContent, parsedContents2Tags } from "./parseTextContent";

describe("parseTextContent", () => {
  const parsed = parseTextContent(
    `リンク https://eyemono.moe 引用 nostr:note1pyl5479w94dq7tksg2x3ggys3fzjat6kyd44pv5hkcvh93hzjjnqvk56mv 画像 https://image.nostr.build/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg メンション nostr:npub1m0n0eyetgrflxghneeckkv95ukrn0fdpzyysscy4vha3gm64739qxn23sk ハッシュタグ #testHashtag emoji :naruhodo: ハッシュタグの前後には空白が必要#testHashtag
改行時は空白不要
#testHashtag
`,
    [
      {
        kind: "imeta",
        url: "https://image.nostr.build/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg",
        ox: "b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721",
        x: "94671ee65c185df74c0cab40fac2f5c5b8d040034cdac9619695970d6505e482",
        m: "image/jpeg",
        dim: "512x342",
        bh: "LpKw?||dxZtPx=kOWTkBWYk8a|ay",
        blurhash: "LpKw?||dxZtPx=kOWTkBWYk8a|ay",
        thumb:
          "https://image.nostr.build/thumb/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg",
      },
      {
        kind: "emoji",
        name: "naruhodo",
        url: "https://example.com/naruhodo.png",
      },
    ],
    true,
  );
  test("parseTextContent", () => {
    expect(parsed).toEqual([
      { type: "text", content: "リンク " },
      {
        type: "link",
        href: "https://eyemono.moe",
        content: "https://eyemono.moe",
      },
      { type: "text", content: " 引用 " },
      {
        type: "quoteByID",
        id: "093f4af8ae2d5a0f2ed0428d1420908a452eaf56236b50b297b61972c6e294a6",
      },
      { type: "text", content: " 画像 " },
      {
        type: "image",
        src: "https://image.nostr.build/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg",
        alt: undefined,
        blurhash: "LpKw?||dxZtPx=kOWTkBWYk8a|ay",
        thumb:
          "https://image.nostr.build/thumb/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg",
        size: { width: 512, height: 342 },
      },
      { type: "text", content: " メンション " },
      {
        type: "mention",
        pubkey:
          "dbe6fc932b40d3f322f3ce716b30b4e58737a5a1110908609565fb146f55f44a",
      },
      { type: "text", content: " ハッシュタグ " },
      { type: "hashtag", tag: "testHashtag" },
      { type: "text", content: " emoji " },
      {
        type: "emoji",
        tag: "naruhodo",
        url: "https://example.com/naruhodo.png",
      },
      {
        type: "text",
        content:
          " ハッシュタグの前後には空白が必要#testHashtag\n改行時は空白不要\n",
      },
      { type: "hashtag", tag: "testHashtag" },
      { type: "text", content: "\n" },
    ]);
  });

  test("parsedContents2Tags", () => {
    const actual = parsedContents2Tags(parsed);
    expect(actual).toEqual([
      ["r", "https://eyemono.moe"],
      ["q", "093f4af8ae2d5a0f2ed0428d1420908a452eaf56236b50b297b61972c6e294a6"],
      ["p", "dbe6fc932b40d3f322f3ce716b30b4e58737a5a1110908609565fb146f55f44a"],
      ["t", "testHashtag"],
      ["emoji", "naruhodo", "https://example.com/naruhodo.png"],
      ["t", "testHashtag"],
    ]);
  });
});
