import type { RelayStatus } from "@streets/core/read/connection-pool";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import type { ReadRoutingMode } from "@streets/core/settings/read-routing-setting";
import {
  allowsRelayOp,
  applyRelayOps,
} from "@streets/core/settings/relay-edit";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatar from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import RelaySettingsView from "./RelaySettingsView";

type Args = {
  entries: RelayListEntry[];
  status: Record<string, RelayStatus>;
  info: Record<string, RelayInfo>;
  loading: boolean;
  readMode: ReadRoutingMode;
  /** 置く幅。狭いカラムや携帯の幅を見る。 */
  width: number;
};

const admin = createStoryAuthor(71, {
  name: "relay-admin",
  displayName: "リレーの管理人",
  picture: avatar,
});

const relay = (host: string, read = true, write = true): RelayListEntry => ({
  url: `wss://${host}/` as RelayUrl,
  read,
  write,
});

/** アプリでは RelayMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [entries, setEntries] = createSignal(props.entries);
  const [readMode, setReadMode] = createSignal(props.readMode);
  return (
    <EventSceneProvider scene={{ events: [admin.profile()] }}>
      <Mediates
        handle={(event) => {
          if (event.type === "deck/set-read-routing") {
            setReadMode(event.mode);
            return true;
          }
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
            infoOf={(url) => props.info[url]}
            allows={(op) => allowsRelayOp(entries(), op)}
            fallback={FALLBACK_RELAYS}
            readMode={readMode()}
          />
        </div>
      </Mediates>
    </EventSceneProvider>
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
    info: {
      "wss://relay.damus.io/": {
        name: "damus.io",
        description: "Damus strfry relay",
        icon: avatar,
        pubkey: admin.pubkey,
        contact: "relay@damus.io",
      },
      "wss://yabu.me/": {
        name: "yabu.me",
        description:
          "日本のユーザー向けのリレーです。\n投稿は一定期間で消えることがあります。",
        pubkey: admin.pubkey,
      },
    },
    loading: false,
    readMode: "outbox",
    width: 660,
  },
  argTypes: {
    entries: { control: false },
    status: { control: false },
    info: { control: false },
    readMode: { control: "inline-radio", options: ["outbox", "direct"] },
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** 名乗っているリレー・名乗らないリレーが混ざる。名前を押すと詳しく出る。 */
export const いつもの: S = {};

export const 読み込み中: S = { args: { loading: true, entries: [] } };

/** 一覧をまだ作っていない人。既定のリレーを使っていることを見せる。 */
export const まだ選んでいない: S = { args: { entries: [] } };

/** 書き込み先が 1 つだけ。そのリレーの「読み込み」と「外す」は選べない。 */
export const 最後の書き込み先: S = {
  args: {
    entries: [relay("relay.damus.io"), relay("nos.lol", true, false)],
  },
};

export const 長い名前と_URL: S = {
  args: {
    entries: [
      relay(
        "very-long-subdomain-for-a-community-relay.example-nostr-provider.com/some/deep/path",
      ),
      relay("nos.lol"),
    ],
    info: {
      "wss://nos.lol/": {
        name: "とても長い名前を名乗っているリレーで、行に収まらないくらい長い",
        description: "あ".repeat(400),
        contact:
          "https://example.com/very/long/contact/page/that/keeps/going/on",
      },
    },
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

/** 読み込みリレーだけを読む。どのリレーから読んでいるかを見せる。 */
export const 読み込みリレーだけ: S = { args: { readMode: "direct" } };

/** 読み込みリレーが無いので、既定のリレーから読んでいる。 */
export const 読み込みリレーだけ_一覧なし: S = {
  args: { readMode: "direct", entries: [] },
};

export const 読み込みリレーだけ_狭い幅: S = {
  args: { readMode: "direct", width: 340 },
};
