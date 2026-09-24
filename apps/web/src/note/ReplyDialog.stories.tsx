import {
  type Attachment,
  type ComposeState,
  emptyCompose,
} from "@streets/core/view/compose";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { useEventActions } from "../actions";
import { StaticCustomEmojis } from "../emoji/custom-emojis";
import { UploaderProvider } from "../media/uploader";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import emojiUrl from "../storybook/emoji-fixture.svg";
import landscapeUrl from "../storybook/media-landscape.svg";
import squareUrl from "../storybook/media-square.svg";
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

const shot = (
  id: string,
  name: string,
  preview: string,
  extra: Partial<Attachment> = {},
): Attachment => ({ id, name, preview, ...extra });

type Props = {
  failWrites: boolean;
  /** 画像のアップロード先。空にすると、画像のボタンが使えない見た目になる。 */
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
      <StaticCustomEmojis emojis={[{ shortcode: "neko", url: emojiUrl }]}>
        <UploaderProvider
          value={{
            servers: () => props.servers,
            upload: () =>
              Promise.reject(new Error("story ではアップロードしない")),
          }}
        >
          {props.state ? (
            <ReplyDialog target={target} state={props.state} />
          ) : (
            <Interactive />
          )}
        </UploaderProvider>
      </StaticCustomEmojis>
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

export const 画像を添えた: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "これ見て",
      attachments: [shot("1", "ねこ.png", landscapeUrl)],
    },
  },
};

/** 送ってはじめてアップロードする。アップロードが終わったものから印が消える。 */
export const 画像をアップロードしている途中: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "これ見て",
      sending: true,
      attachments: [
        shot("1", "1.png", landscapeUrl, {
          blob: {
            url: "https://a.example/1.png",
            sha256: "a".repeat(64),
            size: 1024,
            type: "image/png",
          },
        }),
        shot("2", "2.png", squareUrl, { uploading: true }),
      ],
    },
  },
};

export const 画像をアップロードできなかった: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "これ見て",
      attachments: [
        shot("1", "ねこ.png", landscapeUrl, { error: "大きすぎます" }),
      ],
    },
  },
};

/** アップロード先を決めていない人。画像のボタンは薄いが押せて、押すと設定へ案内する。 */
export const アップロード先が無い: Story = { args: { servers: [] } };
export const 長い本文: Story = {
  args: {
    state: {
      content: Array.from(
        { length: 8 },
        (_, index) =>
          `${index + 1} 行目。長い返信でもダイアログからはみ出さないか。`,
      ).join("\n"),
      sending: false,
      attachments: [],
    },
  },
};
