import type { SectionStatus } from "@streets/core/read/source";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import { SearchPanelView } from "./SearchPanel";
import SidePanel from "./SidePanel";

const author = createStoryAuthor(73, {
  name: "neko",
  displayName: "ねこの話をする人",
});
const notes = [
  author.note("ねこが窓際で眠っています。"),
  author.note("今日は散歩中にねこに会いました。"),
];
const longNote = author.note("ねこの話を探しています。".repeat(24));
const manyNotes = Array.from({ length: 12 }, (_, index) =>
  author.note(`ねこの話を探しています（${index + 1}件目）。`),
);

type Props = {
  width: number;
  height: number;
  initial: string;
  results: boolean;
  longResult: boolean;
  manyResults: boolean;
  pending: boolean;
  status: SectionStatus;
};

const Story = (props: Props) => {
  const [text, setText] = createSignal(props.initial);
  const [opened, setOpened] = createSignal(0);
  return (
    <EventSceneProvider
      scene={{ events: [author.profile(), ...notes, longNote, ...manyNotes] }}
    >
      <Mediates handle={(event) => event.type === "deck/add-column"}>
        <div
          class="flex"
          style={{ width: `${props.width}px`, height: `${props.height}px` }}
        >
          <SidePanel title="検索する" icon="i-material-symbols:search-rounded">
            <SearchPanelView
              text={text()}
              onChange={setText}
              results={
                props.results
                  ? props.manyResults
                    ? manyNotes
                    : props.longResult
                      ? [longNote]
                      : notes
                  : []
              }
              status={props.status}
              paging="exhausted"
              onMore={() => {}}
              pending={props.pending}
              empty={text().trim() === ""}
              onOpen={() => setOpened((count) => count + 1)}
            />
          </SidePanel>
        </div>
        <span class="sr-only">開いた回数: {opened()}</span>
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "デッキ/探す",
  component: Story,
  args: {
    width: 360,
    height: 560,
    initial: "ねこ",
    results: true,
    longResult: false,
    manyResults: false,
    pending: false,
    status: { phase: "settled" },
  },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 結果がある: S = {};
export const 空: S = { args: { initial: "", results: false } };
export const 検索中: S = {
  args: { results: false, pending: true, status: { phase: "initial" } },
};
export const 見つからない: S = { args: { results: false } };
export const 一部取得失敗: S = {
  args: {
    results: false,
    status: {
      phase: "settled",
      incomplete: {
        unreachableRelays: 1,
        unroutableAuthors: 0,
        uncoveredAuthors: 0,
      },
    },
  },
};
export const 長い本文: S = { args: { longResult: true } };
export const 結果をスクロール: S = { args: { manyResults: true } };
export const 狭い幅: S = { args: { width: 300 } };
export const 低い画面: S = { args: { height: 320, manyResults: true } };
export const 低い画面で詳細を開く: S = {
  args: { height: 320, manyResults: true },
  play: ({ canvasElement }) => {
    canvasElement
      .querySelector<HTMLButtonElement>(
        '[data-scope="collapsible"][data-part="trigger"]',
      )
      ?.click();
  },
};
