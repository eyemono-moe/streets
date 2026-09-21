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

// 本文の URL は http(s) で始まらないと画像として拾われないので、配信元の origin を付ける。
const absolute = (url: string) => new URL(url, location.href).href;

type Props = {
  failWrites: boolean;
  /** 画像の預け先。空にすると、画像のボタンが使えない見た目になる。 */
  servers: string[];
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
      <UploaderProvider
        value={{
          servers: () => props.servers,
          upload: () => Promise.reject(new Error("story では預けない")),
        }}
      >
        {props.state ? (
          <ReplyDialog target={target} state={props.state} />
        ) : (
          <Interactive />
        )}
      </UploaderProvider>
    </EventSceneProvider>
  ),
  args: { failWrites: false, servers: ["https://blossom.example"] },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 送信に失敗する: Story = { args: { failWrites: true } };
export const 送信中: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "送っている途中の返信。",
      sending: true,
    },
  },
};

export const 画像を預けている途中: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "これ見て",
      uploads: [{ id: "1", name: "ねこ.png" }],
    },
  },
};

export const 画像を預けられなかった: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "これ見て",
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
export const 長い本文: Story = {
  args: {
    state: {
      content: Array.from(
        { length: 8 },
        (_, index) =>
          `${index + 1} 行目。長い返信でもダイアログからはみ出さないか。`,
      ).join("\n"),
      sending: false,
      uploads: [],
      media: [],
    },
  },
};
