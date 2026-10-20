import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import LinkSheet, { type LinkSheetProps } from "./LinkSheet";

type Props = Omit<LinkSheetProps, "onOpen" | "onCancel"> & { width: number };

const SheetStory: Component<Props> = (props) => (
  <div
    class="relative h-[480px] overflow-hidden border border-primary bg-primary"
    style={{ width: `${props.width}px` }}
  >
    <LinkSheet {...props} onOpen={() => {}} onCancel={() => {}} />
  </div>
);

const meta = {
  title: "カラム/アップレットからのリンク",
  component: SheetStory,
  args: {
    source: "Noris",
    url: "https://example.com/post/123",
    hostname: "example.com",
    label: "元の記事を読む",
    width: 360,
  },
} satisfies Meta<typeof SheetStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ふつう: Story = {};

/** 見た目の似た文字のドメインは、punycode で出して見分けられるようにする。 */
export const 国際化ドメイン: Story = {
  args: {
    url: "https://xn--exmple-4nf.com/login",
    hostname: "xn--exmple-4nf.com",
  },
};

export const 長い_URL: Story = {
  args: {
    url: `https://example.com/${"very-long-path/".repeat(20)}?q=${"x".repeat(80)}`,
    label: undefined,
  },
};

export const 狭いカラム: Story = { args: { width: 240 } };
