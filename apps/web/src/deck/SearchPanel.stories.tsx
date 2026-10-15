import type { SectionStatus } from "@streets/core/read/source";
import { searchHistoryTransition } from "@streets/core/search/history";
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
  signedIn: boolean;
  width: number;
  height: number;
  initial: string;
  results: boolean;
  longResult: boolean;
  manyResults: boolean;
  searched: boolean;
  status: SectionStatus;
  history: string[];
};

const Story = (props: Props) => {
  const [text, setText] = createSignal(props.initial);
  // 探した条件。打ち変えると「検索」が押せるようになる。
  const [searched, setSearched] = createSignal(
    props.searched ? props.initial : "",
  );
  const [opened, setOpened] = createSignal(0);
  const [history, setHistory] = createSignal<readonly string[]>(props.history);
  return (
    <EventSceneProvider
      scene={{ events: [author.profile(), ...notes, longNote, ...manyNotes] }}
    >
      <Mediates
        handle={(event) => {
          switch (event.type) {
            case "deck/add-column":
              return true;
            case "search/searched":
            case "search/history-remove":
            case "search/history-clear":
              setHistory((current) => searchHistoryTransition(current, event));
              return true;
            default:
              return false;
          }
        }}
      >
        <div
          class="flex"
          style={{ width: `${props.width}px`, height: `${props.height}px` }}
        >
          <SidePanel title="検索する" icon="i-material-symbols:search-rounded">
            <SearchPanelView
              text={text()}
              signedIn={props.signedIn}
              onChange={setText}
              onSearch={() => setSearched(text().trim())}
              history={history()}
              onPick={(query) => {
                setText(query);
                setSearched(query);
              }}
              searched={searched() !== ""}
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
              changed={text().trim() !== searched()}
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
    signedIn: true,
    width: 360,
    height: 560,
    initial: "ねこ",
    results: true,
    longResult: false,
    manyResults: false,
    searched: true,
    status: { phase: "settled" },
    history: [],
  },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 結果がある: S = {};
export const 未ログイン: S = { args: { signedIn: false } };
export const 空: S = { args: { initial: "", results: false } };

const history = [
  "#nostr",
  "ねこ -いぬ",
  `from:${author.pubkey} 写真`,
  `-from:${"b".repeat(64)} ラーメン`,
  "ねこ #nostr #photography -#bot since:2026-01-01 until:2026-10-01 kind:1 kind:20 -is:bot",
];
/** 入力欄が空の間は、前に探した条件を並べる。人の指定は名前で見せる。 */
export const 履歴がある: S = {
  args: { initial: "", results: false, history },
};
export const 履歴を狭い幅で: S = {
  args: { initial: "", results: false, history, width: 300 },
};
/** 打っただけでは探さない。Enter か「検索」を押すまで待つ。 */
export const まだ探していない: S = {
  args: { results: false, searched: false, status: { phase: "initial" } },
};
export const 検索中: S = {
  args: { results: false, status: { phase: "initial" } },
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
