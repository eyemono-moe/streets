import type { Meta, StoryObj } from "storybook-solidjs-vite";
import DeleteEventDialog from "./DeleteEventDialog";
import { viewer } from "./event-stories/event-story";

const meta = {
  title: "イベント/投稿/削除の確かめ",
  component: DeleteEventDialog,
  args: { event: viewer.note("自分の投稿"), onClose: () => {} },
  argTypes: { event: { control: false } },
} satisfies Meta<typeof DeleteEventDialog>;

export default meta;
type S = StoryObj<typeof meta>;

/** リレーが従わなければ残ることと、取り消せないことを、押す前に伝える。 */
export const 通常: S = {};

export const スマホ: S = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
