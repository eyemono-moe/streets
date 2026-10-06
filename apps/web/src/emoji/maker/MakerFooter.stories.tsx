import type { Style } from "@streets/core/emoji-maker/style";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import EmojiPicker from "../EmojiPicker";
import MakerFooter from "./MakerFooter";

type Args = { query: string; lastStyle: Style | undefined; sending: boolean };

/** ピッカーの下端だけ。幅はピッカーと同じ。 */
const Footer = (props: Args) => (
  <div class="w-88 rounded-2 border border-primary bg-primary p-2">
    <MakerFooter
      query={props.query}
      lastStyle={props.lastStyle}
      sending={props.sending}
      onSend={() => {}}
      onAdjust={() => {}}
    />
  </div>
);

const meta = {
  title: "操作/カスタム絵文字を作る/ピッカーの下端",
  render: (args) => <Footer {...args} />,
  args: { query: "ええやん", lastStyle: undefined, sending: false },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<Args>;

export const 何も打っていない: S = { args: { query: "" } };

export const 打った言葉の候補: S = {};

export const 前回の見た目も並ぶ: S = {
  args: {
    lastStyle: {
      color: "#ff8fb8",
      outline: "auto",
      outlineWidth: 6,
      font: "serif",
    },
  },
};

/** 1 行の横長になる言葉。4 つ目は帯を横に送ると見える。 */
export const 横長の言葉: S = {
  args: {
    query: "ありがとう",
    lastStyle: {
      color: "#ffd43b",
      outline: "auto",
      outlineWidth: 7,
      font: "rounded",
    },
  },
};

export const 二行の横長: S = { args: { query: "ありがとうございます" } };

export const 描けない文字がある: S = { args: { query: "🍣うまい" } };

export const 字数が多すぎる: S = { args: { query: "あ".repeat(13) } };

export const 送っている途中: S = { args: { sending: true } };

/** ピッカーに組み込んだ姿。検索欄に打つと、下端に候補が出る。 */
export const ピッカーの中: S = {
  render: (args) => (
    <EmojiPicker
      customGroups={[]}
      onSelect={() => {}}
      footer={(query) => (
        <MakerFooter
          query={query()}
          lastStyle={args.lastStyle}
          sending={false}
          onSend={() => {}}
          onAdjust={() => {}}
        />
      )}
    />
  ),
};
