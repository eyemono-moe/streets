import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import BlockedRelaysView from "./BlockedRelaysView";

const account: RelayListEntry[] = [
  { url: "wss://yabu.me/" as RelayUrl, read: true, write: true },
  { url: "wss://nos.lol/" as RelayUrl, read: true, write: false },
];
const followeeWriteRelays = [
  ["wss://relay.nostr.band/", "wss://yabu.me/"],
  ["wss://spam.example/", "wss://nostr.wine/"],
] as RelayUrl[][];

type Args = {
  relays: RelayUrl[];
  saving: boolean;
  width: number;
};

/** アプリでは BlockedRelayMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [relays, setRelays] = createSignal(props.relays);
  return (
    <Mediates
      handle={(event) => {
        if (event.type === "blocked-relays/add") {
          setRelays((current) => [...current, event.url]);
          return true;
        }
        if (event.type === "blocked-relays/remove") {
          setRelays((current) =>
            current.filter((relay) => relay !== event.url),
          );
          return true;
        }
        return false;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <BlockedRelaysView
          relays={relays()}
          saving={props.saving}
          account={account}
          followeeWriteRelays={followeeWriteRelays}
        />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/繋がないリレー",
  component: Story,
  args: {
    relays: ["wss://spam.example/", "wss://slow.example/"],
    saving: false,
    width: 660,
  },
  argTypes: { relays: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};
export const まだ無い: S = { args: { relays: [] } };

/** 自分のアカウントで使っているリレーも入れてしまった。そこへは読み書きしない。 */
export const 自分のリレーと重なる: S = {
  args: { relays: ["wss://spam.example/", "wss://yabu.me/", "wss://nos.lol/"] },
};

export const 長いURL: S = {
  args: {
    relays: [
      "wss://a-very-long-relay-hostname-that-keeps-going.example.com/with/a/long/path/",
    ],
  },
};
export const 保存中: S = { args: { saving: true } };
export const 狭い幅: S = {
  args: {
    width: 360,
    relays: ["wss://spam.example/", "wss://yabu.me/"],
  },
};
