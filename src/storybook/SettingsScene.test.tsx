import { type Accessor, createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import type { RelayUrl } from "../core/relay/relay-connection";
import {
  type AccountSettings,
  useAccountSettings,
} from "../routes/v1/account-settings";
import {
  type DeviceSettings,
  useDeviceSettings,
} from "../routes/v1/device-settings";
import { type MuteList, useOptionalMuteList } from "../routes/v1/mute-list";
import { type SettingsScene, SettingsSceneProvider } from "./SettingsScene";

type Captured = {
  account: AccountSettings;
  device: DeviceSettings;
  mutes: MuteList | undefined;
};

const mount = (
  scene: SettingsScene | Accessor<SettingsScene>,
): { captured: () => Captured; dispose: () => void } => {
  let value: Captured | undefined;
  let disposeRoot = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    SettingsSceneProvider({
      get scene() {
        return typeof scene === "function" ? scene() : scene;
      },
      get children() {
        value = {
          account: useAccountSettings(),
          device: useDeviceSettings(),
          mutes: useOptionalMuteList(),
        };
        return null;
      },
    });
  });
  return {
    captured: () => {
      if (!value) throw new Error("SettingsScene did not mount");
      return value;
    },
    dispose: disposeRoot,
  };
};

describe("SettingsSceneProvider", () => {
  it("宣言した状態を三つの設定 context へ隠して操作可能にする", async () => {
    const firstRelay = "wss://relay.example/" as RelayUrl;
    const initialMute = {
      target: { type: "hashtag" as const, value: "spoiler" },
      visibility: "public" as const,
    };
    const { captured, dispose } = mount({
      relays: {
        phase: "ready",
        entries: [{ url: firstRelay, read: true, write: true }],
      },
      mutes: { phase: "ready", entries: [initialMute] },
      developerMode: true,
    });
    try {
      const { account, device, mutes } = captured();
      const relayList = account.relayList;
      expect(relayList.draft()).toHaveLength(1);
      expect(device.developerMode()).toBe(true);
      expect(mutes?.state().phase).toBe("ready");

      // 捕まえる変異: Story の操作を no-op にし、見た目だけの静的 fixture にする。
      expect(relayList.add("wss://second.example")).toBe(true);
      expect(relayList.draft().map((entry) => entry.url)).toContain(
        "wss://second.example/",
      );
      relayList.toggle(firstRelay, "read");
      expect(relayList.draft()[0]).toMatchObject({ read: false, write: true });
      expect(relayList.dirty()).toBe(true);
      await relayList.save();
      expect(relayList.dirty()).toBe(false);

      await mutes?.add({ type: "word", value: "ignore" }, "private");
      const muteState = mutes?.state();
      expect(
        muteState?.phase === "ready" || muteState?.phase === "missing"
          ? muteState.entries
          : [],
      ).toHaveLength(2);

      device.toggleDeveloperMode();
      expect(device.developerMode()).toBe(false);
    } finally {
      dispose();
    }
  });

  it("scene の差し替えを既に渡した context の accessor へ反映する", () => {
    const [scene, setScene] = createSignal<SettingsScene>({
      relays: { phase: "loading" },
      mutes: { phase: "loading" },
      developerMode: false,
    });
    const { captured, dispose } = mount(scene);
    try {
      const initial = captured();
      expect(initial.account.relayList.current().phase).toBe("loading");
      expect(initial.device.developerMode()).toBe(false);

      setScene({
        relays: {
          phase: "ready",
          entries: [
            {
              url: "wss://ready.example/" as RelayUrl,
              read: true,
              write: false,
            },
          ],
        },
        mutes: { phase: "ready", entries: [] },
        developerMode: true,
      });

      // 捕まえる変異: Provider 作成時の scene を一度だけ読み、Storybook args
      // を切り替えても loading や developer mode の表示を更新しない。
      expect(initial.account.relayList.current().phase).toBe("ready");
      expect(initial.account.relayList.draft()).toHaveLength(1);
      expect(initial.device.developerMode()).toBe(true);
      expect(initial.mutes?.state().phase).toBe("ready");
    } finally {
      dispose();
    }
  });

  it("mutes を省略した scene では MuteList context を作らない", () => {
    const { captured, dispose } = mount({
      relays: { phase: "signed-out" },
    });
    try {
      // 捕まえる変異: mutes の指定が無い Story にも空の MuteList を提供し、
      // 本番では存在しないミュートナビを表示させる。
      expect(captured().mutes).toBeUndefined();
    } finally {
      dispose();
    }
  });
});
