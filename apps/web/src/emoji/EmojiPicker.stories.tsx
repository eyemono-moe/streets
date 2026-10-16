import { Show, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import Button from "../ui/Button";
import type { PickerEmoji, PickerGroup } from "./emoji-data";
import EmojiPicker from "./EmojiPicker";
import MakerFooter from "./maker/MakerFooter";
import PickerSurface, { type PickerLayout } from "./PickerSurface";
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

type Args = { customGroups: PickerGroup[]; layout?: PickerLayout };

const Story = (props: Args) => {
  const [picked, setPicked] = createSignal<PickerEmoji>();
  return (
    <div class="flex flex-col items-start gap-3 bg-secondary p-6">
      <Show
        when={props.layout === "sheet"}
        fallback={
          <EmojiPicker customGroups={props.customGroups} onSelect={setPicked} />
        }
      >
        {/* 触る端末のドロワーの中。幅 360px の画面で、画面の 6 割の高さに止めたところ。 */}
        <div class="flex h-120 w-90 flex-col rounded-t-3 border-control border-t bg-primary pt-2">
          <EmojiPicker
            layout="sheet"
            customGroups={props.customGroups}
            onSelect={setPicked}
            footer={(query) => (
              <MakerFooter
                layout="sheet"
                query={query()}
                lastStyle={undefined}
                sending={false}
                onSend={() => {}}
                onAdjust={() => {}}
              />
            )}
          />
        </div>
      </Show>
      <p class="c-secondary text-caption" data-testid="picked">
        選んだもの: {picked() ? emojiKey(picked() as PickerEmoji) : "（まだ）"}
      </p>
    </div>
  );
};

const meta = {
  title: "操作/絵文字のピッカー",
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

export const ドロワー: S = { args: { layout: "sheet" } };

/** マウスのある端末ではポップアップ、触る端末では下から出るドロワーで開く。 */
export const 開き口から開く: S = {
  render: (args) => {
    const [picked, setPicked] = createSignal<PickerEmoji>();
    return (
      <div class="flex flex-col items-start gap-3 p-6">
        <PickerSurface
          title="絵文字を選ぶ"
          placement="bottom-start"
          trigger={(trigger) => (
            <Button {...trigger()} variant="secondary" size="sm">
              絵文字を選ぶ
            </Button>
          )}
        >
          {(close, layout) => (
            <EmojiPicker
              layout={layout}
              customGroups={args.customGroups}
              onSelect={(emoji) => {
                setPicked(emoji);
                close();
              }}
              footer={(query) => (
                <MakerFooter
                  layout={layout}
                  query={query()}
                  lastStyle={undefined}
                  sending={false}
                  onSend={close}
                  onAdjust={close}
                />
              )}
            />
          )}
        </PickerSurface>
        <p class="c-secondary text-caption" data-testid="picked">
          選んだもの:{" "}
          {picked() ? emojiKey(picked() as PickerEmoji) : "（まだ）"}
        </p>
      </div>
    );
  },
};
