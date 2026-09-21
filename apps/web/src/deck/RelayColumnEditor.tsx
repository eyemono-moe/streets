import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { parseRelayInput, relayLabel } from "@streets/core/settings/relay-edit";
import {
  type Component,
  For,
  Show,
  createSignal,
  createUniqueId,
} from "solid-js";
import RelaySummary from "../settings/RelaySummary";
import Button from "../ui/Button";

const selectedEntries = (urls: readonly RelayUrl[]): RelayListEntry[] =>
  urls.map((url) => ({ url, read: true, write: false }));

/** リレーカラムの追加と設定で共用する、購読先の選択欄。 */
const RelayColumnEditor: Component<{
  candidates: readonly RelayListEntry[];
  selected: readonly RelayUrl[];
  onChange: (selected: RelayUrl[]) => void;
  minimum?: number;
}> = (props) => {
  const inputId = createUniqueId();
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal<string>();
  const selected = (url: RelayUrl) => props.selected.includes(url);
  const add = (url: RelayUrl) => {
    if (!selected(url)) props.onChange([...props.selected, url]);
  };
  const remove = (url: RelayUrl) =>
    props.onChange(props.selected.filter((item) => item !== url));

  const addInput = () => {
    const result = parseRelayInput(input(), selectedEntries(props.selected));
    if (!result.ok) {
      setError(result.message);
      return;
    }
    add(result.url);
    setInput("");
    setError(undefined);
  };

  return (
    <div class="flex flex-col gap-3">
      <Show when={props.candidates.length > 0}>
        <section>
          <h4 class="c-secondary mb-1 font-600 text-caption">
            アカウントで使っているリレー
          </h4>
          <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
            <For each={props.candidates}>
              {(entry) => (
                <li class="bg-primary">
                  <RelaySummary
                    url={entry.url}
                    subtitle={
                      <span class="c-secondary text-caption">
                        {entry.read && entry.write
                          ? "読み書き"
                          : entry.read
                            ? "読み込み"
                            : "書き込み"}
                      </span>
                    }
                    actions={
                      <Button
                        size="sm"
                        variant={selected(entry.url) ? "muted" : "secondary"}
                        disabled={selected(entry.url)}
                        onClick={() => add(entry.url)}
                      >
                        {selected(entry.url) ? "追加済み" : "追加する"}
                      </Button>
                    }
                  />
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <form
        class="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          addInput();
        }}
      >
        <label for={inputId} class="c-secondary font-600 text-caption">
          URLを直接入力
        </label>
        <div class="flex gap-2">
          <input
            id={inputId}
            class="c-primary min-w-0 flex-1 rounded-2 border border-primary bg-primary px-3 text-body outline-none focus:border-accent-primary"
            placeholder="wss://relay.example"
            value={input()}
            onInput={(event) => {
              setInput(event.currentTarget.value);
              setError(undefined);
            }}
          />
          <Button type="submit" size="sm" shape="rounded" variant="primary">
            追加する
          </Button>
        </div>
        <Show when={error()}>
          {(message) => <span class="c-danger text-caption">{message()}</span>}
        </Show>
      </form>

      <Show when={props.selected.length > 0}>
        <section>
          <h4 class="c-secondary mb-1 font-600 text-caption">追加するリレー</h4>
          <ul
            class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary"
            aria-label="追加するリレー"
          >
            <For each={props.selected}>
              {(url) => (
                <li class="bg-primary">
                  <RelaySummary
                    url={url}
                    actions={
                      <Button
                        variant="ghost"
                        size="sm"
                        shape="rounded"
                        icon="i-material-symbols:do-not-disturb-on-outline-rounded"
                        aria-label={`${relayLabel(url)}を追加対象から外す`}
                        disabled={props.selected.length <= (props.minimum ?? 0)}
                        title={
                          props.selected.length <= (props.minimum ?? 0)
                            ? "リレーを1つ以上選んでください"
                            : undefined
                        }
                        onClick={() => remove(url)}
                      />
                    }
                  />
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  );
};

export default RelayColumnEditor;
