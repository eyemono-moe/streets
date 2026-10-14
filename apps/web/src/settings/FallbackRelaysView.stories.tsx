import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import FallbackRelaysView from "./FallbackRelaysView";

type Args = { relays: RelayUrl[]; width: number };

const url = (host: string) => `wss://${host}/` as RelayUrl;
const HOSTS = [
  "relay-jp.nostr.wirednet.jp",
  "yabu.me",
  "r.kojira.io",
  "nos.lol",
  "relay.damus.io",
];

/** アプリではデッキが裁定するイベントを、ここで手元の値に当てる。 */
const Story = (props: Args) => {
  const [relays, setRelays] = createSignal(props.relays);
  return (
    <EventSceneProvider
      scene={{
        events: [],
        relayInfo: Object.fromEntries(
          HOSTS.map((host) => [url(host), { name: host }]),
        ),
      }}
    >
      <Mediates
        handle={(event) => {
          if (event.type !== "deck/set-fallback-relays") return false;
          setRelays(event.relays);
          return true;
        }}
      >
        <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
          <FallbackRelaysView
            relays={relays()}
            candidates={[
              {
                url: url("relay-jp.nostr.wirednet.jp"),
                read: true,
                write: true,
              },
              { url: url("yabu.me"), read: true, write: false },
            ]}
            followeeWriteRelays={[]}
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "設定/既定のリレー",
  component: Story,
  args: { relays: [], width: 660 },
  argTypes: { relays: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** 指定していない。Streets が決めたリレーを使っていることを見せる。 */
export const 指定していない: S = {};

export const 指定してある: S = {
  args: { relays: [url("relay-jp.nostr.wirednet.jp"), url("r.kojira.io")] },
};

/** 上限まで指定した。足す欄を止める。 */
export const 上限まで: S = { args: { relays: HOSTS.map(url) } };

export const 狭い幅: S = {
  args: { relays: [url("relay-jp.nostr.wirednet.jp")], width: 340 },
};
