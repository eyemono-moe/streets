import type { Attachment } from "@streets/core/view/compose";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { UploaderProvider } from "../media/uploader";
import landscapeUrl from "../storybook/media-landscape.svg";
import portraitUrl from "../storybook/media-portrait.svg";
import squareUrl from "../storybook/media-square.svg";
import { Mediates } from "../ui-events";
import {
  ComposeAttachments,
  ComposeTools,
  countCharacters,
} from "./compose-parts";

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

/** 投稿パネル・返信・引用で共通の足まわり（添えたファイルと、下の操作列）だけを見る。 */
type Args = {
  content: string;
  attachments: Attachment[];
  /** 預け先。空にすると、画像を添えるボタンが使えない見た目になる。 */
  servers: string[];
  sending: boolean;
};

const Parts = (props: Args) => {
  const [attachments, setAttachments] = createSignal(props.attachments);
  return (
    <UploaderProvider
      value={{
        servers: () => props.servers,
        upload: () => Promise.reject(new Error("story では預けない")),
      }}
    >
      <Mediates
        handle={(event) => {
          if (event.type === "compose/attach-remove") {
            setAttachments((current) =>
              current.filter((a) => a.id !== event.id),
            );
            return true;
          }
          if (event.type === "compose/attach-move") {
            setAttachments((current) => {
              const from = current.findIndex((a) => a.id === event.id);
              const moved = current[from];
              if (from === -1 || !moved) return current;
              const rest = current.filter((_, index) => index !== from);
              return [
                ...rest.slice(0, event.to),
                moved,
                ...rest.slice(event.to),
              ];
            });
            return true;
          }
          return false;
        }}
      >
        <div class="w-100 overflow-hidden rounded-3 border border-primary bg-primary">
          <div class="px-4 pt-4 pb-2">
            <div class="c-primary min-h-20 whitespace-pre-wrap rounded-2 border border-primary bg-secondary p-2.5 text-body">
              {props.content}
            </div>
          </div>
          <ComposeAttachments attachments={attachments()} />
          <ComposeTools
            count={`${countCharacters(props.content)} 文字`}
            label="投稿"
            sending={props.sending}
            disabled={
              props.content.trim().length === 0 && attachments().length === 0
            }
          />
        </div>
      </Mediates>
    </UploaderProvider>
  );
};

const meta = {
  title: "操作/投稿の部品",
  component: Parts,
  args: {
    content: "書きかけの本文。",
    attachments: [],
    servers: ["https://blossom.example"],
    sending: false,
  },
  argTypes: { attachments: { control: false } },
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};

/** 添えた画像は押すと切り抜ける。預けるのは送るとき。 */
export const 画像を添えた: Story = {
  args: { attachments: [shot("1", "ねこ.png", landscapeUrl)] },
};

/** 2 枚以上あるときだけ、前後へ動かすボタンを出す。 */
export const 複数添えた: Story = {
  args: {
    attachments: [
      shot("1", "1.png", landscapeUrl),
      shot("2", "2.png", squareUrl),
      shot("3", "3.png", portraitUrl),
    ],
  },
};

/** 切り抜いた画像。元の画像は残していて、押せば範囲を直せる。 */
export const 切り抜いた: Story = {
  args: {
    attachments: [
      shot("1", "ねこ.png", landscapeUrl, {
        crop: { x: 500, y: 150, width: 600, height: 600 },
      }),
      shot("2", "そのまま.png", landscapeUrl),
    ],
  },
};

export const 預けている途中: Story = {
  args: {
    attachments: [
      shot("1", "1.png", landscapeUrl, { blob }),
      shot("2", "2.png", squareUrl, { uploading: true }),
    ],
    sending: true,
  },
};

export const 預けられなかった: Story = {
  args: {
    attachments: [
      shot("1", "1.png", landscapeUrl, { blob }),
      shot("2", "2.png", squareUrl, { error: "大きすぎます" }),
    ],
  },
};

/** 預け先を決めていない人。画像のボタンは薄いが押せて、押すと設定へ案内する。 */
export const 預け先が無い: Story = { args: { servers: [] } };

export const 送信中: Story = { args: { sending: true } };
