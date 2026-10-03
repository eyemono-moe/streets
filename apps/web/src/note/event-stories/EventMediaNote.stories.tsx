import type { Meta, StoryObj } from "storybook-solidjs-vite";
import clipUrl from "../../storybook/media-clip.mp4";
import portraitUrl from "../../storybook/media-portrait.svg?no-inline";
import toneUrl from "../../storybook/media-tone.mp3";
import { EventStory, alice, eventStoryMeta, scene } from "./event-story";

const videoUrl = new URL(clipUrl, location.href).href;
const withVideo = alice.note(`動画を添えました。\n${videoUrl}`, [
  ["imeta", `url ${videoUrl}`, "m video/mp4", "dim 320x180"],
]);
const audioUrl = new URL(toneUrl, location.href).href;
const withAudio = alice.note(`声を録りました。\n${audioUrl}`, [
  ["imeta", `url ${audioUrl}`, "m audio/mpeg"],
]);
const withBrokenAudio = alice.note(
  "読み込めない音声。\nhttps://example.invalid/voice.m4a",
);
// Primal は `m` に MIME でなく拡張子を、`dim` に小数を書く。
const primalImageUrl = new URL(portraitUrl, location.href).href;
const withLooseImeta = alice.note(`写真です。\n${primalImageUrl}`, [
  ["imeta", `url ${primalImageUrl}`, "m jpeg", "dim 900.0x1600.0"],
  ["client", "Primal iOS"],
]);

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/メディア",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 動画つき: Story = {
  args: { event: withVideo, scene: scene(withVideo) },
};

/** nostr.build は .gif の URL でも /mp4/ 以下では動画を返す。 */
const mp4GifUrl =
  "https://gifs.nostr.build/mp4/orig/82cc31b3042503850deee14d4c5459d6804b794a6a653b6b55b59659e73f4442.gif";
const mp4Gif = alice.note(`おはよう！\n${mp4GifUrl}`);
export const Gif拡張子の動画: Story = {
  args: { event: mp4Gif, scene: scene(mp4Gif) },
};

export const 動画_コンパクト: Story = {
  args: { event: withVideo, scene: scene(withVideo), size: "compact" },
};

export const 動画の展開を切る: Story = {
  args: { event: withVideo, scene: scene(withVideo), expandMedia: false },
};

export const 音声つき: Story = {
  args: { event: withAudio, scene: scene(withAudio) },
};

export const 音声_コンパクト: Story = {
  args: { event: withAudio, scene: scene(withAudio), size: "compact" },
};

export const 音声の展開を切る: Story = {
  args: { event: withAudio, scene: scene(withAudio), expandMedia: false },
};

/** 読み込めない音声は、再生バーの代わりにリンクを出す。 */
export const 音声_読み込めない: Story = {
  args: { event: withBrokenAudio, scene: scene(withBrokenAudio) },
};

export const 画像_imetaのMIMEが崩れている: Story = {
  args: { event: withLooseImeta, scene: scene(withLooseImeta) },
};
