import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { PickerEmoji, PickerGroup } from "./emoji-data";
import EmojiPicker from "./EmojiPicker";
import { emojiKey } from "./recent-emoji";

const custom = (title: string, names: string[]): PickerGroup => ({
  id: title,
  title,
  emojis: names.map((name) => ({
    kind: "custom",
    shortcode: name,
    // 画像は読めなくてよい（読めないときの見た目も確かめられる）。
    url: `https://example.invalid/${name}.png`,
  })),
});

type Args = { customGroups: PickerGroup[] };

const Story = (props: Args) => {
  const [picked, setPicked] = createSignal<PickerEmoji>();
  return (
    <div class="flex flex-col items-start gap-3 bg-secondary p-6">
      <EmojiPicker customGroups={props.customGroups} onSelect={setPicked} />
      <p class="c-secondary text-caption" data-testid="picked">
        選んだもの: {picked() ? emojiKey(picked() as PickerEmoji) : "（まだ）"}
      </p>
    </div>
  );
};

const meta = {
  title: "絵文字/ピッカー",
  render: (args) => <Story {...args} />,
  args: {
    customGroups: [
      custom("ねこスタンプ", ["neko1", "neko2", "neko3", "neko4"]),
      custom("おこめ", ["kome", "onigiri"]),
    ],
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<Args>;

export const カスタム絵文字あり: S = {};

export const カスタム絵文字なし: S = { args: { customGroups: [] } };
