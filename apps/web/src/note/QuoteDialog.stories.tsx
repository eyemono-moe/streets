import { type ComposeState, emptyCompose } from "@streets/core/view/compose";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { useEventActions } from "../actions";
import { UploaderProvider } from "../media/uploader";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
// 小さい SVG は data URI に埋め込まれ、本文の URL として拾われなくなるので、ファイルのまま配信させる。
import landscapeUrl from "../storybook/media-landscape.svg?no-inline";
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

// 本文の URL は http(s) で始まらないと画像として拾われないので、配信元の origin を付ける。
const absolute = (url: string) => new URL(url, location.href).href;

type Props = {
  target: NostrEvent;
  /** 画像の預け先。空にすると、画像のボタンが使えない見た目になる。 */
  servers: string[];
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
      <UploaderProvider
        value={{
          servers: () => props.servers,
          upload: () => Promise.reject(new Error("story では預けない")),
        }}
      >
        {props.state ? (
          <QuoteDialog target={props.target} state={props.state} />
        ) : (
          <Interactive target={props.target} />
        )}
      </UploaderProvider>
    </EventSceneProvider>
  ),
  args: {
    target,
    includeProfile: true,
    failWrites: false,
    servers: ["https://blossom.example"],
  },
  argTypes: { target: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 送信に失敗する: Story = { args: { failWrites: true } };
export const 送信中: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "送っている途中の引用。",
      sending: true,
    },
  },
};

export const 画像を預けている途中: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "これも見て",
      uploads: [{ id: "1", name: "ねこ.png" }],
    },
  },
};

export const 画像を預けられなかった: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "これも見て",
      uploads: [{ id: "1", name: "ねこ.png", error: "大きすぎます" }],
    },
  },
};

/** 預け終わったものは本文の URL になる。途中のものと混ざる。 */
export const 画像を複数添えた: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: `2 枚。\n${absolute(landscapeUrl)}`,
      media: [
        {
          url: absolute(landscapeUrl),
          sha256: "a".repeat(64),
          size: 1024,
          type: "image/svg+xml",
        },
      ],
      uploads: [{ id: "2", name: "いぬ.jpg" }],
    },
  },
};

/** 預け先を決めていない人。画像のボタンは薄いが押せて、押すと設定へ案内する。 */
export const 預け先が無い: Story = { args: { servers: [] } };
export const 長い引用対象: Story = { args: { target: longTarget } };
export const プロフィール未取得: Story = { args: { includeProfile: false } };
export const 狭い幅: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
import type { NostrEvent } from "@streets/core/nostr/event";
