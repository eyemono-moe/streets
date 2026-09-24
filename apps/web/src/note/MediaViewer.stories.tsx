import type { NoteMedia } from "@streets/core/view/note-layout";
import { type Component, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import clipUrl from "../storybook/media-clip.mp4";
import landscapeUrl from "../storybook/media-landscape.svg?no-inline";
import panoramaUrl from "../storybook/media-panorama.svg?no-inline";
import portraitUrl from "../storybook/media-portrait.svg?no-inline";
import squareUrl from "../storybook/media-square.svg?no-inline";
import tallUrl from "../storybook/media-tall.svg?no-inline";
import Button from "../ui/Button";
import MediaViewer from "./MediaViewer";

const image = (url: string): NoteMedia => ({ type: "image", url });

type Props = { media: NoteMedia[]; initialIndex: number };

/** 閉じたあとも開き直せるよう、開く位置をストーリーの中に持つ。 */
const Story: Component<Props> = (props) => {
  const [index, setIndex] = createSignal<number | undefined>(
    props.initialIndex,
  );
  return (
    <div class="p-4">
      <Button onClick={() => setIndex(props.initialIndex)}>開く</Button>
      <MediaViewer
        media={props.media}
        index={index()}
        onIndexChange={setIndex}
        onClose={() => setIndex(undefined)}
      />
    </div>
  );
};

const meta = {
  title: "投稿/メディアの拡大表示",
  component: Story,
  args: {
    media: [
      image(landscapeUrl),
      image(portraitUrl),
      image(squareUrl),
      image(panoramaUrl),
    ],
    initialIndex: 0,
  },
  parameters: { viewport: { defaultViewport: "responsive" } },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

/** 左右キー・スワイプ・前後のボタンで送る。 */
export const 複数枚: S = {};

/** 途中の画像から開いたとき。その位置から始まる。 */
export const 途中から開く: S = { args: { initialIndex: 2 } };

/** 1 枚だけなら、送るボタンも枚数も出さない。 */
export const 一枚: S = { args: { media: [image(landscapeUrl)] } };

/** 画面より縦に長い画像は、高さに合わせて縮める。 */
export const 縦に長い画像: S = { args: { media: [image(tallUrl)] } };

/** 画像と動画が混ざっていても、添付の順に送る。 */
export const 動画を含む: S = {
  args: {
    media: [image(landscapeUrl), { type: "video", url: clipUrl }],
  },
};

export const 読み込めない: S = {
  args: {
    media: [image("https://example.invalid/missing.png"), image(squareUrl)],
  },
};

export const 狭い画面: S = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
