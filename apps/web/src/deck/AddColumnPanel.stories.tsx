import type { RelayListState } from "@streets/core/settings/relay-list-state";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import AddColumnPanel from "./AddColumnPanel";

const meta = {
  title: "デッキ/カラム追加",
  component: (props: {
    relayList: RelayListState;
    initialRelayOpen: boolean;
  }) => (
    <Mediates handle={() => true}>
      <div class="flex h-150 w-95 flex-col bg-primary pt-3">
        <AddColumnPanel
          relayList={props.relayList}
          initialRelayOpen={props.initialRelayOpen}
        />
      </div>
    </Mediates>
  ),
  args: {
    relayList: {
      phase: "ready",
      entries: [
        { url: "wss://relay.example/", read: true, write: true },
        { url: "wss://inbox.example/", read: true, write: false },
        { url: "wss://outbox.example/", read: false, write: true },
      ],
    },
    initialRelayOpen: true,
  },
  argTypes: {
    relayList: { control: false },
    initialRelayOpen: { control: false },
  },
} satisfies Meta<{
  relayList: RelayListState;
  initialRelayOpen: boolean;
}>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 開いた直後。カラムの種類を選ぶところ。 */
export const カラムの種類: Story = { args: { initialRelayOpen: false } };

export const リレー設定あり: Story = {};

export const 読み込み中: Story = {
  args: { relayList: { phase: "loading" } },
};

export const リレー設定なし: Story = {
  args: { relayList: { phase: "missing" } },
};
