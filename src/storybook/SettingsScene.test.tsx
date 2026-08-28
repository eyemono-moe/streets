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

  it("リレーをすべて削除したdraftは保存せず、本番と同じerrorを残す", async () => {
    const relay = "wss://relay.example/" as RelayUrl;
    const { captured, dispose } = mount({
      relays: {
        phase: "ready",
        entries: [{ url: relay, read: true, write: true }],
      },
    });
    try {
      const settings = captured().account.relayList;
      settings.remove(relay);
      expect(settings.draft()).toHaveLength(0);

      // 捕まえる変異: Story adapterだけリレー0件の保存を成功扱いにする。
      await settings.save();
      expect(settings.dirty()).toBe(true);
      expect(settings.error()).toBe("リレーを 1 件以上追加してください");
    } finally {
      dispose();
    }
  });

  it("非公開部分を利用できないsceneではprivateへの変更をrejectする", async () => {
    const publicEntry = {
      target: { type: "hashtag" as const, value: "spoiler" },
      visibility: "public" as const,
    };
    const privateEntry = {
      target: { type: "word" as const, value: "secret" },
      visibility: "private" as const,
    };
    const { captured, dispose } = mount({
      relays: { phase: "signed-out" },
      mutes: {
        phase: "ready",
        entries: [publicEntry, privateEntry],
        privatePart: "unavailable",
      },
    });
    try {
      const mutes = captured().mutes;
      if (!mutes) throw new Error("MuteList context is missing");

      // 捕まえる変異: privatePart が unavailable でも private を触る操作を成功させる。
      await expect(
        mutes.add({ type: "word", value: "ignore" }, "private"),
      ).rejects.toThrow("signer cannot access private mute items");
      await expect(mutes.move(publicEntry, "private")).rejects.toThrow(
        "signer cannot access private mute items",
      );
      await expect(mutes.remove(privateEntry)).rejects.toThrow(
        "signer cannot access private mute items",
      );
      await expect(mutes.move(privateEntry, "public")).rejects.toThrow(
        "signer cannot access private mute items",
      );
      const state = mutes.state();
      expect(
        state.phase === "ready" || state.phase === "missing"
          ? state.entries
          : [],
      ).toEqual([publicEntry, privateEntry]);
      expect(mutes.error()).toBe(
        "非公開ミュートには NIP-44 対応と署名器の権限が必要です",
      );
    } finally {
      dispose();
    }
  });

  it("復号不能なprivateへの変更は本番と同じinvalid errorにする", async () => {
    const { captured, dispose } = mount({
      relays: { phase: "signed-out" },
      mutes: {
        phase: "ready",
        entries: [],
        privatePart: "invalid",
      },
    });
    try {
      const mutes = captured().mutes;
      if (!mutes) throw new Error("MuteList context is missing");

      // 捕まえる変異: invalid を unavailable と同じ権限エラーで報告する。
      await expect(
        mutes.add({ type: "word", value: "secret" }, "private"),
      ).rejects.toThrow("private mute items could not be decoded");
      expect(mutes.error()).toBe(
        "ミュートを保存できませんでした: private mute items could not be decoded",
      );
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
