import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import type { Mutation } from "../../../core/nostr/build/draft";
import type { NostrEvent } from "../../../core/nostr/event";
import type { RelayUrl } from "../../../core/relay/relay-connection";
import type { WriteResult } from "../../../core/write/writer";
import {
  AccountSettingsProvider,
  createAccountSettings,
} from "../account-settings";
import ProfileSettingsForm from "./ProfileSettingsForm";

const PUBKEY = "f".repeat(64);

const profileEvent = (content: string): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: PUBKEY,
  created_at: 1,
  kind: 0,
  tags: [],
  content,
  sig: "b".repeat(128),
});

describe("ProfileSettingsForm", () => {
  it("表示名と Lightning Address の入力を state に接続して送信する", async () => {
    // 捕まえる変異: input の変更を profile.change へ渡さず、画面上だけ
    // 更新して古い値を保存する。
    const [pubkey, setPubkey] = createSignal<string>();
    const replace = vi.fn(
      async (
        _kind: number,
        _identifier: string | undefined,
        _mutation: Mutation,
      ): Promise<WriteResult> => ({
        event: profileEvent("{}"),
        accepted: ["wss://one/" as RelayUrl],
        rejected: [],
      }),
    );
    const host = document.createElement("div");
    document.body.append(host);
    let settings: ReturnType<typeof createAccountSettings> | undefined;
    const dispose = render(() => {
      settings = createAccountSettings({
        pubkey,
        relayListSettled: () => true,
        store: {
          latestReplaceable: () =>
            profileEvent(
              JSON.stringify({
                display_name: "前の表示名",
                lud16: "old@lightning.example",
              }),
            ),
          onReplaceableChanged: () => () => {},
        },
        writer: { replace },
      });
      return (
        <AccountSettingsProvider value={settings}>
          <ProfileSettingsForm />
        </AccountSettingsProvider>
      );
    }, host);
    try {
      setPubkey(PUBKEY);
      if (!settings) throw new Error("設定状態を作成できませんでした");
      const displayName = host.querySelector<HTMLInputElement>(
        '[data-testid="profile-display-name"]',
      );
      const lightningAddress = host.querySelector<HTMLInputElement>(
        '[data-testid="profile-lightning-address"]',
      );
      if (!displayName || !lightningAddress) {
        throw new Error("主要入力欄を描画できませんでした");
      }
      expect(displayName.value).toBe("前の表示名");
      displayName.value = "新しい表示名";
      displayName.dispatchEvent(new Event("input", { bubbles: true }));
      lightningAddress.value = "new@lightning.example";
      lightningAddress.dispatchEvent(new Event("input", { bubbles: true }));

      expect(settings.profile.draft()).toMatchObject({
        display_name: "新しい表示名",
        lightningAddress: "new@lightning.example",
      });
      const form = host.querySelector<HTMLFormElement>("form");
      if (!form) throw new Error("プロフィールフォームを描画できませんでした");
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));

      const call = replace.mock.calls[0];
      if (!call) throw new Error("プロフィールを保存できませんでした");
      const [kind, _identifier, mutation] = call;
      expect(kind).toBe(0);
      expect(JSON.parse(mutation(undefined).content)).toMatchObject({
        display_name: "新しい表示名",
        lud16: "new@lightning.example",
      });
    } finally {
      dispose();
      host.remove();
    }
  });
});
