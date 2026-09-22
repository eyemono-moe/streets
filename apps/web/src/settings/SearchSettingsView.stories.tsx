import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { DEFAULT_SEARCH_RELAYS } from "@streets/core/settings/search-relay-list";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import SearchSettingsView from "./SearchSettingsView";

type Args = {
  relays: RelayUrl[];
  saving: boolean;
  chosen: boolean;
  width: number;
};

/** アプリでは SearchRelayMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [relays, setRelays] = createSignal(props.relays);
  return (
    <Mediates
      handle={(event) => {
        if (event.type === "search-relays/add") {
          setRelays((current) => [...current, event.url]);
          return true;
        }
        if (event.type === "search-relays/remove") {
          setRelays((current) =>
            current.filter((relay) => relay !== event.url),
          );
          return true;
        }
        return false;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <SearchSettingsView
          relays={relays()}
          saving={props.saving}
          chosen={props.chosen}
        />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/検索するリレー",
  component: Story,
  args: {
    relays: ["wss://search.example/"],
    saving: false,
    chosen: true,
    width: 660,
  },
  argTypes: { relays: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};

/** まだ自分で選んでいない人。既定のリレーをそのまま使っている。 */
export const 既定のまま: S = {
  args: { chosen: false, relays: [...DEFAULT_SEARCH_RELAYS] },
};

/** 自分で全部外した人。言葉では探せない。 */
export const リレーが無い: S = { args: { relays: [] } };
export const 保存中: S = { args: { saving: true } };
export const 狭い幅: S = { args: { width: 360 } };
