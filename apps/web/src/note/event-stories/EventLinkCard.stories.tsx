import type { LinkCardMode } from "@streets/core/deck/deck";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../../storybook/EventScene";
import landscapeUrl from "../../storybook/media-landscape.svg";
import SegmentedControl from "../../ui/SegmentedControl";
import Event from "../Event";
import { LinkCardModeProvider } from "../link-card";
import { EventStory, alice, eventStoryMeta, scene } from "./event-story";

const ARTICLE = "https://example.com/articles/streets";
const MISSING = "https://example.com/no-ogp";
const withLinks = alice.note(
  `読んだ記事 ${ARTICLE} と、題名の取れないページ ${MISSING}`,
);
const linkScene = {
  ...scene(withLinks),
  linkCards: {
    [ARTICLE]: {
      url: ARTICLE,
      title: "カラムで Nostr を読む",
      description: "Streets の使い方を、カラムの足し方から順に紹介します。",
      image: landscapeUrl,
      siteName: "Example Blog",
    },
    [MISSING]: null,
  },
};

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/リンクのカード",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 小さく: Story = {
  args: { event: withLinks, scene: linkScene },
};

export const 大きく: Story = {
  args: { event: withLinks, scene: linkScene, linkCards: "large" },
};

export const コンパクト: Story = {
  args: { event: withLinks, scene: linkScene, size: "compact" },
};

export const 出さない: Story = {
  args: { event: withLinks, scene: linkScene, linkCards: "off" },
};

/** カラムの設定を変えたときに、描いてあるカードがその場で変わることを確かめる。 */
export const 設定を切り替える: Story = {
  args: { event: withLinks, scene: linkScene },
  render: (props) => {
    const [mode, setMode] = createSignal<LinkCardMode>("compact");
    return (
      <div class="flex flex-col gap-3">
        <div class="w-[360px]">
          <SegmentedControl
            label="リンクのカード"
            options={[
              { value: "off", label: "出さない" },
              { value: "compact", label: "小さく" },
              { value: "large", label: "大きく" },
            ]}
            value={mode()}
            onChange={setMode}
            block
          />
        </div>
        <EventSceneProvider scene={props.scene}>
          <div class="w-[360px]">
            <LinkCardModeProvider value={mode}>
              <Event event={props.event} size={props.size} />
            </LinkCardModeProvider>
          </div>
        </EventSceneProvider>
      </div>
    );
  },
};
