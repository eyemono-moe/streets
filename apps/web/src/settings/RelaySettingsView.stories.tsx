import type { RelayStatus } from "@streets/core/read/connection-pool";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  allowsRelayOp,
  applyRelayOps,
} from "@streets/core/settings/relay-edit";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import RelaySettingsView from "./RelaySettingsView";

type Args = {
  entries: RelayListEntry[];
  status: Record<string, RelayStatus>;
  loading: boolean;
  /** 置く幅。狭いカラムや携帯の幅を見る。 */
  width: number;
};

const relay = (host: string, read = true, write = true): RelayListEntry => ({
  url: `wss://${host}/` as RelayUrl,
  read,
  write,
});

/** アプリでは RelayMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [entries, setEntries] = createSignal(props.entries);
  return (
    <Mediates
      handle={(event) => {
        if (event.type !== "relays/edit") return false;
        setEntries((current) => applyRelayOps(current, [event.op]));
        return true;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <RelaySettingsView
          entries={entries()}
          loading={props.loading}
          statusOf={(url) => props.status[url] ?? "idle"}
          allows={(op) => allowsRelayOp(entries(), op)}
          fallback={FALLBACK_RELAYS}
        />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/リレー",
  component: Story,
  args: {
    entries: [
      relay("relay.damus.io"),
      relay("nos.lol"),
      relay("yabu.me", true, false),
      relay("relay.nostr.band", true, false),
    ],
    status: {
      "wss://relay.damus.io/": "in-use",
      "wss://nos.lol/": "in-use",
      "wss://yabu.me/": "failing",
    },
    loading: false,
    width: 660,
  },
  argTypes: { entries: { control: false }, status: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};

export const 読み込み中: S = { args: { loading: true, entries: [] } };

/** 一覧をまだ作っていない人。既定のリレーを使っていることを見せる。 */
export const まだ選んでいない: S = { args: { entries: [] } };

/** 書き込み先が 1 つだけ。その「書き込み」と「外す」は押せない。 */
export const 最後の書き込み先: S = {
  args: {
    entries: [relay("relay.damus.io"), relay("nos.lol", true, false)],
  },
};

export const 長い_URL: S = {
  args: {
    entries: [
      relay(
        "very-long-subdomain-for-a-community-relay.example-nostr-provider.com/some/deep/path",
      ),
      relay("nos.lol"),
    ],
  },
};

export const たくさん: S = {
  args: {
    entries: Array.from({ length: 14 }, (_, i) =>
      relay(`relay-${i + 1}.example.com`, true, i % 3 === 0),
    ),
  },
};

export const 狭い幅: S = { args: { width: 340 } };
