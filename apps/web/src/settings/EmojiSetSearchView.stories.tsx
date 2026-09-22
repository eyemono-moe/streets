import type { EmojiSet } from "@streets/core/settings/emoji-set";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import EmojiSetSearchView, { type EmojiSetResult } from "./EmojiSetSearchView";

const author = createStoryAuthor(81, {
  name: "emoji",
  displayName: "えもじ職人",
});

const set = (identifier: string, title: string, count: number): EmojiSet => ({
  identifier,
  pubkey: author.pubkey,
  title,
  emojis: Array.from({ length: count }, (_, index) => ({
    shortcode: `${identifier}${index + 1}`,
    // 画像は読めなくてよい（読めないときの見た目も確かめられる）。
    url: `https://example.invalid/${identifier}${index + 1}.png`,
  })),
});

type Args = {
  results: EmojiSetResult[];
  searching: boolean;
  searched: boolean;
  disabled: boolean;
  error?: string;
  width: number;
};

const Story = (props: Args) => {
  const [added, setAdded] = createSignal<string[]>([]);
  return (
    <EventSceneProvider scene={{ events: [author.profile()] }}>
      <Mediates
        handle={(event) => {
          if (event.type !== "emoji-set/add") return false;
          setAdded((current) => [...current, event.ref.identifier]);
          return true;
        }}
      >
        <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
          <EmojiSetSearchView
            results={props.results.map((result) => ({
              ...result,
              added: result.added || added().includes(result.set.identifier),
            }))}
            searching={props.searching}
            searched={props.searched}
            disabled={props.disabled}
            error={props.error}
            onSearch={() => {}}
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "設定/絵文字セットを探す",
  render: (args) => <Story {...args} />,
  args: {
    results: [
      { set: set("neko", "ねこスタンプ", 20), added: false },
      { set: set("kome", "おこめ", 3), added: true },
    ],
    searching: false,
    searched: true,
    disabled: false,
    width: 560,
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<Args>;

export const 見つかったとき: S = {};

export const まだ探していないとき: S = {
  args: { results: [], searched: false },
};

export const 探している途中: S = {
  args: { results: [], searching: true, searched: true },
};

export const 見つからなかったとき: S = { args: { results: [] } };

export const 入力の誤り: S = {
  args: {
    results: [],
    searched: false,
    error: "絵文字セットの住所（naddr）ではありません",
  },
};

export const 狭い画面: S = { args: { width: 340 } };
