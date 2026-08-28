import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { userEvent, within } from "storybook/test";
import type { MuteEntry } from "../../core/moderation/mute-list";
import type { RelayUrl } from "../../core/relay/relay-connection";
import {
  type SettingsScene,
  SettingsSceneProvider,
} from "../../storybook/SettingsScene";
import SettingsDialog from "./SettingsDialog";

const relays = [
  { url: "wss://relay.damus.io/" as RelayUrl, read: true, write: true },
  { url: "wss://nos.lol/" as RelayUrl, read: true, write: false },
  { url: "wss://relay.nostr.band/" as RelayUrl, read: false, write: true },
] as const;

const mutes: readonly MuteEntry[] = [
  {
    target: { type: "pubkey", value: "11".repeat(32) },
    visibility: "private",
  },
  {
    target: { type: "hashtag", value: "spoiler" },
    visibility: "public",
  },
];

const readyScene: SettingsScene = {
  relays: { phase: "ready", entries: relays },
  mutes: { phase: "ready", entries: mutes },
};

const Scene: Component<{ scene: SettingsScene }> = (props) => (
  <SettingsSceneProvider scene={props.scene}>
    <SettingsDialog onClose={() => {}} />
  </SettingsSceneProvider>
);

const meta = {
  title: "v1/Settings/SettingsDialog",
  component: Scene,
  parameters: { layout: "fullscreen" },
  args: { scene: readyScene },
} satisfies Meta<typeof Scene>;

export default meta;
type Story = StoryObj<typeof meta>;

const selectTab =
  (testId: string) => async (context: { canvasElement: HTMLElement }) => {
    const body = within(context.canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByTestId(testId));
  };

export const RelayReady: Story = {};

export const RelaySignedOut: Story = {
  args: { scene: { ...readyScene, relays: { phase: "signed-out" } } },
};

export const RelayLoading: Story = {
  args: { scene: { ...readyScene, relays: { phase: "loading" } } },
};

export const RelayMissing: Story = {
  args: { scene: { ...readyScene, relays: { phase: "missing" } } },
};

export const RelaySaving: Story = {
  args: {
    scene: {
      ...readyScene,
      relays: { phase: "ready", entries: relays, dirty: true, saving: true },
    },
  },
};

export const RelayError: Story = {
  args: {
    scene: {
      ...readyScene,
      relays: {
        phase: "ready",
        entries: relays,
        dirty: true,
        error: "リレー設定を保存できませんでした。接続を確認してください",
      },
    },
  },
};

export const MuteReady: Story = {
  play: selectTab("settings-tab-mutes"),
};

export const MutePrivateUnavailable: Story = {
  args: {
    scene: {
      ...readyScene,
      mutes: {
        phase: "ready",
        entries: mutes.filter((entry) => entry.visibility === "public"),
        privatePart: "unavailable",
      },
    },
  },
  play: selectTab("settings-tab-mutes"),
};

export const MuteLoading: Story = {
  args: { scene: { ...readyScene, mutes: { phase: "loading" } } },
  play: selectTab("settings-tab-mutes"),
};

export const MuteError: Story = {
  args: {
    scene: {
      ...readyScene,
      mutes: {
        phase: "error",
        error: "ミュートリストを取得できませんでした。接続を確認してください",
      },
    },
  },
  play: selectTab("settings-tab-mutes"),
};

export const LabDeveloperModeOff: Story = {
  play: selectTab("settings-tab-lab"),
};

export const LabDeveloperModeOn: Story = {
  args: { scene: { ...readyScene, developerMode: true } },
  play: selectTab("settings-tab-lab"),
};

export const WithoutMuteList: Story = {
  args: {
    scene: {
      relays: { phase: "ready", entries: relays },
      developerMode: false,
    },
  },
};
