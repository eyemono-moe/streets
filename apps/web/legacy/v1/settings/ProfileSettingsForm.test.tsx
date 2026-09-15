import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import type {
  AccountSettings,
  ProfileInput,
  ProfileState,
} from "../account-settings";
import { AccountSettingsProvider } from "../account-settings";
import ProfileSettingsForm from "./ProfileSettingsForm";

const PUBKEY_A = "f".repeat(64);
const PUBKEY_B = "e".repeat(64);

const emptyProfile: ProfileInput = {
  display_name: "",
  name: "",
  about: "",
  website: "",
  nip05: "",
  picture: "",
  banner: "",
  lightningAddress: "",
};

const ready = (
  pubkey: string,
  values: Partial<ProfileInput>,
): ProfileState => ({
  phase: "ready",
  pubkey,
  values: { ...emptyProfile, ...values },
});

const relayList: AccountSettings["relayList"] = {
  current: () => ({ phase: "signed-out" }),
  draft: () => [],
  dirty: () => false,
  saving: () => false,
  error: () => undefined,
  add: () => false,
  toggle: () => {},
  remove: () => {},
  reset: () => {},
  save: async () => {},
};

const renderProfileForm = (
  initial: ProfileState,
  save: AccountSettings["profile"]["save"] = async () => {},
) => {
  const [current, setCurrent] = createSignal(initial);
  const host = document.createElement("div");
  document.body.append(host);
  const settings: AccountSettings = {
    relayList,
    profile: { current, save },
  };
  const dispose = render(
    () => (
      <AccountSettingsProvider value={settings}>
        <ProfileSettingsForm />
      </AccountSettingsProvider>
    ),
    host,
  );
  return { host, setCurrent, dispose };
};

const input = (host: HTMLElement, testId: string): HTMLInputElement => {
  const element = host.querySelector<HTMLInputElement>(
    `[data-testid="${testId}"]`,
  );
  if (!element) throw new Error(`${testId} を描画できませんでした`);
  return element;
};

const edit = (element: HTMLInputElement, value: string) => {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

const button = (host: HTMLElement, label: string): HTMLButtonElement => {
  const element = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!element) throw new Error(`${label} ボタンを描画できませんでした`);
  return element;
};

const submit = (host: HTMLElement) => {
  const form = host.querySelector<HTMLFormElement>("form");
  if (!form) throw new Error("プロフィールフォームを描画できませんでした");
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
};

describe("ProfileSettingsForm", () => {
  it("編集を戻すと取得したプロフィールへ戻り、操作を再び無効にする", () => {
    // 捕まえる変異: reset の基準を取得値ではなく現在入力へ変える。
    const { host, dispose } = renderProfileForm(
      ready(PUBKEY_A, { display_name: "前の表示名" }),
    );
    try {
      const displayName = input(host, "profile-display-name");
      expect(displayName.value).toBe("前の表示名");
      expect(button(host, "保存").disabled).toBe(true);
      expect(button(host, "変更を戻す").disabled).toBe(true);

      edit(displayName, "新しい表示名");
      expect(button(host, "保存").disabled).toBe(false);
      expect(button(host, "変更を戻す").disabled).toBe(false);

      button(host, "変更を戻す").click();
      expect(displayName.value).toBe("前の表示名");
      expect(button(host, "保存").disabled).toBe(true);
      expect(button(host, "変更を戻す").disabled).toBe(true);
    } finally {
      dispose();
      host.remove();
    }
  });

  it("保存中の追加入力を残し、送信値を変更を戻す基準にする", async () => {
    // 捕まえる変異: 保存成功時に keepInput を使わず追加入力を上書きする。
    let finishSave!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const { host, dispose } = renderProfileForm(
      ready(PUBKEY_A, { name: "before" }),
      save,
    );
    try {
      const name = input(host, "profile-name");
      edit(name, "submitted");
      submit(host);

      await vi.waitFor(() =>
        expect(button(host, "保存中…").disabled).toBe(true),
      );
      await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(button(host, "変更を戻す").disabled).toBe(true);
      edit(name, "editing while saving");

      finishSave();
      await vi.waitFor(() => expect(button(host, "保存").disabled).toBe(false));
      expect(name.value).toBe("editing while saving");

      button(host, "変更を戻す").click();
      expect(name.value).toBe("submitted");
      expect(button(host, "保存").disabled).toBe(true);
      expect(save).toHaveBeenCalledWith({
        ...emptyProfile,
        name: "submitted",
      });
    } finally {
      dispose();
      host.remove();
    }
  });

  it("保存失敗をフォームに表示し、入力を再試行できる状態で残す", async () => {
    // 捕まえる変異: save の例外を Formisch の root error へ渡さない。
    const save = vi.fn(async () => {
      throw new Error("relay rejected");
    });
    const { host, dispose } = renderProfileForm(
      ready(PUBKEY_A, { name: "before" }),
      save,
    );
    try {
      const name = input(host, "profile-name");
      edit(name, "retry this");
      submit(host);

      await vi.waitFor(() =>
        expect(host.textContent).toContain("relay rejected"),
      );
      expect(name.value).toBe("retry this");
      expect(button(host, "保存").disabled).toBe(false);
      expect(button(host, "変更を戻す").disabled).toBe(false);
    } finally {
      dispose();
      host.remove();
    }
  });

  it("旧アカウントの保存完了で切替後のフォームを上書きしない", async () => {
    // 捕まえる変異: 保存開始時の pubkey を照合せず、新アカウントのフォームを reset する。
    let finishSave!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const { host, setCurrent, dispose } = renderProfileForm(
      ready(PUBKEY_A, { name: "account A" }),
      save,
    );
    try {
      const name = input(host, "profile-name");
      edit(name, "submitted by A");
      submit(host);
      await vi.waitFor(() => expect(button(host, "保存中…")).toBeTruthy());
      await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

      setCurrent(ready(PUBKEY_B, { name: "account B" }));
      expect(name.value).toBe("account B");

      finishSave();
      await vi.waitFor(() => expect(button(host, "保存")).toBeTruthy());
      expect(name.value).toBe("account B");
      expect(button(host, "保存").disabled).toBe(true);
    } finally {
      dispose();
      host.remove();
    }
  });

  it("同じアカウントの新版は未編集時だけフォームへ反映する", async () => {
    // 捕まえる変異: dirty / submitting を見ず、外部更新で編集中の入力を上書きする。
    let finishSave!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const { host, setCurrent, dispose } = renderProfileForm(
      ready(PUBKEY_A, { name: "first" }),
      save,
    );
    try {
      const name = input(host, "profile-name");
      setCurrent(ready(PUBKEY_A, { name: "remote pristine" }));
      expect(name.value).toBe("remote pristine");

      edit(name, "local edit");
      setCurrent(ready(PUBKEY_A, { name: "remote while dirty" }));
      expect(name.value).toBe("local edit");

      submit(host);
      await vi.waitFor(() => expect(button(host, "保存中…")).toBeTruthy());
      await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      setCurrent(ready(PUBKEY_A, { name: "remote while saving" }));
      expect(name.value).toBe("local edit");

      finishSave();
      await vi.waitFor(() => expect(button(host, "保存")).toBeTruthy());
    } finally {
      dispose();
      host.remove();
    }
  });
});
