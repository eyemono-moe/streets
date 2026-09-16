import type { ColumnDef } from "@streets/core/deck/deck";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ColumnSettings, { type ColumnPatch } from "./ColumnSettings";

const base: ColumnDef = {
  id: "home",
  title: "ホーム",
  source: { kind: "followees", kinds: [1, 6] },
};

const meta = {
  title: "デッキ/カラム設定",
  component: (props: { initial: ColumnDef }) => {
    const [column, setColumn] = createSignal(props.initial);
    return (
      <ColumnSettings
        column={column()}
        onPatch={(patch: ColumnPatch) =>
          setColumn((current) => ({ ...current, ...patch }))
        }
        onRemove={() => {}}
      />
    );
  },
  args: { initial: base },
  argTypes: { initial: { control: false } },
} satisfies Meta<{ initial: ColumnDef }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 既定: Story = {};

export const 変更済み: Story = {
  args: {
    initial: {
      ...base,
      title: "フォロー中",
      width: "l",
      density: "compact",
      show: { replies: false, media: false },
    },
  },
};
