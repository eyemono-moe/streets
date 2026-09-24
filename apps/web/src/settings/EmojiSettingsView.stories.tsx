import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import type { CustomEmoji } from "@streets/core/settings/emoji-list";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { UploaderProvider } from "../media/uploader";
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
  /** 画像のアップロード先が設定されているか。無ければ「画像を選ぶ」を出さない。 */
  uploads: boolean;
  emojis: CustomEmoji[];
  sets: EmojiSetRow[];
  saving: boolean;
  defaultReaction: ReactionInput;
  width: number;
};

/** アプリでは CustomEmojisMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [emojis, setEmojis] = createSignal(props.emojis);
  const [sets, setSets] = createSignal(props.sets);
  const [defaultReaction, setDefaultReaction] = createSignal(
    props.defaultReaction,
  );
  // 実際には上げず、少し待ってから決まった URL を返す。
  const uploader = {
    servers: () => ["https://blossom.example/"] as never,
    upload: async (file: File) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return {
        url: `https://example.invalid/${file.name}`,
        sha256: "0".repeat(64),
        size: file.size,
      };
    },
  };
  return (
    <EventSceneProvider scene={{ events: [author.profile()] }}>
      <Mediates
        handle={(event) => {
          if (event.type === "deck/set-default-reaction") {
            setDefaultReaction(event.input);
            return true;
          }
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
          <UploaderProvider
            value={props.uploads ? uploader : (undefined as never)}
          >
            <EmojiSettingsView
              emojis={emojis()}
              sets={sets()}
              saving={props.saving}
              defaultReaction={defaultReaction()}
            />
          </UploaderProvider>
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
          // 閉じているときは見本だけ、開くと全部出ることを確かめられる数。
          emojis: Array.from({ length: 20 }, (_, index) =>
            emoji(`neko${index + 1}`),
          ),
        },
      },
      // まだ中身が届いていないセット
      { ref: { pubkey: AUTHOR, identifier: "kome" }, set: undefined },
    ],
    saving: false,
    defaultReaction: { type: "like" },
    uploads: true,
    width: 560,
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<Args>;

export const 入っているとき: S = {};

export const まだ何も無いとき: S = { args: { emojis: [], sets: [] } };

export const 保存している途中: S = { args: { saving: true } };

export const アップロード先が無いとき: S = { args: { uploads: false } };

export const 狭い画面: S = { args: { width: 340 } };

export const いいねボタンがUnicodeの絵文字: S = {
  args: { defaultReaction: { type: "text", content: "🔥" } },
};

/** 画像が読めないので、ショートコードの文字で出る。 */
export const いいねボタンがカスタム絵文字: S = {
  args: {
    defaultReaction: {
      type: "emoji",
      shortcode: "very_long_custom_emoji_shortcode",
      url: "https://example.invalid/very_long_custom_emoji_shortcode.png",
    },
  },
};
