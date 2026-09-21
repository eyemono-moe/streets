import type { CropRect } from "@streets/core/view/compose";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import landscapeUrl from "../storybook/media-landscape.svg";
import portraitUrl from "../storybook/media-portrait.svg";
import CropDialog from "./CropDialog";

type Props = {
  src: string;
  name: string;
  /** 前に決めた範囲。開き直したときに、そこから直せる。 */
  crop?: CropRect;
};

const meta = {
  title: "操作/切り抜くダイアログ",
  component: (props: Props) => (
    <CropDialog
      src={props.src}
      name={props.name}
      crop={props.crop}
      onDone={() => {}}
      onClose={() => {}}
    />
  ),
  args: { src: landscapeUrl, name: "ねこ.png" },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 横長: Story = {};
export const 縦長: Story = { args: { src: portraitUrl, name: "たてなが.png" } };
/** 名前が長いと見出しが伸びるので、そこで詰める。 */
export const 長い名前: Story = {
  args: { name: "とても長いファイル名の画像ファイル-2026-09-21-final.png" },
};
/** 一度切り抜いたものを開き直したところ。前の範囲から直せる。 */
export const 切り抜き済み: Story = {
  args: { crop: { x: 100, y: 60, width: 700, height: 500 } },
};
export const 狭い幅: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
