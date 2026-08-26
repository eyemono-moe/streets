import { Dialog } from "@ark-ui/solid/dialog";
import { Tabs } from "@ark-ui/solid/tabs";
import { ToggleGroup } from "@ark-ui/solid/toggle-group";
import { type Component, For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import {
  type MuteVisibility,
  parseMuteTarget,
} from "../../core/moderation/mute-list";
import type { MuteTarget } from "../../core/nostr/build/mute";
import { encodeBech32 } from "../../core/nostr/nip19";
import Button from "../../shared/components/UI/Button";
import { useAccountSettings } from "./account-settings";
import { useDeviceSettings } from "./device-settings";
import { useOptionalMuteList } from "./mute-list";

type SettingsDialogProps = {
  onClose(): void;
};

const navigationClass =
  "w-full rounded-2 px-3 py-2 text-left text-body enabled:cursor-pointer data-[selected]:bg-primary data-[selected]:font-700 enabled:hover:bg-alpha-hover";

/**
 * Penpot の Settings ボードを骨格の一次情報とする。設定値の取得・draft・
 * 保存は AccountSettings context に閉じ、Dialog は表示と入力だけを担う。
 */
const SettingsDialog: Component<SettingsDialogProps> = (props) => {
  const account = useAccountSettings();
  const device = useDeviceSettings();
  const muteList = useOptionalMuteList();
  const relays = account.relayList;
  const [newRelay, setNewRelay] = createSignal("");
  const [muteType, setMuteType] = createSignal<MuteTarget["type"]>("pubkey");
  const [muteValue, setMuteValue] = createSignal("");
  const [muteVisibility, setMuteVisibility] =
    createSignal<MuteVisibility>("private");
  const [muteInputError, setMuteInputError] = createSignal<string>();

  const addRelay = () => {
    if (relays.add(newRelay())) setNewRelay("");
  };

  const addMute = async () => {
    if (!muteList) return;
    const target = parseMuteTarget(muteType(), muteValue());
    if (!target) {
      setMuteInputError("入力形式を確認してください");
      return;
    }
    setMuteInputError(undefined);
    try {
      await muteList.add(target, muteVisibility());
      setMuteValue("");
    } catch {
      // 詳細は MuteList の error に集約し、入力値は再試行のため残す。
    }
  };

  const muteLabel = (target: MuteTarget): string => {
    if (target.type === "pubkey") return encodeBech32("npub", target.value);
    if (target.type === "thread") return encodeBech32("note", target.value);
    if (target.type === "hashtag") return `#${target.value}`;
    return target.value;
  };

  const muteTypeLabel: Record<MuteTarget["type"], string> = {
    pubkey: "著者",
    thread: "スレッド",
    hashtag: "ハッシュタグ",
    word: "単語",
  };
  const editableMuteState = () => {
    const state = muteList?.state();
    return state?.phase === "ready" || state?.phase === "missing"
      ? state
      : undefined;
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(details) => {
        if (!details.open) props.onClose();
      }}
    >
      <Portal>
        <Dialog.Backdrop
          class="fixed inset-0 z-40 bg-ui-950/55"
          data-testid="settings-backdrop"
        />
        <Dialog.Positioner class="fixed inset-0 z-50 grid place-items-center p-6">
          <Dialog.Content
            class="relative h-[min(640px,calc(100dvh-48px))] w-[min(880px,calc(100vw-48px))] overflow-hidden rounded-3 border border-primary bg-primary shadow-ui/30 shadow-xl outline-none"
            data-testid="settings-dialog"
          >
            <Dialog.Title class="sr-only">設定</Dialog.Title>
            <Dialog.Description class="sr-only">
              アカウントと端末の設定を変更します。
            </Dialog.Description>
            <Tabs.Root
              class="grid h-full grid-cols-[220px_minmax(0,1fr)]"
              defaultValue="relays"
              orientation="vertical"
            >
              <aside class="flex min-h-0 flex-col bg-secondary px-2 py-3">
                <div class="flex h-13 items-center gap-2 px-3">
                  <div class="i-streets:logo h-7 w-7" aria-hidden="true" />
                  <span class="font-700 text-h3">設定</span>
                </div>
                <Tabs.List class="flex flex-col gap-1 pt-2">
                  <Tabs.Trigger
                    class={navigationClass}
                    data-testid="settings-tab-relays"
                    value="relays"
                  >
                    リレー
                  </Tabs.Trigger>
                  <Show when={muteList}>
                    <Tabs.Trigger
                      class={navigationClass}
                      data-testid="settings-tab-mutes"
                      value="mutes"
                    >
                      ミュート
                    </Tabs.Trigger>
                  </Show>
                  <Tabs.Trigger
                    class={navigationClass}
                    data-testid="settings-tab-lab"
                    value="lab"
                  >
                    ラボ
                  </Tabs.Trigger>
                </Tabs.List>
              </aside>

              <main class="min-h-0 overflow-y-auto p-6">
                <Dialog.CloseTrigger
                  aria-label="設定を閉じる"
                  class="absolute top-4 right-4 grid h-9 w-9 appearance-none place-items-center rounded-full bg-transparent enabled:cursor-pointer enabled:hover:bg-alpha-hover"
                  data-testid="settings-close"
                >
                  <div
                    class="i-material-symbols:close-rounded h-6 w-6"
                    aria-hidden="true"
                  />
                </Dialog.CloseTrigger>

                <Tabs.Content value="relays">
                  <div class="pr-10">
                    <h2 class="font-700 text-h3">リレー設定</h2>
                    <p class="c-secondary mt-1 text-caption">
                      投稿の読み取り先と書き込み先をアカウントへ保存します。
                    </p>
                  </div>

                  <Show when={relays.current().phase === "signed-out"}>
                    <p class="c-secondary mt-5 rounded-2 bg-secondary p-3 text-body">
                      リレー設定を変更するにはログインしてください。
                    </p>
                  </Show>
                  <Show when={relays.current().phase === "loading"}>
                    <p
                      class="c-secondary mt-5 rounded-2 bg-secondary p-3 text-body"
                      data-testid="relay-settings-loading"
                    >
                      リレー設定を取得しています…
                    </p>
                  </Show>

                  <Show
                    when={
                      relays.current().phase === "missing" ||
                      relays.current().phase === "ready"
                    }
                  >
                    <form
                      class="mt-5 flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addRelay();
                      }}
                    >
                      <label class="min-w-0 flex-1">
                        <span class="sr-only">追加するリレー URL</span>
                        <input
                          class="h-9 w-full rounded-2 border border-primary bg-secondary px-3 text-body outline-none focus:border-accent-5"
                          data-testid="relay-url-input"
                          disabled={relays.saving()}
                          placeholder="wss://relay.example"
                          spellcheck={false}
                          value={newRelay()}
                          onInput={(event) =>
                            setNewRelay(event.currentTarget.value)
                          }
                        />
                      </label>
                      <Button
                        data-testid="relay-add"
                        type="submit"
                        disabled={relays.saving() || newRelay().trim() === ""}
                      >
                        追加
                      </Button>
                    </form>

                    <Show when={relays.current().phase === "missing"}>
                      <p class="mt-3 rounded-2 border border-yellow-6 bg-yellow-4/10 p-3 text-caption">
                        {
                          "NIP-65 リレーリストがまだありません。追加後に保存すると作成されます。"
                        }
                      </p>
                    </Show>

                    <div
                      class="mt-5 overflow-hidden rounded-2 border border-primary"
                      data-testid="relay-settings-list"
                    >
                      <Show
                        when={relays.draft().length > 0}
                        fallback={
                          <p class="c-secondary p-4 text-center text-caption">
                            リレーを追加してください
                          </p>
                        }
                      >
                        <For each={relays.draft()}>
                          {(entry) => (
                            <div class="flex min-h-13 items-center gap-3 border-primary border-b px-3 py-2 last:border-b-0">
                              <span class="min-w-0 flex-1 truncate text-body">
                                {entry.url}
                              </span>
                              <ToggleGroup.Root
                                aria-label={`${entry.url} の用途`}
                                class="flex overflow-hidden rounded-2 border border-primary"
                                disabled={relays.saving()}
                                multiple
                                value={[
                                  ...(entry.read ? ["read"] : []),
                                  ...(entry.write ? ["write"] : []),
                                ]}
                                onValueChange={(details) => {
                                  if (
                                    details.value.includes("read") !==
                                    entry.read
                                  ) {
                                    relays.toggle(entry.url, "read");
                                  }
                                  if (
                                    details.value.includes("write") !==
                                    entry.write
                                  ) {
                                    relays.toggle(entry.url, "write");
                                  }
                                }}
                              >
                                <ToggleGroup.Item
                                  class="h-8 appearance-none px-3 text-caption enabled:cursor-pointer enabled:hover:bg-alpha-hover data-[state=on]:bg-accent-primary data-[state=on]:text-white"
                                  data-testid="relay-read-toggle"
                                  value="read"
                                >
                                  read
                                </ToggleGroup.Item>
                                <ToggleGroup.Item
                                  class="h-8 appearance-none border-primary border-l px-3 text-caption enabled:cursor-pointer enabled:hover:bg-alpha-hover data-[state=on]:bg-accent-primary data-[state=on]:text-white"
                                  data-testid="relay-write-toggle"
                                  value="write"
                                >
                                  write
                                </ToggleGroup.Item>
                              </ToggleGroup.Root>
                              <button
                                aria-label={`${entry.url} を削除`}
                                class="grid h-8 w-8 appearance-none place-items-center rounded-full bg-transparent text-red-7 enabled:cursor-pointer enabled:hover:bg-red-4/15 dark:text-red-4"
                                data-testid="relay-remove"
                                disabled={relays.saving()}
                                type="button"
                                onClick={() => relays.remove(entry.url)}
                              >
                                <span
                                  class="i-material-symbols:delete-outline-rounded h-5 w-5"
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          )}
                        </For>
                      </Show>
                    </div>

                    <Show when={relays.error()}>
                      {(message) => (
                        <p
                          class="mt-3 text-caption text-red-8 dark:text-red-4"
                          data-testid="relay-settings-error"
                        >
                          {message()}
                        </p>
                      )}
                    </Show>

                    <div class="mt-5 flex justify-end gap-2">
                      <Button
                        data-testid="relay-reset"
                        variant="border"
                        disabled={!relays.dirty() || relays.saving()}
                        onClick={relays.reset}
                      >
                        変更を戻す
                      </Button>
                      <Button
                        data-testid="relay-save"
                        disabled={!relays.dirty() || relays.saving()}
                        onClick={() => void relays.save()}
                      >
                        {relays.saving() ? "保存中…" : "保存"}
                      </Button>
                    </div>
                  </Show>
                </Tabs.Content>

                <Show when={muteList}>
                  {(mutes) => (
                    <Tabs.Content value="mutes">
                      <div class="pr-10">
                        <h2 class="font-700 text-h3">ミュート設定</h2>
                        <p class="c-secondary mt-1 text-caption">
                          表示しない著者、スレッド、ハッシュタグ、単語をアカウントへ保存します。
                        </p>
                      </div>

                      <Show when={mutes().state().phase === "loading"}>
                        <p class="c-secondary mt-5 rounded-2 bg-secondary p-3 text-body">
                          ミュートリストを取得しています…
                        </p>
                      </Show>
                      <Show when={mutes().state().phase === "error"}>
                        <div class="mt-5 flex items-center justify-between gap-3 rounded-2 border border-red-6 bg-red-4/10 p-3 text-caption text-red-8">
                          <p>{mutes().error()}</p>
                          <Button
                            variant="border"
                            data-testid="mute-refresh"
                            onClick={() => void mutes().refresh()}
                          >
                            再試行
                          </Button>
                        </div>
                      </Show>

                      <Show
                        when={
                          mutes().state().phase === "missing" ||
                          mutes().state().phase === "ready"
                        }
                      >
                        <form
                          class="mt-5 space-y-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void addMute();
                          }}
                        >
                          <ToggleGroup.Root
                            aria-label="ミュート対象の種類"
                            class="grid grid-cols-4 overflow-hidden rounded-2 border border-primary"
                            value={[muteType()]}
                            onValueChange={(details) => {
                              const next = details.value[0] as
                                | MuteTarget["type"]
                                | undefined;
                              if (next) setMuteType(next);
                            }}
                          >
                            <For
                              each={
                                ["pubkey", "thread", "hashtag", "word"] as const
                              }
                            >
                              {(type) => (
                                <ToggleGroup.Item
                                  class="h-9 border-primary border-r text-caption last:border-r-0 enabled:cursor-pointer enabled:hover:bg-alpha-hover data-[state=on]:bg-accent-primary data-[state=on]:text-white"
                                  value={type}
                                  data-testid={`mute-type-${type}`}
                                >
                                  {muteTypeLabel[type]}
                                </ToggleGroup.Item>
                              )}
                            </For>
                          </ToggleGroup.Root>

                          <div class="flex gap-2">
                            <label class="min-w-0 flex-1">
                              <span class="sr-only">ミュートする値</span>
                              <input
                                class="h-9 w-full rounded-2 border border-primary bg-secondary px-3 text-body outline-none focus:border-accent-5"
                                data-testid="mute-value-input"
                                disabled={mutes().saving()}
                                placeholder={
                                  muteType() === "pubkey"
                                    ? "npub1... または hex"
                                    : muteType() === "thread"
                                      ? "note1... または hex"
                                      : muteType() === "hashtag"
                                        ? "nostr"
                                        : "表示しない単語"
                                }
                                value={muteValue()}
                                onInput={(event) =>
                                  setMuteValue(event.currentTarget.value)
                                }
                              />
                            </label>
                            <ToggleGroup.Root
                              aria-label="公開範囲"
                              class="flex overflow-hidden rounded-2 border border-primary"
                              value={[muteVisibility()]}
                              onValueChange={(details) => {
                                const next = details.value[0] as
                                  | MuteVisibility
                                  | undefined;
                                if (next) setMuteVisibility(next);
                              }}
                            >
                              <ToggleGroup.Item
                                class="h-9 px-3 text-caption enabled:cursor-pointer enabled:hover:bg-alpha-hover data-[state=on]:bg-accent-primary data-[state=on]:text-white"
                                value="private"
                              >
                                非公開
                              </ToggleGroup.Item>
                              <ToggleGroup.Item
                                class="h-9 border-primary border-l px-3 text-caption enabled:cursor-pointer enabled:hover:bg-alpha-hover data-[state=on]:bg-accent-primary data-[state=on]:text-white"
                                value="public"
                              >
                                公開
                              </ToggleGroup.Item>
                            </ToggleGroup.Root>
                            <Button
                              data-testid="mute-add"
                              type="submit"
                              disabled={
                                mutes().saving() || muteValue().trim() === ""
                              }
                            >
                              追加
                            </Button>
                          </div>
                        </form>

                        <Show when={muteInputError()}>
                          {(message) => (
                            <p class="mt-2 text-caption text-red-8">
                              {message()}
                            </p>
                          )}
                        </Show>

                        <Show
                          when={editableMuteState()?.privatePart !== "ready"}
                        >
                          <p class="mt-3 rounded-2 border border-yellow-6 bg-yellow-4/10 p-3 text-caption">
                            非公開項目を読み取れません。対応署名器の権限を確認してください。公開項目は引き続き編集できます。
                          </p>
                        </Show>

                        <div
                          class="mt-5 overflow-hidden rounded-2 border border-primary"
                          data-testid="mute-settings-list"
                        >
                          <Show
                            when={
                              (editableMuteState()?.entries.length ?? 0) > 0
                            }
                            fallback={
                              <p class="c-secondary p-4 text-center text-caption">
                                ミュート項目はありません
                              </p>
                            }
                          >
                            <For each={editableMuteState()?.entries ?? []}>
                              {(entry) => (
                                <div
                                  class="flex min-h-13 items-center gap-3 border-primary border-b px-3 py-2 last:border-b-0"
                                  data-testid="mute-settings-row"
                                >
                                  <span class="c-secondary w-20 shrink-0 text-caption">
                                    {muteTypeLabel[entry.target.type]}
                                  </span>
                                  <span class="min-w-0 flex-1 truncate text-body">
                                    {muteLabel(entry.target)}
                                  </span>
                                  <ToggleGroup.Root
                                    aria-label={`${muteLabel(entry.target)} の公開範囲`}
                                    class="flex overflow-hidden rounded-2 border border-primary"
                                    disabled={mutes().saving()}
                                    value={[entry.visibility]}
                                    onValueChange={(details) => {
                                      const next = details.value[0] as
                                        | MuteVisibility
                                        | undefined;
                                      if (next && next !== entry.visibility) {
                                        void mutes().move(entry, next);
                                      }
                                    }}
                                  >
                                    <ToggleGroup.Item
                                      class="h-8 px-3 text-caption enabled:cursor-pointer enabled:hover:bg-alpha-hover data-[state=on]:bg-accent-primary data-[state=on]:text-white"
                                      value="private"
                                      data-testid="mute-private-toggle"
                                    >
                                      非公開
                                    </ToggleGroup.Item>
                                    <ToggleGroup.Item
                                      class="h-8 border-primary border-l px-3 text-caption enabled:cursor-pointer enabled:hover:bg-alpha-hover data-[state=on]:bg-accent-primary data-[state=on]:text-white"
                                      value="public"
                                      data-testid="mute-public-toggle"
                                    >
                                      公開
                                    </ToggleGroup.Item>
                                  </ToggleGroup.Root>
                                  <button
                                    aria-label={`${muteLabel(entry.target)} を削除`}
                                    class="grid h-8 w-8 appearance-none place-items-center rounded-full bg-transparent text-red-7 enabled:cursor-pointer enabled:hover:bg-red-4/15"
                                    disabled={mutes().saving()}
                                    type="button"
                                    data-testid="mute-remove"
                                    onClick={() => void mutes().remove(entry)}
                                  >
                                    <span class="i-material-symbols:delete-outline-rounded h-5 w-5" />
                                  </button>
                                </div>
                              )}
                            </For>
                          </Show>
                        </div>

                        <Show when={mutes().error()}>
                          {(message) => (
                            <p class="mt-3 text-caption text-red-8">
                              {message()}
                            </p>
                          )}
                        </Show>
                      </Show>
                    </Tabs.Content>
                  )}
                </Show>

                <Tabs.Content value="lab">
                  <div class="pr-10">
                    <h2 class="font-700 text-h3">ラボ</h2>
                    <p class="c-secondary mt-1 text-caption">
                      この端末だけに保存する実験的な設定です。
                    </p>
                  </div>
                  <div class="mt-5 flex min-h-13 items-center justify-between gap-3 rounded-2 border border-primary px-3 py-2">
                    <div>
                      <h3 class="font-700 text-body">開発者モード</h3>
                      <p class="c-secondary mt-1 text-caption">
                        接続数や読み取り時間などの診断値をデッキに表示します。
                      </p>
                    </div>
                    <Button
                      aria-pressed={device.developerMode()}
                      data-testid="developer-mode-toggle"
                      variant="border"
                      onClick={device.toggleDeveloperMode}
                    >
                      {device.developerMode() ? "ON" : "OFF"}
                    </Button>
                  </div>
                </Tabs.Content>
              </main>
            </Tabs.Root>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export default SettingsDialog;
