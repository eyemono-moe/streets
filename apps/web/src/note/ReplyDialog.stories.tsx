import type { ComposeState } from "@streets/core/view/compose";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { useEventActions } from "../actions";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import { ComposeMediator } from "./ComposeMediator";
import ReplyDialog from "./ReplyDialog";

const parent = createStoryAuthor(66, {
  name: "parent",
  displayName: "おやのひと",
});
const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});
const target = parent.note("返信元のノートの本文。");

type Props = {
  failWrites: boolean;
  /** 指定すると、その状態で止めて描く（送信中などを見るため）。無ければ実際に書いて送れる。 */
  state?: ComposeState;
};

const Interactive = () => {
  const actions = useEventActions();
  return (
    <ComposeMediator
      send={(text) => actions?.reply(target, text) ?? Promise.resolve()}
      failure="返信できませんでした"
      onSent={() => {}}
    >
      {(state) => <ReplyDialog target={target} state={state} />}
    </ComposeMediator>
  );
};

const meta = {
  title: "操作/返信ダイアログ",
  component: (props: Props) => (
    <EventSceneProvider
      scene={{
        events: [parent.profile(), viewer.profile(), target],
        viewer,
        failWrites: props.failWrites,
      }}
    >
      {props.state ? (
        <ReplyDialog target={target} state={props.state} />
      ) : (
        <Interactive />
      )}
    </EventSceneProvider>
  ),
  args: { failWrites: false },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 送信に失敗する: Story = { args: { failWrites: true } };
export const 送信中: Story = {
  args: { state: { content: "送っている途中の返信。", sending: true } },
};
export const 長い本文: Story = {
  args: {
    state: {
      content: Array.from(
        { length: 8 },
        (_, index) =>
          `${index + 1} 行目。長い返信でもダイアログからはみ出さないか。`,
      ).join("\n"),
      sending: false,
    },
  },
};
