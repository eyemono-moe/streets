import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ActionSheet from "./ActionSheet";

const SheetStory: Component<{
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  width: number;
}> = (props) => (
  <div
    class="relative h-[480px] overflow-hidden border border-primary bg-primary"
    style={{ width: `${props.width}px` }}
  >
    <ActionSheet
      source="Common Tester"
      title={props.title}
      confirmLabel={props.confirmLabel}
      danger={props.danger}
      onConfirm={() => {}}
      onCancel={() => {}}
    >
      <p class="c-primary text-body">{props.body}</p>
    </ActionSheet>
  </div>
);

const meta = {
  title: "カラム/アップレットからの操作",
  component: SheetStory,
  args: {
    title: "2 人をフォローしようとしています",
    body: "alice bob",
    confirmLabel: "フォローする",
    danger: false,
    width: 360,
  },
} satisfies Meta<typeof SheetStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const フォロー: Story = {};

export const リアクション: Story = {
  args: {
    title: "「🔥」でリアクションしようとしています",
    body: "リアクションする投稿の本文",
    confirmLabel: "リアクションする",
  },
};

/** 人に影響する操作は、確かめるボタンを危ない色にする。 */
export const 通報: Story = {
  args: {
    title: "「スパム」として通報しようとしています",
    body: "通報する人",
    confirmLabel: "通報する",
    danger: true,
  },
};

export const 狭いカラム: Story = { args: { width: 240 } };
