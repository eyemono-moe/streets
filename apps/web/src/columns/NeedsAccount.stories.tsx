import type { ColumnDef } from "@streets/core/deck/deck";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import NeedsAccount from "./NeedsAccount";

const column = (source: ColumnDef["source"], title: string): ColumnDef => ({
  id: title,
  title,
  source,
});

const meta = {
  title: "カラム/ログインが要るカラム",
  component: (props: { column: ColumnDef; width: string }) => (
    <EventSceneProvider scene={{ events: [] }}>
      <Mediates handle={() => true}>
        <div class="bg-primary" style={{ width: props.width }}>
          <NeedsAccount column={props.column} />
        </div>
      </Mediates>
    </EventSceneProvider>
  ),
  args: {
    width: "380px",
    column: column({ kind: "followees", kinds: [1, 6] }, "ホーム"),
  },
  argTypes: { column: { control: false } },
} satisfies Meta<{ column: ColumnDef; width: string }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ホーム: Story = {};

export const 通知: Story = {
  args: { column: column({ kind: "notifications" }, "通知") },
};

export const 幅の狭いカラム: Story = {
  args: {
    width: "300px",
    column: column({ kind: "bookmarks" }, "ブックマーク"),
  },
};
