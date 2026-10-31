import type { PrivatePartStatus } from "@streets/core/nostr/private-tags";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayFailure } from "@streets/core/relay/relay-failures";
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

const failure = (
  url: string,
  reason: RelayFailure["reason"],
  count: number,
  detail?: string,
): RelayFailure => ({
  url: url as RelayUrl,
  reason,
  count,
  lastAt: 0,
  ...(detail !== undefined && { detail }),
});

const failures: RelayFailure[] = [
  failure("wss://members.example/", "restricted", 3, "not on the allowlist"),
  failure("wss://paid.example/", "auth-required", 1),
  failure("wss://gone.example/", "unreachable", 12),
  // 繋がないリレーに入っているものは出さない。
  failure("wss://spam.example/", "unreachable", 4),
];

type Args = {
  entries: BlockedRelayEntry[];
  failures: RelayFailure[];
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
          failures={props.failures}
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
    failures: [],
    privatePart: "ready",
    saving: false,
    width: 660,
  },
  argTypes: {
    entries: { control: false },
    failures: { control: false },
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

/** たくさん入れている。最初は畳んで件数だけを見せ、開くとその中で流す。 */
export const たくさん: S = {
  args: {
    entries: Array.from({ length: 40 }, (_, index) =>
      entry(
        `wss://spam-${String(index + 1).padStart(2, "0")}.example/`,
        index % 3 === 0 ? "private" : "public",
      ),
    ),
  },
};

/** このタブで繋がらなかった・断られたリレー。「繋がない」で上の一覧へ移る。 */
export const 最近つながらなかった: S = { args: { failures } };

export const 最近つながらなかった_狭い幅: S = {
  args: { failures, width: 360 },
};

/** リレーが長い説明を添えて断った。 */
export const 最近つながらなかった_長い説明: S = {
  args: {
    failures: [
      failure(
        "wss://a-very-long-relay-hostname-that-keeps-going.example.com/with/a/long/path/",
        "restricted",
        27,
        "this relay is only for paying members; visit https://members.example/subscribe to get access and then try again",
      ),
    ],
  },
};
