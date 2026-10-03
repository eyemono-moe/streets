import type { PrivatePartStatus } from "@streets/core/nostr/private-tags";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type BlockedRelayEntry,
  applyBlockedRelayChange,
} from "@streets/core/settings/blocked-relay-list";
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

const entry = (
  url: string,
  visibility: BlockedRelayEntry["visibility"] = "public",
): BlockedRelayEntry => ({ url: url as RelayUrl, visibility });

type Args = {
  entries: BlockedRelayEntry[];
  privatePart: PrivatePartStatus | undefined;
  saving: boolean;
  width: number;
};

/** アプリでは BlockedRelayMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [entries, setEntries] = createSignal(props.entries);
  return (
    <Mediates
      handle={(event) => {
        if (event.type === "blocked-relays/add") {
          setEntries((current) =>
            applyBlockedRelayChange(current, {
              type: "add",
              entry: entry(event.url, event.visibility),
            }),
          );
          return true;
        }
        if (event.type === "blocked-relays/remove") {
          setEntries((current) =>
            applyBlockedRelayChange(current, {
              type: "remove",
              entry: event.entry,
            }),
          );
          return true;
        }
        return false;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <BlockedRelaysView
          entries={entries()}
          privatePart={props.privatePart}
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
    entries: [
      entry("wss://spam.example/"),
      entry("wss://slow.example/", "private"),
    ],
    privatePart: "ready",
    saving: false,
    width: 660,
  },
  argTypes: {
    entries: { control: false },
    privatePart: {
      control: "select",
      options: ["ready", "unavailable", "invalid", undefined],
    },
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};
export const まだ無い: S = { args: { entries: [] } };

/** 自分のアカウントで使っているリレーも入れてしまった。そこへは読み書きしない。 */
export const 自分のリレーと重なる: S = {
  args: {
    entries: [
      entry("wss://spam.example/"),
      entry("wss://yabu.me/", "private"),
      entry("wss://nos.lol/"),
    ],
  },
};

/** NIP-44 を持たない署名器。非公開は選べず、公開で足す。 */
export const 非公開を扱えない: S = {
  args: { privatePart: "unavailable", entries: [entry("wss://spam.example/")] },
};

export const 非公開を読めなかった: S = {
  args: { privatePart: "invalid", entries: [entry("wss://spam.example/")] },
};

export const 長いURL: S = {
  args: {
    entries: [
      entry(
        "wss://a-very-long-relay-hostname-that-keeps-going.example.com/with/a/long/path/",
        "private",
      ),
    ],
  },
};
export const 保存中: S = { args: { saving: true } };
export const 狭い幅: S = {
  args: {
    width: 360,
    entries: [entry("wss://spam.example/"), entry("wss://yabu.me/", "private")],
  },
};
