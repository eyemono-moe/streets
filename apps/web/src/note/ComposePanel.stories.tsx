import { type ComposeState, emptyCompose } from "@streets/core/view/compose";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SidePanel from "../deck/SidePanel";
import { UploaderProvider } from "../media/uploader";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
// 小さい SVG は data URI に埋め込まれ、本文の URL として拾われなくなるので、ファイルのまま配信させる。
import landscapeUrl from "../storybook/media-landscape.svg?no-inline";
import squareUrl from "../storybook/media-square.svg?no-inline";
import { createStoryAuthor } from "../storybook/story-events";
import ComposePanel from "./ComposePanel";

const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});

// 本文の URL は http(s) で始まらないと画像として拾われないので、配信元の origin を付ける。
const absolute = (url: string) => new URL(url, location.href).href;

const blob = (url: string, seed: string) => ({
  url,
  sha256: seed.repeat(64).slice(0, 64),
  size: 1024,
  type: "image/svg+xml",
});

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

/** 預け終わるまで送れない（送信ボタンではなく、文字数の隣の行で状況を見せる）。 */
export const 画像を預けている途中: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "ねこの写真",
      uploads: [{ id: "1", name: "ねこ.png" }],
    },
  },
};

export const 画像を預けられなかった: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "ねこの写真",
      uploads: [{ id: "1", name: "ねこ.png", error: "大きすぎます" }],
    },
  },
};

/** 預け終わったものは本文の URL になり、プレビューに画像として出る。 */
export const 画像を複数添えた: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: `2 枚できた。\n${absolute(landscapeUrl)}\n${absolute(squareUrl)}`,
      media: [
        blob(absolute(landscapeUrl), "a"),
        blob(absolute(squareUrl), "b"),
      ],
    },
  },
};

/** 1 枚は終わって、もう 1 枚を預けている途中。 */
export const 添え終わりと途中が混ざる: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: `3 枚。\n${absolute(landscapeUrl)}`,
      media: [blob(absolute(landscapeUrl), "a")],
      uploads: [
        { id: "2", name: "いぬ.jpg" },
        { id: "3", name: "とり.png", error: "預け先が受け取ってくれません" },
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
