import {
  type Attachment,
  type ComposeState,
  emptyCompose,
} from "@streets/core/view/compose";
import type { ComposeDraft } from "@streets/core/view/compose-drafts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SidePanel from "../deck/SidePanel";
import { StaticCustomEmojis } from "../emoji/custom-emojis";
import { UploaderProvider } from "../media/uploader";
import avatarUrl from "../storybook/avatar-fixture.svg";
import emojiUrl from "../storybook/emoji-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import clipUrl from "../storybook/media-clip.mp4";
import landscapeUrl from "../storybook/media-landscape.svg";
import squareUrl from "../storybook/media-square.svg";
import { createStoryAuthor } from "../storybook/story-events";
import { composeDrafts } from "./compose-drafts";
import { ComposeMediator } from "./ComposeMediator";
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
  interactive?: boolean;
  /** 画像のアップロード先。空にすると、画像のボタンが使えない見た目になる。 */
  servers: string[];
  drafts?: ComposeDraft[];
};

const Interactive = () => (
  <ComposeMediator
    send={() => Promise.resolve()}
    failure="投稿できませんでした"
    onSent={() => {}}
    drafts
  >
    {(state) => <ComposePanel state={state} drafts={composeDrafts()} />}
  </ComposeMediator>
);

const meta = {
  title: "操作/投稿パネル",
  component: (props: Props) => (
    <EventSceneProvider scene={{ events: [viewer.profile()], viewer }}>
      <StaticCustomEmojis
        emojis={[
          { shortcode: "neko", url: emojiUrl },
          { shortcode: "party", url: emojiUrl },
        ]}
      >
        <UploaderProvider
          value={{
            servers: () => props.servers,
            upload: () =>
              Promise.reject(new Error("story ではアップロードしない")),
          }}
        >
          {/* サイドバーに開いたときと同じ幅・高さに載せる。 */}
          <div class="flex h-[640px]">
            <SidePanel
              title="投稿する"
              icon="i-material-symbols:edit-square-outline-rounded"
            >
              {props.interactive ? (
                <Interactive />
              ) : (
                <ComposePanel state={props.state} drafts={props.drafts} />
              )}
            </SidePanel>
          </div>
        </UploaderProvider>
      </StaticCustomEmojis>
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

/** 絵文字を選ぶと、カーソル位置へ Unicode または :shortcode: が入る。 */
export const 絵文字を挿入する: Story = { args: { interactive: true } };

export const 書きかけ: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "プレビューに出る本文。 #nostr https://example.com/",
    },
  },
};

/** 自分の絵文字にある :shortcode: は、プレビューで絵文字になる。無いもの（:nai:）は文字のまま。 */
export const スタンプを含む本文: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "かわいい:neko: :party: と :nai:",
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

/** 送ってはじめてアップロードする。アップロードが終わったものから印が消える。 */
export const 画像をアップロードしている途中: Story = {
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

export const 画像をアップロードできなかった: Story = {
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

/** 動画も添えられる。プレビューでは再生して確かめられる。 */
export const 動画を添えた: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "動くもの",
      attachments: [shot("1", "うごき.mp4", clipUrl, { type: "video/mp4" })],
    },
  },
};

/** アップロード先を決めていない人。画像のボタンは薄いが押せて、押すと設定へ案内する。 */
export const アップロード先が無い: Story = { args: { servers: [] } };

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

/** 閲覧注意にした。本文の上に理由の欄が出て、プレビューにも閲覧注意が付く。 */
export const 閲覧注意にした: Story = {
  args: {
    state: {
      ...emptyCompose(),
      content: "結末に触れる感想。",
      contentWarning: "映画のネタバレ",
    },
  },
};

const now = Date.now();
const minutes = (n: number) => now - n * 60_000;

const drafts: ComposeDraft[] = [
  {
    id: "d1",
    content: "あとで書き足す。",
    savedAt: minutes(3),
    kept: false,
  },
  {
    id: "d2",
    content:
      "長い下書きは 2 行で切る。".repeat(12) +
      "\n\n改行のあとは見えなくてよい。",
    savedAt: minutes(60 * 30),
    kept: true,
  },
  {
    id: "d3",
    content: "最終回の感想。",
    contentWarning: "ネタバレ",
    savedAt: minutes(60 * 24 * 400),
    kept: true,
  },
  {
    id: "d4",
    content: "理由を書かずに閲覧注意を付けた下書き。",
    contentWarning: "",
    savedAt: minutes(10),
    kept: false,
  },
];

/**
 * 閉じると書きかけは自動で下書きに残る（新しいものから 5 件）。道具の列の下書きボタンで
 * 移したものは件数で消えない。押すと、いまの書きかけと入れ替えて開く。
 */
export const 下書きがある: Story = { args: { drafts } };

export const 書きかけと下書き: Story = {
  args: {
    drafts,
    state: { ...emptyCompose(), content: "下書きボタンで下書きへ移せる。" },
  },
};

/** 画像は下書きに残せないので、添えている間は下書きへ移せず、開けもしない。 */
export const 画像を添えていて下書きを開けない: Story = {
  args: {
    drafts,
    state: {
      ...emptyCompose(),
      content: "ねこの写真",
      attachments: [shot("1", "ねこ.png", landscapeUrl)],
    },
  },
};

/** 実際に書いて、下書きへ移す・開く・消すを試せる。下書きはこのブラウザに残る。 */
export const 下書きを試す: Story = { args: { interactive: true } };

/** 下書きが多くても、プレビューは潰れず、下書きと一緒にスクロールする。 */
export const 書きかけと多くの下書き: Story = {
  args: {
    drafts: Array.from({ length: 12 }, (_, index) => ({
      id: `many${index}`,
      content: `${index + 1} 件目の下書き。`,
      savedAt: minutes(index * 7),
      kept: index % 3 === 0,
    })),
    state: {
      ...emptyCompose(),
      content: "プレビューは潰れない。\n2 行目も見える。",
    },
  },
};
