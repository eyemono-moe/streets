import type { ComposeState } from "@streets/core/view/compose";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { useEventActions } from "../actions";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import { ComposeMediator } from "./ComposeMediator";
import QuoteDialog from "./QuoteDialog";

const author = createStoryAuthor(66, {
  name: "author",
  displayName: "引用されるひと",
});
const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});
const target = author.note(
  "引用対象のノートです。内容を確認しながらコメントを書けます。",
);
const longTarget = author.note(
  Array.from(
    { length: 10 },
    (_, index) => `${index + 1} 行目。長い引用対象の内容です。`,
  ).join("\n"),
);

type Props = {
  target: NostrEvent;
  includeProfile: boolean;
  failWrites: boolean;
  state?: ComposeState;
};

const Interactive = (props: { target: NostrEvent }) => {
  const actions = useEventActions();
  return (
    <ComposeMediator
      send={(text) => actions?.quote(props.target, text) ?? Promise.resolve()}
      failure="引用できませんでした"
      onSent={() => {}}
    >
      {(state) => <QuoteDialog target={props.target} state={state} />}
    </ComposeMediator>
  );
};

const meta = {
  title: "操作/引用ダイアログ",
  component: (props: Props) => (
    <EventSceneProvider
      scene={{
        events: [
          ...(props.includeProfile ? [author.profile()] : []),
          viewer.profile(),
          props.target,
        ],
        viewer,
        failWrites: props.failWrites,
      }}
    >
      {props.state ? (
        <QuoteDialog target={props.target} state={props.state} />
      ) : (
        <Interactive target={props.target} />
      )}
    </EventSceneProvider>
  ),
  args: { target, includeProfile: true, failWrites: false },
  argTypes: { target: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 送信に失敗する: Story = { args: { failWrites: true } };
export const 送信中: Story = {
  args: { state: { content: "送っている途中の引用。", sending: true } },
};
export const 長い引用対象: Story = { args: { target: longTarget } };
export const プロフィール未取得: Story = { args: { includeProfile: false } };
export const 狭い幅: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
import type { NostrEvent } from "@streets/core/nostr/event";
