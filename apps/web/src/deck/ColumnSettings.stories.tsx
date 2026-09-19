import { columnFacets } from "@streets/core/deck/column-facets";
import type { ColumnDef } from "@streets/core/deck/deck";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import ColumnSettings from "./ColumnSettings";

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
      // 変更はデッキの段が保存する。ストーリーでは手元の値に当てて、切り替えた結果を見せる。
      // それ以外（削除など）は Actions パネルへ流す。
      <Mediates
        handle={(event) => {
          if (event.type !== "deck/patch-column") return false;
          setColumn((current) => ({ ...current, ...event.patch }));
          return true;
        }}
      >
        <ColumnSettings column={column()} facets={columnFacets(column())} />
      </Mediates>
    );
  },
  args: { initial: base },
  argTypes: { initial: { control: false } },
} satisfies Meta<{ initial: ColumnDef }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 既定: Story = {};

export const 通知: Story = {
  args: {
    initial: { id: "n", title: "通知", source: { kind: "notifications" } },
  },
};

export const ハッシュタグ: Story = {
  args: {
    initial: {
      id: "t",
      title: "#nostr",
      source: { kind: "literal", filters: [{ kinds: [1], "#t": ["nostr"] }] },
    },
  },
};

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
