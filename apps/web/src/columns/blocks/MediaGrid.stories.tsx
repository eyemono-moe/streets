import type { Paging } from "@streets/core/read/source";
import { type MediaTile, mediaTilesOf } from "@streets/core/view/media-grid";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { alice, profiles } from "../../note/event-stories/event-story";
import { EventSceneProvider } from "../../storybook/EventScene";
import clipAsset from "../../storybook/media-clip.mp4";
import landscapeAsset from "../../storybook/media-landscape.svg?no-inline";
import panoramaAsset from "../../storybook/media-panorama.svg?no-inline";
import portraitAsset from "../../storybook/media-portrait.svg?no-inline";
import squareAsset from "../../storybook/media-square.svg?no-inline";
import tallAsset from "../../storybook/media-tall.svg?no-inline";
import { MediaGridView } from "./MediaGrid";

// 本文の URL パーサーは http(s) で始まるものだけを拾う。
const absolute = (asset: string) => new URL(asset, location.href).href;
const landscape = absolute(landscapeAsset);
const portrait = absolute(portraitAsset);
const square = absolute(squareAsset);
const panorama = absolute(panoramaAsset);
const tall = absolute(tallAsset);
const clip = absolute(clipAsset);

const posts = [
  alice.note(`散歩で見つけた花。\n${square}`),
  alice.note(`夕焼けと、帰り道の動画。\n${landscape}\n${clip}`),
  alice.note(`ネタバレになる写真\n${portrait}`, [
    ["content-warning", "映画のネタバレ"],
  ]),
  alice.note(`旅行の写真をまとめて。\n${panorama}\n${tall}\n${square}`),
  alice.note(`縦長の写真は真ん中で切り抜く。\n${portrait}`),
  alice.note(`${landscape}`),
];
const tiles = posts.flatMap(mediaTilesOf);

type Props = {
  tiles: readonly MediaTile[];
  settled: boolean;
  paging: Paging;
  width: number;
};

const meta = {
  title: "ユーザー/メディアのタブ",
  component: (props: Props) => (
    <EventSceneProvider scene={{ events: [...profiles, ...posts] }}>
      <div class="bg-primary" style={{ width: `${props.width}px` }}>
        <MediaGridView
          tiles={props.tiles}
          settled={props.settled}
          paging={props.paging}
          onLoadMore={() => {}}
        />
      </div>
    </EventSceneProvider>
  ),
  args: { tiles, settled: true, paging: "idle", width: 360 },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 1 つの投稿に何枚もあれば 1 枚ずつ並ぶ。動画には再生の印、閲覧注意は押すまで隠す。
 * 押すと拡大表示で開き、下の帯から投稿を開ける。
 */
export const 並び: Story = {};

export const 読み込み中: Story = {
  args: { tiles: [], settled: false },
};

/** 最初のページに添付が無くても、古いページを取り足して探す。 */
export const 古い投稿を探している: Story = {
  args: { tiles: [], paging: "loading" },
};

export const 添付が無い: Story = {
  args: { tiles: [], paging: "exhausted" },
};

export const 読み込めない画像: Story = {
  args: {
    tiles: mediaTilesOf(
      alice.note(`https://example.invalid/missing.png\n${square}`),
    ),
  },
};

export const 狭いカラム: Story = { args: { width: 240 } };
