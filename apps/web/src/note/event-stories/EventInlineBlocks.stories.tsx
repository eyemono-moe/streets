import { encodeBech32 } from "@streets/core/nostr/nip19";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
// 小さい SVG は data URI に埋め込まれ、本文の URL として拾われなくなるので、ファイルのまま配信させる。
import landscapeUrl from "../../storybook/media-landscape.svg?no-inline";
import portraitUrl from "../../storybook/media-portrait.svg?no-inline";
import squareUrl from "../../storybook/media-square.svg?no-inline";
import { EventStory, bob, eventStoryMeta, plain, scene } from "./event-story";

// 本文の URL は http(s) で始まらないと画像として拾われないので、配信元の origin を付ける。
const absolute = (url: string) => new URL(url, location.href).href;
const landscape = absolute(landscapeUrl);
const portrait = absolute(portraitUrl);
const square = absolute(squareUrl);
const imeta = (url: string, dim: string) => [
  "imeta",
  `url ${url}`,
  "m image/svg+xml",
  `dim ${dim}`,
];
const landscapeMeta = imeta(landscape, "1600x900");
const quoted = `nostr:${encodeBech32("note", plain.id)}`;

const imageInMiddle = bob.note(
  `昨日の散歩の話。\n${landscape}\n川沿いを歩いて、橋の下で休んだ。\n${square}\nそのあと駅まで戻った。`,
  [landscapeMeta, imeta(square, "900x900")],
);
const quoteInMiddle = bob.note(
  `この投稿について。\n${quoted}\n同じことを考えていた。`,
  [["q", plain.id]],
);
const imageFirst = bob.note(`${landscape}\n画像を先に置いた投稿。`, [
  landscapeMeta,
]);
const oneImage = bob.note(
  `短い本文に画像が 1 枚付いた投稿は畳まない。\n${portrait}`,
  [imeta(portrait, "900x1600")],
);
const images = (count: number) =>
  bob.note(
    `画像 ${count} 枚の投稿。\n${Array.from({ length: count }, () => landscape).join("\n")}`,
    [landscapeMeta],
  );
const twoImages = images(2);
const fiveImages = images(5);
const tenImages = images(10);
const textAndImages = bob.note(
  `${Array.from(
    { length: 6 },
    (_, index) =>
      `${index + 1}. 本文と画像が交互に並ぶ長い投稿は、画像も含めて畳む。`,
  ).join(`\n${landscape}\n`)}`,
  [landscapeMeta],
);

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/書かれた位置",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 本文の途中の画像: Story = {
  args: { event: imageInMiddle, scene: scene(imageInMiddle) },
};

export const 本文の途中の引用: Story = {
  args: { event: quoteInMiddle, scene: scene(quoteInMiddle, plain) },
};

export const 本文の途中の引用_コンパクト: Story = {
  args: {
    event: quoteInMiddle,
    scene: scene(quoteInMiddle, plain),
    size: "compact",
  },
};

export const 先頭の画像: Story = {
  args: { event: imageFirst, scene: scene(imageFirst) },
};

export const 縦長の画像1枚は畳まない: Story = {
  args: { event: oneImage, scene: scene(oneImage) },
};

export const 画像2枚: Story = {
  args: { event: twoImages, scene: scene(twoImages) },
};

export const 画像5枚は畳む: Story = {
  args: { event: fiveImages, scene: scene(fiveImages) },
};

export const 画像10枚を重ねたカラムで開いたとき: Story = {
  args: { event: tenImages, scene: scene(tenImages), fullBody: true },
};

export const 本文と画像が交互に並ぶ長い投稿: Story = {
  args: { event: textAndImages, scene: scene(textAndImages) },
};

export const 本文と画像が交互に並ぶ長い投稿_コンパクト: Story = {
  args: { event: textAndImages, scene: scene(textAndImages), size: "compact" },
};
