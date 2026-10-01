import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatar from "../storybook/avatar-fixture.svg";
import { ClientDialogView, type ClientInfoState } from "./ClientDialog";

type Args = { name: string; state: ClientInfoState };

const Story = (props: Args) => (
  <ClientDialogView
    name={props.name}
    seed={"a".repeat(64)}
    state={props.state}
    onClose={() => {}}
  />
);

const meta = {
  title: "イベント/投稿/使われたアプリ",
  component: Story,
  args: {
    name: "Foo",
    state: {
      phase: "ready",
      profile: {
        displayName: "Foo",
        picture: new URL(avatar, location.href).href,
        about: "カラムで Nostr を読むためのクライアントです。",
      },
      website: "https://foo.example/",
      openUrl: "https://foo.example/e/nevent1qqsexample",
    },
  },
  argTypes: { state: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** 説明と、この投稿を開く URL・ウェブサイトがそろっている。 */
export const 通常: S = {};

/** `client` タグに名前しか無い（Primal など）。説明を探しに行かない。 */
export const 名前だけ: S = {
  args: { name: "Primal iOS", state: { phase: "name-only" } },
};

export const 読み込み中: S = { args: { state: { phase: "loading" } } };

export const 取得失敗: S = { args: { state: { phase: "failed" } } };

/** アイコンが無いときは、標識で埋める。 */
export const アイコンが無い: S = {
  args: {
    state: {
      phase: "ready",
      profile: { name: "foo-client" },
      website: "https://foo.example/",
    },
  },
};

/** 開き方が書かれていない。押せるものを出さない。 */
export const 開き方が無い: S = {
  args: { state: { phase: "ready", profile: { name: "Foo" } } },
};

export const 長い説明: S = {
  args: {
    name: "とても長い名前のクライアント".repeat(4),
    state: {
      phase: "ready",
      profile: {
        about: "カラムを並べて読み、書いて、また読みます。\n".repeat(12),
      },
      website: `https://foo.example/${"very-long-path/".repeat(8)}`,
      openUrl: "https://a-very-long-subdomain-name.foo.example/e/nevent1qq",
    },
  },
};

export const 狭い画面: S = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
