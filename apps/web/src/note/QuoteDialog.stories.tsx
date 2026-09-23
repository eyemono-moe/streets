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

const shot = (
  id: string,
  name: string,
  preview: string,
  extra: Partial<Attachment> = {},
): Attachment => ({ id, name, preview, ...extra });

type Props = {
  target: NostrEvent;
  /** 画像のアップロード先。空にすると、画像のボタンが使えない見た目になる。 */
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
      <StaticCustomEmojis emojis={[{ shortcode: "neko", url: emojiUrl }]}>
        <UploaderProvider
          value={{
            servers: () => props.servers,
            upload: () =>
              Promise.reject(new Error("story ではアップロードしない")),
          }}
        >
          {props.state ? (
            <QuoteDialog target={props.target} state={props.state} />
          ) : (
            <Interactive target={props.target} />
          )}
        </UploaderProvider>
      </StaticCustomEmojis>
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
export const 長い引用対象: Story = { args: { target: longTarget } };
export const プロフィール未取得: Story = { args: { includeProfile: false } };
export const 狭い幅: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
import type { NostrEvent } from "@streets/core/nostr/event";
