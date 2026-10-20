import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import IntentSheet, { type IntentSheetProps } from "./IntentSheet";

type Props = Omit<IntentSheetProps, "onPick" | "onInstall" | "onCancel"> & {
  /** カラムの幅（px）。 */
  width: number;
};

const SheetStory: Component<Props> = (props) => (
  <div
    class="relative h-[560px] overflow-hidden border border-primary bg-primary"
    style={{ width: `${props.width}px` }}
  >
    <p class="c-secondary p-4 text-caption">
      アップレットの画面（ここが iframe になる）
    </p>
    <IntentSheet
      {...props}
      onPick={() => {}}
      onInstall={() => {}}
      onCancel={() => {}}
    />
  </div>
);

const meta = {
  title: "カラム/アップレットからの依頼",
  component: SheetStory,
  args: {
    source: "Chronofeed",
    archetype: "profile",
    mode: "choose",
    candidates: [
      { id: "a", title: "Simple Profile", streets: false },
      { id: "b", title: "Profile Editor", streets: false },
      { id: "streets", title: "Streets のカラム", streets: true },
    ],
    width: 360,
  },
} satisfies Meta<typeof SheetStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 受け手が複数あり、既定が無い。 */
export const 選ぶ: Story = {};

/** 受け手は決まっているが、そのカラムが直前に押されていない。 */
export const 確かめる: Story = {
  args: {
    mode: "confirm",
    candidates: [{ id: "a", title: "Simple Profile", streets: false }],
  },
};

/** 勧められたアップレットが、まだインストールされていない。 */
export const 勧められたものが無い: Story = {
  args: {
    archetype: "map",
    candidates: [],
    suggested: { title: "Black Site Map Editor" },
  },
};

export const 知らない役割: Story = { args: { archetype: "emoji-list" } };

export const 狭いカラム: Story = { args: { width: 240 } };
