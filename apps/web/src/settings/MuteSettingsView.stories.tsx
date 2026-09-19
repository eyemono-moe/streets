import {
  type MuteEntry,
  applyMuteChanges,
} from "@streets/core/moderation/mute-list";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import avatar from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import MuteSettingsView, {
  type MuteSettingsViewProps,
} from "./MuteSettingsView";

type Args = MuteSettingsViewProps & { width: number };

const other = createStoryAuthor(81, {
  name: "other",
  displayName: "ほかのひと",
  picture: avatar,
});
const longName = createStoryAuthor(82, {
  name: "a-very-long-handle-name-that-keeps-going",
  displayName: "とても長い表示名をつけている人で、行に収まらないくらい長い",
});

const everything: MuteEntry[] = [
  { target: { type: "pubkey", value: other.pubkey }, visibility: "private" },
  { target: { type: "hashtag", value: "spoiler" }, visibility: "public" },
  { target: { type: "word", value: "ネタバレ" }, visibility: "private" },
  { target: { type: "thread", value: "a".repeat(64) }, visibility: "private" },
];

/** アプリでは MuteMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [entries, setEntries] = createSignal(props.entries);
  return (
    <EventSceneProvider
      scene={{ events: [other.profile(), longName.profile()] }}
    >
      <Mediates
        handle={(event) => {
          if (event.type === "mutes/add") {
            setEntries((current) =>
              applyMuteChanges(current, [
                {
                  type: "add",
                  entry: {
                    target: event.target,
                    visibility: event.visibility ?? "private",
                  },
                },
              ]),
            );
            return true;
          }
          if (event.type === "mutes/remove") {
            setEntries((current) =>
              applyMuteChanges(current, [
                { type: "remove", entry: event.entry },
              ]),
            );
            return true;
          }
          return false;
        }}
      >
        <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
          <MuteSettingsView
            entries={entries()}
            loading={props.loading}
            privatePart={props.privatePart}
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "設定/ミュート",
  component: Story,
  args: {
    entries: everything,
    loading: false,
    privatePart: "ready",
    width: 660,
  },
  argTypes: { entries: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};

export const 読み込み中: S = { args: { loading: true, entries: [] } };

export const まだ何も無い: S = { args: { entries: [] } };

/** 署名の方法が NIP-44 に対応していない。非公開は選べない。 */
export const 非公開を扱えない: S = {
  args: {
    privatePart: "unavailable",
    entries: everything.filter((entry) => entry.visibility === "public"),
  },
};

export const 非公開を読めなかった: S = {
  args: {
    privatePart: "invalid",
    entries: everything.filter((entry) => entry.visibility === "public"),
  },
};

export const 長い名前と単語: S = {
  args: {
    entries: [
      {
        target: { type: "pubkey", value: longName.pubkey },
        visibility: "private",
      },
      {
        target: {
          type: "word",
          value:
            "とても長い単語をミュートしていて、折り返さないと画面からはみ出してしまうくらいの長さ",
        },
        visibility: "public",
      },
    ],
  },
};

export const たくさん: S = {
  args: {
    entries: Array.from({ length: 14 }, (_, i) => ({
      target: { type: "word" as const, value: `単語 ${i + 1}` },
      visibility: i % 2 === 0 ? ("private" as const) : ("public" as const),
    })),
  },
};

export const 狭い幅: S = { args: { width: 360 } };
