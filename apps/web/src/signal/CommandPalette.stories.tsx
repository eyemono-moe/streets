import { encodeBech32 } from "@streets/core/nostr/nip19";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { alice, viewer } from "../note/event-stories/event-story";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import CommandPalette from "./CommandPalette";

const Demo = (props: {
  query: string;
  signedIn: boolean;
  withPeople: boolean;
}) => {
  const palette = () => (
    <Mediates handle={() => true}>
      <CommandPalette
        open
        signedIn={props.signedIn}
        initialQuery={props.query}
      />
    </Mediates>
  );
  return props.withPeople ? (
    <EventSceneProvider
      scene={{
        events: [
          viewer.profile(),
          alice.profile(),
          viewer.follows([alice.pubkey]),
        ],
        viewer,
      }}
    >
      {palette()}
    </EventSceneProvider>
  ) : (
    palette()
  );
};

const meta = {
  title: "Signal/コマンドパレット",
  component: Demo,
  args: { query: "", signedIn: true, withPeople: false },
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
export const ユーザーIDを入力: S = {
  args: { query: encodeBech32("npub", "1".repeat(64)) },
};
export const ユーザーを補完: S = {
  args: { query: "@", signedIn: true, withPeople: true },
};
