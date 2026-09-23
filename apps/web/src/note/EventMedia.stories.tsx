import { type Component, Show, createMemo } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
// 小さい SVG は data URI に埋め込まれ、本文の URL として拾われなくなるので、ファイルのまま配信させる。
import landscapeUrl from "../storybook/media-landscape.svg?no-inline";
import panoramaUrl from "../storybook/media-panorama.svg?no-inline";
import portraitUrl from "../storybook/media-portrait.svg?no-inline";
import squareUrl from "../storybook/media-square.svg?no-inline";
import standardUrl from "../storybook/media-standard.svg?no-inline";
import tallUrl from "../storybook/media-tall.svg?no-inline";
import { createStoryAuthor } from "../storybook/story-events";
import Event, { type EventSize } from "./Event";

const MEDIA = {
  "16:9": landscapeUrl,
  "4:3": standardUrl,
  "1:1": squareUrl,
  "9:16": portraitUrl,
  "4:1": panoramaUrl,
  "1:4": tallUrl,
};
type Aspect = keyof typeof MEDIA;
const DIMENSIONS: Record<Aspect, string> = {
  "16:9": "1600x900",
  "4:3": "1200x900",
  "1:1": "900x900",
  "9:16": "900x1600",
  "4:1": "1600x400",
  "1:4": "400x1600",
};
const SAMPLE_BLURHASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

// 本文の URL は http(s) で始まらないと画像として拾われないので、配信元の origin を付ける。
const absolute = (url: string) => new URL(url, location.href).href;

const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "あいもの",
  picture: avatarUrl,
});

type Props = {
  aspects: Aspect[];
  size: EventSize;
  metadata?: "dimensions" | "blurhash";
};

const MediaStory: Component<Props> = (props) => {
  const event = createMemo(() =>
    alice.note(
      `縦横比 ${props.aspects.join(" / ")} の画像。\n${props.aspects
        .map((aspect) => absolute(MEDIA[aspect]))
        .join("\n")}`,
      props.metadata
        ? props.aspects.map((aspect) => [
            "imeta",
            `url ${absolute(MEDIA[aspect])}`,
            "m image/svg+xml",
            `dim ${DIMENSIONS[aspect]}`,
            ...(props.metadata === "blurhash"
              ? [`blurhash ${SAMPLE_BLURHASH}`]
              : []),
          ])
        : [],
    ),
  );
  // Controls で枚数を変えたとき、シーンごと作り直す。
  return (
    <Show when={event()} keyed>
      {(current) => (
        <EventSceneProvider scene={{ events: [alice.profile(), current] }}>
          <Event event={current} size={props.size} />
        </EventSceneProvider>
      )}
    </Show>
  );
};

const meta = {
  title: "イベント/メディア",
  component: MediaStory,
  args: { size: "normal", aspects: ["16:9"] },
  argTypes: {
    size: { control: "inline-radio", options: ["normal", "compact"] },
    aspects: { control: "check", options: Object.keys(MEDIA) },
    metadata: {
      control: "inline-radio",
      options: [undefined, "dimensions", "blurhash"],
    },
  },
} satisfies Meta<typeof MediaStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 横長: Story = { args: { aspects: ["16:9"] } };
export const 正方形: Story = { args: { aspects: ["1:1"] } };
export const 縦長: Story = { args: { aspects: ["9:16"] } };
export const パノラマ: Story = { args: { aspects: ["4:1"] } };
export const 極端な縦長: Story = { args: { aspects: ["1:4"] } };
export const 複数枚: Story = {
  args: { aspects: ["16:9", "4:3", "1:1", "9:16", "4:1", "1:4"] },
};

export const 寸法つき: Story = {
  args: { aspects: ["16:9", "9:16", "4:1", "1:4"], metadata: "dimensions" },
};

export const Blurhashつき: Story = {
  args: { aspects: ["16:9", "9:16"], metadata: "blurhash" },
};

export const コンパクト_寸法つき: Story = {
  args: { aspects: ["16:9", "9:16"], metadata: "dimensions", size: "compact" },
};
