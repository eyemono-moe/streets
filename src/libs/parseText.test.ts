import { expect, test } from "vitest";
import { parseShortTextNote } from "../features/ShortText/event";
import { parseTextContent } from "./parseTextContent";

test("parseTextContent", () => {
  const content = parseShortTextNote({
    id: "335f0616d957e793aaa48c1064a24e7e5f86af977b8fed46cc4c0c2877f54d2e",
    kind: 1,
    pubkey: "dbe6fc932b40d3f322f3ce716b30b4e58737a5a1110908609565fb146f55f44a",
    created_at: 1727518910,
    content:
      "上手くいっていればリンクは良い感じにリンクになるし  https://eyemono.moe  引用は良い感じに引用されるし nostr:note1pyl5479w94dq7tksg2x3ggys3fzjat6kyd44pv5hkcvh93hzjjnqvk56mv 画像は良い感じに表示されてるはずだし\nhttps://image.nostr.build/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg\nメンションもいい感じになってるはず nostr:npub1m0n0eyetgrflxghneeckkv95ukrn0fdpzyysscy4vha3gm64739qxn23sk",
    tags: [
      [
        "e",
        "8b2636e3d0a37bae644ce3bf810406521080deb0f6f6f6ec15ef0c7ad027771d",
        "",
        "root",
      ],
      [
        "e",
        "093f4af8ae2d5a0f2ed0428d1420908a452eaf56236b50b297b61972c6e294a6",
        "",
        "mention",
      ],
      ["p", "dbe6fc932b40d3f322f3ce716b30b4e58737a5a1110908609565fb146f55f44a"],
      ["r", "https://eyemono.moe"],
      [
        "r",
        "https://image.nostr.build/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg",
      ],
      [
        "imeta",
        "url https://image.nostr.build/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg",
        "ox b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721",
        "x 94671ee65c185df74c0cab40fac2f5c5b8d040034cdac9619695970d6505e482",
        "m image/jpeg",
        "dim 512x342",
        "bh LpKw?||dxZtPx=kOWTkBWYk8a|ay",
        "blurhash LpKw?||dxZtPx=kOWTkBWYk8a|ay",
        "thumb https://image.nostr.build/thumb/b088913a823a197da6c15d37cdcbe15578f22711274c37fc5bd08b4fb538c721.jpg",
      ],
    ],
    sig: "fe829e16e1bbefd106df11488ab1f91a047b1b492f56172460357e127bcfbc007734075be44d79be4c680fa0be0e969268801bd516f4ec4b2fd08ce5ff9b21d0",
  });

  expect(parseTextContent(content)).toEqual([
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
  ]);
});
