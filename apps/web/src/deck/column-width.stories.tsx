import { TIMELINE_KINDS } from "@streets/core/deck/column-kinds";
import {
  type ColumnDef,
  columnWidthPatch,
  columnWidthPx,
} from "@streets/core/deck/deck";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ColumnHeader } from "../columns/ColumnHeader";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import { columnWidthStyle } from "./column-width";
import DeckEndSpace from "./DeckEndSpace";
import DeckStrip from "./DeckStrip";

const few: ColumnDef[] = [
  {
    id: "home",
    title: "ホーム",
    width: "l",
    source: { kind: "followees", kinds: [...TIMELINE_KINDS] },
  },
  {
    id: "notifications",
    title: "通知",
    width: "s",
    source: { kind: "notifications" },
  },
  {
    id: "nostr",
    title: "Nostr",
    source: { kind: "literal", filters: [{ "#t": ["nostr"] }] },
  },
];

// 題名は中身から決まるので、保存した title ではなく、検索の語で長くする。
const longTitle: ColumnDef[] = [
  {
    id: "search",
    title: "検索",
    width: "s",
    source: {
      kind: "search",
      query:
        "とても長い検索の語を入れたカラムでも、設定した幅を超えて広がらないことを確かめる",
    },
  },
  ...few.slice(1),
];

// 段にない幅。広げると、200 と 380 の比のまま伸びる。
const narrow: ColumnDef[] = [
  { ...few[0], id: "narrow-home", ...columnWidthPatch(200) },
  { ...few[1], id: "narrow-notifications", ...columnWidthPatch(200) },
  ...few.slice(2),
];

const many: ColumnDef[] = Array.from({ length: 8 }, (_, i) => ({
  ...few[i % few.length],
  id: `c${i}`,
}));

/** デッキの帯だけを、DeckScreen と同じ幅の当て方で並べる。 */
const Strip = (props: { columns: ColumnDef[]; stretch: boolean }) => (
  <EventSceneProvider scene={{ events: [] }}>
    <Mediates handle={() => true}>
      <DeckStrip class="h-dvh w-dvw">
        <For each={props.columns}>
          {(column) => (
            <div
              class="h-full border-primary border-r bg-primary"
              style={columnWidthStyle(columnWidthPx(column), props.stretch)}
            >
              <ColumnHeader
                column={column}
                open={false}
                grip
                onTitle={() => {}}
              />
              <p class="p-4 text-body">
                {column.title}（{columnWidthPx(column)}px）
              </p>
            </div>
          )}
        </For>
        {!props.stretch && <DeckEndSpace />}
      </DeckStrip>
    </Mediates>
  </EventSceneProvider>
);

const meta = {
  title: "デッキ/カラムの幅",
  component: Strip,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Strip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 固定幅: Story = { args: { columns: few, stretch: false } };

/** カラムどうしの幅の比のまま、右端まで広がる。 */
export const 画面いっぱいに広げる: Story = {
  args: { columns: few, stretch: true },
};

export const 細いカラム: Story = { args: { columns: narrow, stretch: false } };

export const 細いカラムを広げる: Story = {
  args: { columns: narrow, stretch: true },
};

/** 入りきらないときは、最小の幅のまま横にスクロールする。 */
export const 広げても入りきらない: Story = {
  args: { columns: many, stretch: true },
};

/** 題名が長くても、設定した幅を守る。 */
export const 長い題名: Story = { args: { columns: longTitle, stretch: false } };

export const 長い題名を広げる: Story = {
  args: { columns: longTitle, stretch: true },
};
