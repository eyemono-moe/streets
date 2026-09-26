import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import RelayInput from "./RelayInput";

const url = (host: string) => `wss://${host}/` as RelayUrl;
const account: RelayListEntry[] = [
  { url: url("yabu.me"), read: true, write: true },
  { url: url("relay-jp.nostr.wirednet.jp"), read: true, write: false },
  { url: url("nos.lol"), read: false, write: true },
];
const followeeWriteRelays = [
  [url("relay.nostr.band"), url("yabu.me")],
  [url("relay.nostr.band"), url("nostr.wine")],
  [url("relay.nostr.band"), url("relay.damus.io")],
  [url("nostr.wine")],
];

type Props = {
  account: RelayListEntry[];
  followeeWriteRelays: RelayUrl[][];
  initial: RelayUrl[];
};

const meta = {
  title: "デッキ/リレーを足す欄",
  component: (props: Props) => {
    const [selected, setSelected] = createSignal<RelayUrl[]>(props.initial);
    return (
      <div class="flex w-90 flex-col gap-2 bg-primary p-3">
        <RelayInput
          account={props.account}
          followeeWriteRelays={props.followeeWriteRelays}
          selected={selected()}
          onAdd={(added) => setSelected((current) => [...current, added])}
        />
        <p class="c-secondary text-caption">
          足したもの：{selected().join("、") || "なし"}
        </p>
      </div>
    );
  },
  args: { account, followeeWriteRelays, initial: [url("yabu.me")] },
  argTypes: {
    account: { control: false },
    followeeWriteRelays: { control: false },
    initial: { control: false },
  },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 焦点を当てると候補が出る。 */
export const 通常: Story = {};
export const 候補が無い: Story = {
  args: { account: [], followeeWriteRelays: [], initial: [] },
};
