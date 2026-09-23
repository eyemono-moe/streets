import type { Meta, StoryObj } from "storybook-solidjs-vite";
import landscapeUrl from "../storybook/media-landscape.svg";
import squareUrl from "../storybook/media-square.svg";
import LinkCardView, { type LinkCardViewProps } from "./LinkCardView";

const URL_ = "https://example.com/articles/nostr-clients";

const card = {
  url: URL_,
  title: "Nostr のクライアントを選ぶときに見るところ",
  description:
    "リレーの扱い、鍵の預け方、カラムの並べ方。はじめて使う人に向けて、クライアントごとの違いをまとめました。",
  image: landscapeUrl,
  siteName: "Example Blog",
};

const meta = {
  title: "イベント/リンクのカード",
  component: (props: LinkCardViewProps & { width: number }) => (
    <div class="bg-primary p-3" style={{ width: `${props.width}px` }}>
      <LinkCardView {...props} />
    </div>
  ),
  args: { url: URL_, card, mode: "compact", size: "normal", width: 340 },
  argTypes: {
    mode: { control: "inline-radio", options: ["compact", "large"] },
    size: { control: "inline-radio", options: ["normal", "compact"] },
    card: { control: false },
  },
} satisfies Meta<LinkCardViewProps & { width: number }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 小さく: Story = {};
export const 大きく: Story = { args: { mode: "large" } };
export const 小さく_表示密度コンパクト: Story = { args: { size: "compact" } };
export const 大きく_表示密度コンパクト: Story = {
  args: { mode: "large", size: "compact" },
};
export const 正方形の画像: Story = {
  args: { card: { ...card, image: squareUrl }, mode: "large" },
};
export const 画像なし: Story = {
  args: { card: { ...card, image: undefined } },
};
export const 画像なし_大きく: Story = {
  args: { card: { ...card, image: undefined }, mode: "large" },
};
export const 題名だけ: Story = {
  args: {
    card: { url: URL_, title: "Example Domain" },
  },
};
export const 画像が読めない: Story = {
  args: { card: { ...card, image: "https://invalid.example/broken.png" } },
};
export const 長い題名と説明: Story = {
  args: {
    card: {
      ...card,
      title: "とても長い題名".repeat(12),
      description: "改行の無い長い説明文".repeat(30),
      siteName: "とても長いサイト名".repeat(6),
    },
    mode: "large",
  },
};
export const 区切りの無い英数字: Story = {
  args: {
    card: {
      ...card,
      title: "a".repeat(200),
      description: "https://example.com/".repeat(10),
    },
  },
};
export const 取得中: Story = { args: { card: undefined } };
export const 取得中_大きく: Story = {
  args: { card: undefined, mode: "large" },
};
export const 幅の狭いカラム: Story = { args: { width: 280 } };
export const 幅の狭いカラム_大きく: Story = {
  args: { width: 280, mode: "large" },
};
