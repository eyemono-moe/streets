import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import landscape from "../storybook/media-landscape.svg";
import UploadSheet, { type UploadPrompt } from "./UploadSheet";

type Props = UploadPrompt & { width: number };

const SheetStory: Component<Props> = (props) => (
  <div
    class="relative h-[600px] overflow-hidden border border-primary bg-primary"
    style={{ width: `${props.width}px` }}
  >
    <UploadSheet
      {...props}
      source="Upload Tester"
      onApprove={() => {}}
      onCancel={() => {}}
    />
  </div>
);

const meta = {
  title: "カラム/アップレットからのアップロード",
  component: SheetStory,
  args: {
    filename: "landscape.svg",
    mimeType: "image/svg+xml",
    size: 18_234,
    previewUrl: landscape,
    server: "blossom.band",
    width: 360,
  },
} satisfies Meta<typeof SheetStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 画像: Story = {};

/** 画像でないものは、名前と種類と大きさだけを見せる。 */
export const 画像でない: Story = {
  args: {
    filename: "notes.pdf",
    mimeType: "application/pdf",
    size: 9_021_100,
    previewUrl: undefined,
  },
};

export const 名前が長い: Story = {
  args: { filename: `${"とても長いファイル名".repeat(8)}.png` },
};

export const 狭いカラム: Story = { args: { width: 240 } };
