import type { DeckAppearance } from "@streets/core/deck/deck";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { ColorScheme } from "@streets/core/settings/color-scheme";
import { DEFAULT_KEYMAP } from "@streets/core/settings/keymap";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { useStoryNip05 } from "../storybook/nip05";
import { DEFAULT_APPEARANCE, PALETTES, applyColors } from "../theme";
import { Mediates } from "../ui-events";
import { MuteMediator } from "./MuteMediator";
import { ProfileMediator } from "./ProfileMediator";
import { RelayMediator } from "./RelayMediator";
import SettingsDialog from "./SettingsDialog";

type Props = {
  wide: boolean;
  appearance: DeckAppearance;
  /** 省略すると、ダイアログが決める既定のページ（アカウント）で開く。 */
  page?: string;
};

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
const STORY_VIEWER = "1".repeat(64);

/** 暗号化はせず、そのまま通す署名器。ストーリーでは非公開のミュートも読み書きできる。 */
const storySigner = {
  getPublicKey: async () => STORY_VIEWER,
  signEvent: async () => {
    throw new Error("ストーリーでは署名しません");
  },
  nip44: {
    encrypt: async (_peer: string, plaintext: string) => plaintext,
    decrypt: async (_peer: string, ciphertext: string) => ciphertext,
  },
};

const muteListEvent = (tags: string[][], content: string): NostrEvent => ({
  ...relayList(tags),
  kind: 10000,
  content,
});

const Story = (props: Props) => {
  const [scheme, setScheme] = createSignal<ColorScheme>("system");
  const [appearance, setAppearance] = createSignal(props.appearance);
  const [writeProgress, setWriteProgress] = createSignal(true);
  const [errorReport, setErrorReport] = createSignal(true);
  const [keymap, setKeymap] = createSignal(DEFAULT_KEYMAP);
  const [columnDigits, setColumnDigits] = createSignal(true);
  // リレーの一覧は、保存したらそのまま手元の版を差し替える（署名もリレーも無い）。
  const [relays, setRelays] = createSignal<NostrEvent | undefined>(
    relayList([
      ["r", "wss://relay.damus.io/"],
      ["r", "wss://nos.lol/"],
      ["r", "wss://yabu.me/", "read"],
    ]),
  );
  const [mutes, setMutes] = createSignal<NostrEvent | undefined>(
    muteListEvent(
      [["t", "spoiler"]],
      JSON.stringify([
        ["word", "ネタバレ"],
        ["e", "a".repeat(64)],
      ]),
    ),
  );
  const [profile, setProfile] = createSignal<NostrEvent | undefined>({
    ...relayList([]),
    kind: 0,
    content: JSON.stringify({
      display_name: "わたし",
      name: "me",
      about: "Nostr のクライアントを作っています。",
      nip05: "me@example.com",
      website: "https://example.com",
    }),
  });
  applyColors(props.appearance);
  useStoryNip05({
    "me@example.com": { kind: "found", pubkey: STORY_VIEWER },
  });
  return (
    <ProfileMediator
      writer={{
        replace: async (_kind, _identifier, mutation) => {
          const draft = await mutation(profile());
          const next = { ...relayList([]), kind: 0, content: draft.content };
          setProfile(next);
          return { event: next } as never;
        },
      }}
      pubkey={STORY_VIEWER}
      profile={profile}
    >
      <MuteMediator
        writer={{
          replace: async (_kind, _identifier, mutation) => {
            const draft = await mutation(mutes());
            const next = muteListEvent(draft.tags, draft.content);
            setMutes(next);
            return { event: next } as never;
          },
        }}
        signer={storySigner}
        viewer={STORY_VIEWER}
        muteList={mutes}
        settled={() => true}
      >
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
                case "deck/set-error-report":
                  setErrorReport(event.on);
                  return true;
                case "deck/set-column-digits":
                  setColumnDigits(event.on);
                  return true;
                case "deck/set-shortcut":
                  setKeymap((current) => ({
                    ...current,
                    [event.action]: event.hotkey,
                  }));
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
              errorReport={errorReport()}
              keymap={keymap()}
              columnDigits={columnDigits()}
              initialPage={props.page}
            />
          </Mediates>
        </RelayMediator>
      </MuteMediator>
    </ProfileMediator>
  );
};

const meta = {
  title: "設定/設定のダイアログ",
  component: Story,
  args: { wide: true, appearance: DEFAULT_APPEARANCE },
  argTypes: { appearance: { control: false } },
  parameters: { viewport: { defaultViewport: "responsive" } },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

/** 開いた直後。一覧の先頭（アカウント）から始まる。 */
export const 開いた直後: S = {};

export const 表示_広い画面: S = { args: { page: "display" } };

export const 表示_狭い画面: S = { args: { page: "display", wide: false } };

export const 表示_自分で選んだ色: S = {
  args: {
    page: "display",
    appearance: { accent: "#E0457B", ui: "#1F3B4D" },
  },
};

export const 表示_シアン: S = {
  args: {
    page: "display",
    appearance: { accent: PALETTES.cyan.accent, ui: PALETTES.cyan.ui },
  },
};

export const 絵文字_広い画面: S = { args: { page: "emoji" } };

export const キーボード_広い画面: S = { args: { page: "keyboard" } };

export const キーボード_狭い画面: S = {
  args: { page: "keyboard", wide: false },
};

export const リレー_広い画面: S = { args: { page: "relays" } };

export const リレー_狭い画面: S = { args: { page: "relays", wide: false } };

export const ミュート_広い画面: S = { args: { page: "mute" } };

export const ミュート_狭い画面: S = { args: { page: "mute", wide: false } };

export const アカウント_広い画面: S = { args: { page: "account" } };

export const アカウント_狭い画面: S = {
  args: { page: "account", wide: false },
};
