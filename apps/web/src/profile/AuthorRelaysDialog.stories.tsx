import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayUsage } from "@streets/core/settings/relay-edit";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { RelayMediator } from "../settings/RelayMediator";
import {
  AuthorRelaysDialogView,
  type AuthorRelaysState,
} from "./AuthorRelaysDialog";

const relay = (url: string, usage: RelayUsage = "both"): RelayListEntry => ({
  url: url as RelayUrl,
  read: usage !== "write",
  write: usage !== "read",
});

type Args = { state: AuthorRelaysState };

const Story = (props: Args) => {
  const [relayList] = createSignal(undefined);
  return (
    <RelayMediator
      writer={{ replace: async () => ({ event: undefined }) as never }}
      relayList={relayList}
      settled={() => true}
      statusOf={() => "idle"}
      infoOf={() => undefined}
    >
      <AuthorRelaysDialogView state={props.state} onClose={() => {}} />
    </RelayMediator>
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
  },
  argTypes: { state: { control: false } },
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
