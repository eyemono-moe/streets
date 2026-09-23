import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { XEmbed, YouTubeEmbed } from "./EmbedView";

/** 押すまで何も読み込まないので、押したときだけ YouTube・X へ繋がる。 */
const meta = {
  title: "イベント/埋め込み",
  component: (props: {
    width: number;
    kind: "youtube" | "x" | "x-loading" | "x-missing";
    title?: string;
  }) => (
    <div class="bg-primary p-3" style={{ width: `${props.width}px` }}>
      {props.kind === "youtube" ? (
        <YouTubeEmbed id="dQw4w9WgXcQ" title={props.title} />
      ) : (
        <XEmbed
          id="20"
          url="https://x.com/jack/status/20"
          card={
            props.kind === "x-loading"
              ? undefined
              : props.kind === "x-missing"
                ? null
                : {
                    url: "https://x.com/jack/status/20",
                    title: "Xユーザーのjack（@jack）さん",
                    description: "just setting up my twttr",
                    image: avatarUrl,
                    siteName: "X (formerly Twitter)",
                  }
          }
          mode="compact"
          size="normal"
        />
      )}
    </div>
  ),
  args: {
    width: 360,
    kind: "youtube",
    title: "Rick Astley - Never Gonna Give You Up (Official Video)",
  },
  argTypes: {
    kind: {
      control: "inline-radio",
      options: ["youtube", "x", "x-loading", "x-missing"],
    },
  },
} satisfies Meta<{
  width: number;
  kind: "youtube" | "x" | "x-loading" | "x-missing";
  title?: string;
}>;

export default meta;
type Story = StoryObj<typeof meta>;

export const YouTube: Story = {};
export const YouTube_題名なし: Story = { args: { title: undefined } };
export const YouTube_幅の狭いカラム: Story = { args: { width: 280 } };
export const X: Story = { args: { kind: "x" } };
export const X_カードを取得中: Story = { args: { kind: "x-loading" } };
export const X_カードが取れない: Story = { args: { kind: "x-missing" } };
