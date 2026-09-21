import {
  type Attachment,
  type ComposeState,
  emptyCompose,
} from "@streets/core/view/compose";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SidePanel from "../deck/SidePanel";
import { UploaderProvider } from "../media/uploader";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import landscapeUrl from "../storybook/media-landscape.svg";
import squareUrl from "../storybook/media-square.svg";
import { createStoryAuthor } from "../storybook/story-events";
import ComposePanel from "./ComposePanel";

const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});

const shot = (
  id: string,
  name: string,
  preview: string,
  extra: Partial<Attachment> = {},
): Attachment => ({ id, name, preview, ...extra });

const blob = {
  url: "https://a.example/1.png",
  sha256: "a".repeat(64),
  size: 1024,
  type: "image/png",
};

type Props = {
  state: ComposeState;
  /** 画像の預け先。空にすると、画像のボタンが使えない見た目になる。 */
  servers: string[];
};

const meta = {
  title: "操作/投稿パネル",
  component: (props: Props) => (
    <EventSceneProvider scene={{ events: [viewer.profile()], viewer }}>
      <UploaderProvider
        value={{
          servers: () => props.servers,
          upload: () => Promise.reject(new Error("story では預けない")),
        }}
      >
        {/* サイドバーに開いたときと同じ幅・高さに載せる。 */}
        <div class="flex h-[640px]">
          <SidePanel
            title="ノートを書く"
            icon="i-material-symbols:edit-square-outline-rounded"
          >
            <ComposePanel state={props.state} />
          </SidePanel>
        </div>
      </UploaderProvider>
    </EventSceneProvider>
  ),
  args: {
    state: { ...emptyCompose(), content: "", sending: false },
    servers: ["https://blossom.example"],
  },
  argTypes: { state: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 空: Story = {};

export const 書きかけ: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "プレビューに出る本文。 #nostr https://example.com/",
    },
  },
};

export const 送信中: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "送っている途中のノート。",
      sending: true,
    },
  },
};

/** 添えた画像は押すと切り抜ける。並べ替えた順で、送るときに URL が並ぶ。 */
export const 画像を添えた: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "ねこの写真",
      attachments: [shot("1", "ねこ.png", landscapeUrl)],
    },
  },
};

export const 画像を複数添えた: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "2 枚できた。",
      attachments: [
        shot("1", "1.png", landscapeUrl),
        shot("2", "2.png", squareUrl),
      ],
    },
  },
};

/** 送ってはじめて預ける。預け終わったものから印が消える。 */
export const 画像を預けている途中: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "2 枚できた。",
      sending: true,
      attachments: [
        shot("1", "1.png", landscapeUrl, { blob }),
        shot("2", "2.png", squareUrl, { uploading: true }),
      ],
    },
  },
};

export const 画像を預けられなかった: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "2 枚できた。",
      attachments: [
        shot("1", "1.png", landscapeUrl, { blob }),
        shot("2", "2.png", squareUrl, { error: "大きすぎます" }),
      ],
    },
  },
};

/** 預け先を決めていない人。画像のボタンは薄いが押せて、押すと設定へ案内する。 */
export const 預け先が無い: Story = { args: { servers: [] } };

export const 長い本文: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: Array.from(
        { length: 14 },
        (_, index) =>
          `${index + 1} 行目。テキストエリアが伸びる上限と、プレビューのスクロールを確かめる。`,
      ).join("\n"),
    },
  },
};
