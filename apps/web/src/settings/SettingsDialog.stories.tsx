import type { DeckAppearance } from "@streets/core/deck/deck";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { ColorScheme } from "@streets/core/settings/color-scheme";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { DEFAULT_APPEARANCE, PALETTES, applyColors } from "../theme";
import { Mediates } from "../ui-events";
import { RelayMediator } from "./RelayMediator";
import SettingsDialog from "./SettingsDialog";

type Props = { wide: boolean; appearance: DeckAppearance; page: string };

const relayList = (tags: string[][]): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: "1".repeat(64),
  created_at: 1_720_000_000,
  kind: 10002,
  tags,
  content: "",
  sig: "2".repeat(128),
});

/**
 * アプリではデッキの段が受け取るイベントを、ここで受けて手元の値に当てる。
 * 色はストーリーの画面全体に当たる（ツールバーのテーマ色より優先される）。
 */
const Story = (props: Props) => {
  const [scheme, setScheme] = createSignal<ColorScheme>("system");
  const [appearance, setAppearance] = createSignal(props.appearance);
  const [writeProgress, setWriteProgress] = createSignal(true);
  // リレーの一覧は、保存したらそのまま手元の版を差し替える（署名もリレーも無い）。
  const [relays, setRelays] = createSignal<NostrEvent | undefined>(
    relayList([
      ["r", "wss://relay.damus.io/"],
      ["r", "wss://nos.lol/"],
      ["r", "wss://yabu.me/", "read"],
    ]),
  );
  applyColors(props.appearance);
  return (
    <RelayMediator
      writer={{
        replace: async (_kind, _identifier, mutation) => {
          const draft = await mutation(relays());
          const next = relayList(draft.tags);
          setRelays(next);
          return { event: next } as never;
        },
      }}
      relayList={relays}
      settled={() => true}
      statusOf={(url: RelayUrl) =>
        url === "wss://yabu.me/" ? "failing" : "in-use"
      }
      infoOf={(url: RelayUrl) =>
        url === "wss://yabu.me/"
          ? { name: "yabu.me", description: "日本のリレーです。" }
          : undefined
      }
    >
      <Mediates
        handle={(event) => {
          switch (event.type) {
            case "deck/set-color-scheme":
              setScheme(event.scheme);
              return false;
            case "deck/preview-appearance":
              applyColors(event.appearance);
              return true;
            case "deck/set-write-progress":
              setWriteProgress(event.on);
              return true;
            case "deck/set-appearance":
              applyColors(event.appearance);
              setAppearance(event.appearance);
              return true;
            default:
              return false;
          }
        }}
      >
        <SettingsDialog
          open
          wide={props.wide}
          scheme={scheme()}
          appearance={appearance()}
          writeProgress={writeProgress()}
          initialPage={props.page}
        />
      </Mediates>
    </RelayMediator>
  );
};

const meta = {
  title: "設定/設定のダイアログ",
  component: Story,
  args: { wide: true, appearance: DEFAULT_APPEARANCE, page: "display" },
  argTypes: { appearance: { control: false } },
  parameters: { viewport: { defaultViewport: "responsive" } },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 表示_広い画面: S = {};

export const 表示_狭い画面: S = { args: { wide: false } };

export const 表示_自分で選んだ色: S = {
  args: { appearance: { accent: "#E0457B", ui: "#1F3B4D" } },
};

export const 表示_シアン: S = {
  args: { appearance: { accent: PALETTES.cyan.accent, ui: PALETTES.cyan.ui } },
};

export const リレー_広い画面: S = { args: { page: "relays" } };

export const リレー_狭い画面: S = { args: { page: "relays", wide: false } };
