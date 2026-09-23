import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { BlurhashCanvas } from "./NoteMedia";

const SAMPLE = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

const Placeholder: Component<{ hash: string; ratio: number }> = (props) => (
  <div
    class="relative max-w-full overflow-hidden rounded-2 bg-secondary"
    style={{
      width: `min(100%, ${180 * props.ratio}px)`,
      "aspect-ratio": `${props.ratio}`,
    }}
  >
    <BlurhashCanvas hash={props.hash} ratio={props.ratio} />
  </div>
);

const meta = {
  title: "イベント/メディアの読み込み中",
  component: Placeholder,
  args: { hash: SAMPLE, ratio: 16 / 9 },
} satisfies Meta<typeof Placeholder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 横長: Story = {};
export const 縦長: Story = { args: { ratio: 9 / 16 } };
export const 壊れたBlurhash: Story = { args: { hash: "invalid" } };
