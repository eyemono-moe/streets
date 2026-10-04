import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import CommandPalette from "./CommandPalette";

const Demo = (props: { query: string; signedIn: boolean }) => (
  <Mediates handle={() => true}>
    <CommandPalette open signedIn={props.signedIn} initialQuery={props.query} />
  </Mediates>
);

const meta = {
  title: "Signal/コマンドパレット",
  component: Demo,
  args: { query: "", signedIn: true },
} satisfies Meta<typeof Demo>;

export default meta;
type S = StoryObj<typeof meta>;

export const 開いた直後: S = {};
export const カラムを検索: S = { args: { query: "カラム" } };
export const 設定を検索: S = { args: { query: "プロフィール画像" } };
export const 見つからない: S = { args: { query: "存在しない操作" } };
export const ログインしていない: S = {
  args: { query: "投稿", signedIn: false },
};
