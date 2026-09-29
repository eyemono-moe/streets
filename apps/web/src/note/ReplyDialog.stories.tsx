import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type Attachment,
  type ComposeState,
  emptyCompose,
} from "@streets/core/view/compose";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { useEventActions } from "../actions";
import { StaticCustomEmojis } from "../emoji/custom-emojis";
import { UploaderProvider } from "../media/uploader";
import avatarUrl from "../storybook/avatar-fixture.svg";
import emojiUrl from "../storybook/emoji-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
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
const plainTarget = parent.note("返信元のノートの本文。");
const warnedTarget = parent.note("閲覧注意の奥にある返信元の本文。", [
  ["content-warning", "ネタバレ"],
]);
const longTarget = parent.note(
  "長い返信元の本文。返信を書く欄が画面の外へ押し出されないか。".repeat(20),
);

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
  /** 返信元に閲覧注意が付いている。 */
  warned?: boolean;
  /** 返信元の本文が長い。 */
  longTarget?: boolean;
};

const Interactive = (props: { target: NostrEvent }) => {
  const actions = useEventActions();
  return (
    <ComposeMediator
      send={(text) => actions?.reply(props.target, text) ?? Promise.resolve()}
      failure="返信できませんでした"
      onSent={() => {}}
    >
      {(state) => <ReplyDialog target={props.target} state={state} />}
    </ComposeMediator>
  );
};

const meta = {
  title: "操作/返信ダイアログ",
  component: (props: Props) => {
    const target = () =>
      props.warned ? warnedTarget : props.longTarget ? longTarget : plainTarget;
    return (
      <EventSceneProvider
        scene={{
          events: [parent.profile(), viewer.profile(), target()],
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
              <ReplyDialog target={target()} state={props.state} />
            ) : (
              <Interactive target={target()} />
            )}
          </UploaderProvider>
        </StaticCustomEmojis>
      </EventSceneProvider>
    );
  },
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
/** 閲覧注意で隠している投稿へ返信するときは、返信元の本文の代わりに閲覧注意を出す。 */
export const 閲覧注意の投稿への返信: Story = { args: { warned: true } };

/** 画面に収まらないときは本文だけが流れ、見出しと送信の行は残る。 */
export const 画面に収まらない: Story = {
  args: {
    longTarget: true,
    state: {
      ...emptyCompose(),
      content: Array.from(
        { length: 30 },
        (_, index) => `${index + 1} 行目。とても長い返信。`,
      ).join("\n"),
      attachments: [
        shot("1", "1.png", landscapeUrl),
        shot("2", "2.png", squareUrl),
        shot("3", "3.png", landscapeUrl),
      ],
    },
  },
};
