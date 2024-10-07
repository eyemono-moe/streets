import { expect, test } from "vitest";
import { parseTextContent } from "./parseTextContent";

test("parseTextContent", () => {
  const parsed = parseTextContent(
    "上手くいっていればリンクは良い感じにリンクになるし  https://eyemono.moe  引用は良い感じに引用されるし nostr:note1pyl5479w94dq7tksg2x3ggys3fzjat6kyd44pv5hkcvh93hzjjnqvk56mv 画像は良い感じに表示されてるはずだし\nhttps://image.nostr.build/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg\nメンションもいい感じになってるはず nostr:npub1m0n0eyetgrflxghneeckkv95ukrn0fdpzyysscy4vha3gm64739qxn23sk #testHashtag",
    [
      {
        kind: "p",
        pubkey:
          "dbe6fc932b40d3f322f3ce716b30b4e58737a5a1110908609565fb146f55f44a",
        relay: undefined,
        petname: undefined,
      },
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
    ],
  );

  expect(parsed).toEqual([
    {
      type: "text",
      content: "上手くいっていればリンクは良い感じにリンクになるし  ",
    },
    {
      type: "link",
      href: "https://eyemono.moe",
      content: "https://eyemono.moe",
    },
    { type: "text", content: "  引用は良い感じに引用されるし " },
    {
      type: "quote",
      id: "093f4af8ae2d5a0f2ed0428d1420908a452eaf56236b50b297b61972c6e294a6",
    },
    { type: "text", content: " 画像は良い感じに表示されてるはずだし\n" },
    {
      type: "image",
      src: "https://image.nostr.build/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg",
      alt: undefined,
      blurhash: "LpKw?||dxZtPx=kOWTkBWYk8a|ay",
      thumb:
        "https://image.nostr.build/thumb/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg",
      size: { width: 512, height: 342 },
    },
    { type: "text", content: "\nメンションもいい感じになってるはず " },
    {
      type: "mention",
      pubkey:
        "dbe6fc932b40d3f322f3ce716b30b4e58737a5a1110908609565fb146f55f44a",
    },
    { type: "text", content: " " },
    { type: "hashtag", tag: "testHashtag" },
  ]);
});
