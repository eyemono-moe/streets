import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { parseRelayInput, relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, For, Show, createSignal } from "solid-js";
import Button from "../ui/Button";

const selectedEntries = (urls: readonly RelayUrl[]): RelayListEntry[] =>
  urls.map((url) => ({ url, read: true, write: false }));

/** リレーカラムの追加と設定で共用する、購読先の選択欄。 */
const RelayColumnEditor: Component<{
  candidates: readonly RelayListEntry[];
  selected: readonly RelayUrl[];
  onChange: (selected: RelayUrl[]) => void;
}> = (props) => {
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal<string>();
  const selected = (url: RelayUrl) => props.selected.includes(url);
  const toggle = (url: RelayUrl) =>
    props.onChange(
      selected(url)
        ? props.selected.filter((item) => item !== url)
        : [...props.selected, url],
    );

  const addInput = () => {
    const result = parseRelayInput(input(), selectedEntries(props.selected));
    if (!result.ok) {
      setError(result.message);
      return;
    }
    props.onChange([...props.selected, result.url]);
    setInput("");
    setError(undefined);
  };

  return (
    <div class="flex flex-col gap-3">
      <Show when={props.candidates.length > 0}>
        <fieldset class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <legend class="c-secondary mb-1 px-1 font-600 text-caption">
            アカウントで使っているリレー
          </legend>
          <For each={props.candidates}>
            {(entry) => (
              <label class="flex cursor-pointer items-center gap-3 bg-primary px-3 py-2.5 hover:bg-secondary">
                <input
                  type="checkbox"
                  class="size-4 shrink-0 accent-accent-primary"
                  checked={selected(entry.url)}
                  onChange={() => toggle(entry.url)}
                />
                <span class="min-w-0 flex-1">
                  <span class="c-primary block truncate text-body">
                    {relayLabel(entry.url)}
                  </span>
                  <span class="c-secondary block text-caption">
                    {entry.read && entry.write
                      ? "読み書き"
                      : entry.read
                        ? "読み込み"
                        : "書き込み"}
                  </span>
                </span>
              </label>
            )}
          </For>
        </fieldset>
      </Show>

      <form
        class="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          addInput();
        }}
      >
        <label for="relay-column-url" class="c-secondary font-600 text-caption">
          URLを直接入力
        </label>
        <div class="flex gap-2">
          <input
            id="relay-column-url"
            class="c-primary min-w-0 flex-1 rounded-2 border border-primary bg-primary px-3 text-body outline-none focus:border-accent-primary"
            placeholder="wss://relay.example"
            value={input()}
            onInput={(event) => {
              setInput(event.currentTarget.value);
              setError(undefined);
            }}
          />
          <Button type="submit" size="sm" shape="rounded">
            選択に追加
          </Button>
        </div>
        <Show when={error()}>
          {(message) => <span class="c-danger text-caption">{message()}</span>}
        </Show>
      </form>

      <Show when={props.selected.length > 0}>
        <div class="flex flex-wrap gap-1.5" aria-label="選択中のリレー">
          <For each={props.selected}>
            {(url) => (
              <button
                type="button"
                class="c-primary inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full bg-secondary py-1 pr-1.5 pl-2.5 text-caption hover:bg-tertiary"
                onClick={() => toggle(url)}
                aria-label={`${relayLabel(url)}を選択から外す`}
              >
                <span class="truncate">{relayLabel(url)}</span>
                <span
                  class="i-material-symbols:close-rounded size-3.5 shrink-0"
                  aria-hidden="true"
                />
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default RelayColumnEditor;
