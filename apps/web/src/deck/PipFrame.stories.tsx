import { TIMELINE_KINDS } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { UploaderProvider } from "../media/uploader";
import Event from "../note/Event";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import PipFrame from "./PipFrame";

const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});
const friend = createStoryAuthor(56, {
  name: "friend",
  displayName: "ともだち",
});
const notes = [
  friend.note(
    "ピクチャーインピクチャーで流れているカラム。右下のボタンから投稿できる。",
  ),
  friend.note(
    "投稿のパネルはピクチャーインピクチャーいっぱいに開き、閉じるとカラムに戻る。",
  ),
  friend.note("トーストは上に出るので、右下のボタンと重ならない。"),
];

const home: ColumnDef = {
  id: "home",
  title: "ホーム",
  source: { kind: "followees", kinds: [...TIMELINE_KINDS] },
};

type Props = { shown: ColumnDef };

const meta = {
  title: "デッキ/ピクチャーインピクチャーの枠",
  component: (props: Props) => (
    <EventSceneProvider
      scene={{
        events: [viewer.profile(), friend.profile(), ...notes],
        viewer,
      }}
    >
      <UploaderProvider
        value={{
          servers: () => [
            { protocol: "blossom", url: "https://blossom.example/" },
          ],
          upload: () =>
            Promise.reject(new Error("story ではアップロードしない")),
        }}
      >
        <Mediates handle={() => true}>
          {/* ピクチャーインピクチャーを開いたときの大きさに載せる。 */}
          <div class="h-[720px] w-[400px] overflow-hidden border-primary border">
            <PipFrame shown={props.shown}>
              <div class="h-full overflow-y-auto bg-primary">
                <For each={notes}>
                  {(note) => <Event event={note} size="normal" />}
                </For>
              </div>
            </PipFrame>
          </div>
        </Mediates>
      </UploaderProvider>
    </EventSceneProvider>
  ),
  args: { shown: home },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 右下のボタンを押すと、投稿のパネルがピクチャーインピクチャーいっぱいに開く。 */
export const 投稿ボタン: Story = {};

/** 自分の入力欄を持つカラムでは、送信のボタンと重なるので出さない。 */
export const チャットのカラム: Story = {
  args: {
    shown: {
      id: "channel",
      title: "チャンネル",
      source: { kind: "channel", id: "a".repeat(64) },
    },
  },
};
