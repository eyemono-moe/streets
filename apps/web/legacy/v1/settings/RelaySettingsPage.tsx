import { type Component, For, Show, createSignal } from "solid-js";
import Button from "../../../shared/components/UI/Button";
import { useAccountSettings } from "../account-settings";
import { SettingsDeleteIcon } from "./SettingsIcons";
import SettingsPage from "./SettingsPage";
import SettingsSegmentedControl from "./SettingsSegmentedControl";
import SettingsTextField from "./SettingsTextField";

const relayDirections = [
  { value: "read", label: "read", testId: "relay-read-toggle" },
  { value: "write", label: "write", testId: "relay-write-toggle" },
] as const;

const RelaySettingsPage: Component = () => {
  const relays = useAccountSettings().relayList;
  const [newRelay, setNewRelay] = createSignal("");

  const addRelay = () => {
    if (relays.add(newRelay())) setNewRelay("");
  };

  return (
    <SettingsPage
      title="リレー設定"
      description="投稿の読み取り先と書き込み先をアカウントへ保存します。"
    >
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
          <SettingsTextField
            rootClass="min-w-0 flex-1"
            label="追加するリレー URL"
            data-testid="relay-url-input"
            disabled={relays.saving()}
            placeholder="wss://relay.example"
            spellcheck={false}
            value={newRelay()}
            onInput={(event) => setNewRelay(event.currentTarget.value)}
          />
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
                  <SettingsSegmentedControl
                    ariaLabel={`${entry.url} の用途`}
                    compact
                    disabled={relays.saving()}
                    multiple
                    options={relayDirections}
                    value={[
                      ...(entry.read ? ["read"] : []),
                      ...(entry.write ? ["write"] : []),
                    ]}
                    onValueChange={(value) => {
                      if (value.includes("read") !== entry.read) {
                        relays.toggle(entry.url, "read");
                      }
                      if (value.includes("write") !== entry.write) {
                        relays.toggle(entry.url, "write");
                      }
                    }}
                  />
                  <button
                    aria-label={`${entry.url} を削除`}
                    class="grid h-8 w-8 appearance-none place-items-center rounded-full bg-transparent text-red-7 enabled:cursor-pointer enabled:hover:bg-red-4/15 dark:text-red-4"
                    data-testid="relay-remove"
                    disabled={relays.saving()}
                    type="button"
                    onClick={() => relays.remove(entry.url)}
                  >
                    <SettingsDeleteIcon class="h-5 w-5" />
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
    </SettingsPage>
  );
};

export default RelaySettingsPage;
