import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import type { RelayUsage } from "@streets/core/settings/relay-edit";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { RelayMediator } from "../settings/RelayMediator";
import { EventSceneProvider } from "../storybook/EventScene";
import avatar from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import {
  AuthorRelaysDialogView,
  type AuthorRelaysState,
} from "./AuthorRelaysDialog";

const relay = (url: string, usage: RelayUsage = "both"): RelayListEntry => ({
  url: url as RelayUrl,
  read: usage !== "write",
  write: usage !== "read",
});

const admin = createStoryAuthor(94, {
  name: "relay-admin",
  displayName: "リレー管理者",
  picture: avatar,
});

type Args = { state: AuthorRelaysState; info: Record<string, RelayInfo> };

const Story = (props: Args) => {
  const [relayList] = createSignal(undefined);
  return (
    <EventSceneProvider scene={{ events: [admin.profile()] }}>
      <RelayMediator
        writer={{ replace: async () => ({ event: undefined }) as never }}
        relayList={relayList}
        settled={() => true}
        statusOf={() => "idle"}
        infoOf={() => undefined}
      >
        <AuthorRelaysDialogView
          state={props.state}
          title="リレー利用者さんが使っているリレー"
          infoOf={(url) => props.info[url]}
          onClose={() => {}}
        />
      </RelayMediator>
    </EventSceneProvider>
  );
};

const meta = {
  title: "ユーザー/リレー設定ダイアログ",
  component: Story,
  args: {
    state: {
      phase: "ready",
      incomplete: false,
      entries: [
        relay("wss://relay.example/"),
        relay("wss://read.example/a/very/long/path/that-wraps", "read"),
        relay("wss://write.example/", "write"),
      ],
    },
    info: {
      "wss://relay.example/": {
        name: "Example Relay",
        description: "NIP-11で取得したリレーの説明です。",
        icon: avatar,
        pubkey: admin.pubkey,
        contact: "mailto:relay@example.com",
      },
    },
  },
  argTypes: { state: { control: false }, info: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 通常: S = {};
export const 未設定: S = {
  args: { state: { phase: "empty", incomplete: false } },
};
export const 読み込み中: S = { args: { state: { phase: "loading" } } };
export const 取得失敗: S = { args: { state: { phase: "failed" } } };
export const 一部取得失敗: S = {
  args: {
    state: {
      phase: "ready",
      incomplete: true,
      entries: [relay("wss://relay.example/")],
    },
  },
};
export const 狭い画面: S = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
