import type { Upload } from "@streets/core/view/compose";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { UploaderProvider } from "../media/uploader";
import { Mediates } from "../ui-events";
import { ComposeTools, ComposeUploads, countCharacters } from "./compose-parts";

/** 投稿パネル・返信・引用で共通の足まわり（ファイルの行と、下の操作列）だけを見る。 */
type Args = {
  content: string;
  uploads: Upload[];
  /** 預け先。空にすると、画像を添えるボタンが使えない見た目になる。 */
  servers: string[];
  sending: boolean;
};

const Parts = (props: Args) => {
  const [uploads, setUploads] = createSignal(props.uploads);
  return (
    <UploaderProvider
      value={{
        servers: () => props.servers,
        upload: () => Promise.reject(new Error("story では預けない")),
      }}
    >
      <Mediates
        handle={(event) => {
          if (event.type === "compose/attach-dismiss") {
            setUploads((current) => current.filter((u) => u.id !== event.id));
            return true;
          }
          return false;
        }}
      >
        <div class="w-100 overflow-hidden rounded-3 border border-primary bg-primary">
          <div class="px-4 pt-4">
            <div class="c-primary min-h-20 whitespace-pre-wrap rounded-2 border border-primary bg-secondary p-2.5 text-body">
              {props.content}
            </div>
          </div>
          <ComposeUploads uploads={uploads()} />
          <ComposeTools
            count={`${countCharacters(props.content)} 文字`}
            label="投稿"
            sending={props.sending}
            disabled={
              props.content.trim().length === 0 ||
              uploads().some((u) => u.error === undefined)
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
    uploads: [],
    servers: ["https://blossom.example"],
    sending: false,
  },
  argTypes: { uploads: { control: false } },
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};

export const 預けている途中: Story = {
  args: { uploads: [{ id: "1", name: "ねこ.png" }] },
};

export const 預けられなかった: Story = {
  args: {
    uploads: [{ id: "1", name: "ねこ.png", error: "大きすぎます" }],
  },
};

/** 何枚か同時に落としたところ。終わったものから本文の URL に変わっていく。 */
export const 複数を預けている: Story = {
  args: {
    content: "3 枚。\nhttps://example.com/1.png",
    uploads: [
      { id: "2", name: "とても長いファイル名の画像ファイル-2026-09-21.png" },
      {
        id: "3",
        name: "いぬ.jpg",
        error: "預け先が受け取ってくれませんでした",
      },
    ],
  },
};

/** 預け先を決めていない人。画像のボタンは押せる（押すと設定へ案内する）。 */
export const 預け先が無い: Story = { args: { servers: [] } };

export const 送信中: Story = { args: { sending: true } };
