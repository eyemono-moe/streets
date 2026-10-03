import { TIMELINE_KINDS } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ColumnHeader } from "../columns/ColumnHeader";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import { columnWidthStyle } from "./column-width";
import DeckEndSpace from "./DeckEndSpace";

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

const many: ColumnDef[] = Array.from({ length: 8 }, (_, i) => ({
  ...few[i % few.length],
  id: `c${i}`,
}));

/** デッキの帯だけを、DeckScreen と同じ幅の当て方で並べる。 */
const Strip = (props: { columns: ColumnDef[]; stretch: boolean }) => (
  <EventSceneProvider scene={{ events: [] }}>
    <Mediates handle={() => true}>
      <div class="flex h-dvh w-dvw overflow-x-auto bg-tertiary">
        <For each={props.columns}>
          {(column) => (
            <div
              class="h-full border-primary border-r bg-primary"
              style={columnWidthStyle(column.width, props.stretch)}
            >
              <ColumnHeader
                column={column}
                open={false}
                grip
                onTitle={() => {}}
              />
              <p class="p-4 text-body">
                {column.title}（{(column.width ?? "m").toUpperCase()}）
              </p>
            </div>
          )}
        </For>
        {!props.stretch && <DeckEndSpace />}
      </div>
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

/** S/M/L の比のまま、右端まで広がる。 */
export const 画面いっぱいに広げる: Story = {
  args: { columns: few, stretch: true },
};

/** 入りきらないときは、最小の幅のまま横にスクロールする。 */
export const 広げても入りきらない: Story = {
  args: { columns: many, stretch: true },
};
