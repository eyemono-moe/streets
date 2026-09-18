import {
  type ProfileEditEvent,
  type ProfileEditState,
  emptyProfileEdit,
  profileEditTransition,
} from "@streets/core/settings/profile-edit";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import AccountSettingsView from "./AccountSettingsView";

const PUBKEY =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

type Args = { events: ProfileEditEvent[]; width: number; attention?: number };

const loaded = (fields: Record<string, string>): ProfileEditEvent => ({
  type: "profile/loaded",
  content: JSON.stringify(fields),
});

const mine = loaded({
  display_name: "わたし",
  name: "me",
  about: "Nostr のクライアントを作っています。",
  // Storybook は画像を data: の URL に埋め込むが、フォームは http(s) だけを通す。
  // 見本の画像は読めないので、プレビューは空の枠で出る。
  picture: "https://example.com/me.png",
  banner: "https://example.com/banner.png",
  nip05: "me@example.com",
  website: "https://example.com",
});

/** アプリでは ProfileMediator が裁定するイベントを、ここで手元の状態に当てる。 */
const Story = (props: Args) => {
  const [state, setState] = createSignal<ProfileEditState>(
    props.events.reduce(profileEditTransition, emptyProfileEdit()),
  );
  const apply = (event: ProfileEditEvent) =>
    setState((current) => profileEditTransition(current, event));
  return (
    <Mediates
      handle={(event) => {
        switch (event.type) {
          case "profile/input":
          case "profile/reset":
            apply(event);
            return true;
          case "profile/save":
            apply(event);
            setTimeout(() => apply({ type: "profile/saved" }), 800);
            return true;
          case "deck/logout":
            return true;
          default:
            return false;
        }
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <AccountSettingsView
          pubkey={PUBKEY}
          state={state()}
          attention={props.attention}
        />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/アカウント",
  component: Story,
  args: { events: [mine], width: 660 },
  argTypes: { events: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};

/** まだプロフィールを作っていない人。見本は npub の先頭で出る。 */
export const まだ無い: S = { args: { events: [loaded({})] } };

export const 書きかけ: S = {
  args: {
    events: [
      mine,
      { type: "profile/input", field: "display_name", value: "新しい名前" },
    ],
  },
};

export const 入力の誤り: S = {
  args: {
    events: [
      mine,
      { type: "profile/input", field: "picture", value: "example.com/me.png" },
      { type: "profile/input", field: "nip05", value: "me" },
    ],
  },
};

export const 保存中: S = {
  args: {
    events: [
      mine,
      { type: "profile/input", field: "about", value: "書き換えた自己紹介" },
      { type: "profile/save" },
    ],
  },
};

export const 長い値: S = {
  args: {
    events: [
      loaded({
        display_name:
          "とても長い表示名をつけている人で、プレビューの幅に収まらないくらい長い",
        name: "a-very-long-handle-name-that-keeps-going-and-going",
        about: "あ".repeat(300),
        website: "https://example.com/a/very/long/path/that/keeps/going",
      }),
    ],
  },
};

export const 狭い幅: S = { args: { width: 360 } };

/** 書きかけのまま閉じようとした。保存の欄を見せて揺らし、文言を強める。 */
export const 閉じようとした: S = {
  args: {
    attention: 1,
    events: [
      mine,
      { type: "profile/input", field: "about", value: "書きかけの自己紹介" },
    ],
  },
};
