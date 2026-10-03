import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { ReadRoutingMode } from "@streets/core/settings/read-routing-setting";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import ReadRoutingView from "./ReadRoutingView";

type Args = {
  mode: ReadRoutingMode;
  entries: RelayListEntry[];
  loading: boolean;
  width: number;
};

const relay = (host: string, read = true, write = true): RelayListEntry => ({
  url: `wss://${host}/` as RelayUrl,
  read,
  write,
});

/** アプリではデッキが裁定するイベントを、ここで手元の値に当てる。 */
const Story = (props: Args) => {
  const [mode, setMode] = createSignal(props.mode);
  return (
    <Mediates
      handle={(event) => {
        if (event.type !== "deck/set-read-routing") return false;
        setMode(event.mode);
        return true;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <ReadRoutingView
          mode={mode()}
          entries={props.entries}
          loading={props.loading}
          fallback={FALLBACK_RELAYS}
        />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/投稿を読むリレー",
  component: Story,
  args: {
    mode: "outbox",
    entries: [relay("relay.damus.io"), relay("yabu.me", true, false)],
    loading: false,
    width: 660,
  },
  argTypes: {
    entries: { control: false },
    mode: { control: "inline-radio", options: ["outbox", "direct"] },
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 人ごとに選ぶ: S = {};

/** 読み込みリレーだけを読む。どのリレーから読んでいるかを見せる。 */
export const 読み込みリレーだけ: S = { args: { mode: "direct" } };

/** 読み込みリレーが無いので、既定のリレーから読んでいる。 */
export const 読み込みリレーだけ_一覧なし: S = {
  args: { mode: "direct", entries: [] },
};

export const 読み込みリレーだけ_読み込み中: S = {
  args: { mode: "direct", entries: [], loading: true },
};

export const 読み込みリレーだけ_狭い幅: S = {
  args: { mode: "direct", width: 340 },
};
