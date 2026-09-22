import type { CustomEmoji } from "@streets/core/settings/emoji-list";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import EmojiSettingsView, { type EmojiSetRow } from "./EmojiSettingsView";

const author = createStoryAuthor(72, {
  name: "emoji",
  displayName: "えもじ職人",
});
const AUTHOR = author.pubkey;

const emoji = (name: string): CustomEmoji => ({
  shortcode: name,
  // 画像は読めなくてよい（読めないときの見た目も確かめられる）。
  url: `https://example.invalid/${name}.png`,
});

type Args = {
  emojis: CustomEmoji[];
  sets: EmojiSetRow[];
  saving: boolean;
  width: number;
};

/** アプリでは CustomEmojisMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [emojis, setEmojis] = createSignal(props.emojis);
  const [sets, setSets] = createSignal(props.sets);
  return (
    <EventSceneProvider scene={{ events: [author.profile()] }}>
      <Mediates
        handle={(event) => {
          if (event.type === "emoji/add") {
            setEmojis((current) => [
              ...current.filter((other) => other.shortcode !== event.shortcode),
              { shortcode: event.shortcode, url: event.url },
            ]);
            return true;
          }
          if (event.type === "emoji/remove") {
            setEmojis((current) =>
              current.filter((other) => other.shortcode !== event.shortcode),
            );
            return true;
          }
          if (event.type === "emoji-set/remove") {
            setSets((current) =>
              current.filter(
                (row) => row.ref.identifier !== event.ref.identifier,
              ),
            );
            return true;
          }
          return false;
        }}
      >
        <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
          <EmojiSettingsView
            emojis={emojis()}
            sets={sets()}
            saving={props.saving}
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "設定/絵文字",
  render: (args) => <Story {...args} />,
  args: {
    emojis: [emoji("pika"), emoji("dora")],
    sets: [
      {
        ref: { pubkey: AUTHOR, identifier: "neko" },
        set: {
          pubkey: AUTHOR,
          identifier: "neko",
          title: "ねこスタンプ",
          emojis: ["neko1", "neko2", "neko3"].map(emoji),
        },
      },
      // まだ中身が届いていないセット
      { ref: { pubkey: AUTHOR, identifier: "kome" }, set: undefined },
    ],
    saving: false,
    width: 560,
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<Args>;

export const 入っているとき: S = {};

export const まだ何も無いとき: S = { args: { emojis: [], sets: [] } };

export const 保存している途中: S = { args: { saving: true } };

export const 狭い画面: S = { args: { width: 340 } };
