import type { Meta, StoryObj } from "storybook-solidjs-vite";
import clipUrl from "../../storybook/media-clip.mp4";
import landscapeUrl from "../../storybook/media-landscape.svg?no-inline";
import portraitUrl from "../../storybook/media-portrait.svg?no-inline";
import squareUrl from "../../storybook/media-square.svg?no-inline";
import { EventStory, alice, eventStoryMeta, scene } from "./event-story";

const absolute = (url: string) => new URL(url, location.href).href;
const imeta = (url: string, mime: string, dim: string) => [
  "imeta",
  `url ${absolute(url)}`,
  `m ${mime}`,
  `dim ${dim}`,
];

// 画像・動画の投稿は、本文に URL を書かず imeta にだけ置く。
const picture = alice.event({
  kind: 20,
  content: "夕方の海。風が強かった。",
  tags: [
    ["title", "海辺の散歩"],
    imeta(landscapeUrl, "image/svg+xml", "1600x900"),
    imeta(squareUrl, "image/svg+xml", "900x900"),
  ],
});
const pictureWithoutTitle = alice.event({
  kind: 20,
  content: "",
  tags: [imeta(portraitUrl, "image/svg+xml", "900x1600")],
});
const longTitle = alice.event({
  kind: 20,
  content: "説明も長めに書いてある。".repeat(8),
  tags: [
    [
      "title",
      "とても長い題名がついた画像の投稿で、狭いカラムでは折り返して読める".repeat(
        2,
      ),
    ],
    imeta(landscapeUrl, "image/svg+xml", "1600x900"),
  ],
});
const video = alice.event({
  kind: 21,
  content: "テスト用の短い動画です。",
  tags: [["title", "動画の投稿"], imeta(clipUrl, "video/mp4", "320x180")],
});
const shortVideo = alice.event({
  kind: 22,
  content: "縦長の短い動画。",
  tags: [imeta(clipUrl, "video/mp4", "320x180")],
});
const brokenPicture = alice.event({
  kind: 20,
  content: "読み込めない画像。",
  tags: [["imeta", "url https://example.invalid/missing.jpg", "m image/jpeg"]],
});

const meta = {
  ...eventStoryMeta,
  title: "イベント/画像・動画の投稿",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 返信とリポストは、まだ作れないので押せない（引用はできる）。 */
export const 画像: Story = {
  args: { event: picture, scene: scene(picture) },
};

export const 画像_題名も本文も無い: Story = {
  args: { event: pictureWithoutTitle, scene: scene(pictureWithoutTitle) },
};

export const 画像_長い題名: Story = {
  args: { event: longTitle, scene: scene(longTitle) },
};

export const 画像_コンパクト: Story = {
  args: { event: picture, scene: scene(picture), size: "compact" },
};

export const 画像_展開を切る: Story = {
  args: { event: picture, scene: scene(picture), expandMedia: false },
};

export const 画像_読み込めない: Story = {
  args: { event: brokenPicture, scene: scene(brokenPicture) },
};

export const 動画: Story = {
  args: { event: video, scene: scene(video) },
};

export const 短い動画: Story = {
  args: { event: shortVideo, scene: scene(shortVideo) },
};
