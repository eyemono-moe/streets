import { Combobox, createListCollection } from "@ark-ui/solid/combobox";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { parseRelayInput, relayLabel } from "@streets/core/settings/relay-edit";
import {
  type RelaySuggestion,
  relaySuggestions,
} from "@streets/core/settings/relay-suggestions";
import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import Button from "../ui/Button";
import { textInputClass } from "../ui/TextField";

const GROUP_LABEL: Record<RelaySuggestion["group"], string> = {
  account: "アカウントで使っているリレー",
  followees: "フォローしている人が使っているリレー",
};

/**
 * リレーを 1 つ足す欄。焦点を当てると、自分のリレーとフォローしている人が使って
 * いるリレーを候補に出し、打った文字で絞る。候補に無い URL もそのまま足せる
 * （Enter か「追加する」）。
 */
const RelayInput: Component<{
  account: readonly RelayListEntry[];
  followeeWriteRelays: readonly (readonly RelayUrl[])[];
  selected: readonly RelayUrl[];
  onAdd: (url: RelayUrl) => void;
}> = (props) => {
  const [query, setQuery] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [highlighted, setHighlighted] = createSignal<string | null>(null);
  const items = createMemo(() =>
    relaySuggestions({
      account: props.account,
      followeeWriteRelays: props.followeeWriteRelays,
      selected: props.selected,
      query: query(),
    }),
  );
  const collection = createMemo(() =>
    createListCollection({
      items: items(),
      itemToValue: (item) => item.url,
      itemToString: (item) => item.url,
      isItemDisabled: (item) => item.added,
      groupBy: (item) => item.group,
    }),
  );

  const add = (url: RelayUrl) => {
    props.onAdd(url);
    setQuery("");
    setError(undefined);
  };
  const addTyped = () => {
    const result = parseRelayInput(
      query(),
      props.selected.map((url) => ({ url, read: true, write: true })),
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    add(result.url);
  };

  return (
    <Combobox.Root
      collection={collection()}
      inputValue={query()}
      onInputValueChange={(details) => {
        setQuery(details.inputValue);
        setError(undefined);
      }}
      onHighlightChange={(details) => setHighlighted(details.highlightedValue)}
      onValueChange={(details) => {
        const url = details.value[0];
        if (url) add(url);
      }}
      openOnClick
      allowCustomValue
      inputBehavior="none"
      selectionBehavior="clear"
      lazyMount
      unmountOnExit
      positioning={{ sameWidth: true }}
      class="flex flex-col gap-1.5"
    >
      <Combobox.Label class="c-secondary font-600 text-caption">
        リレーを足す
      </Combobox.Label>
      <Combobox.Control class="flex gap-2">
        <Combobox.Input
          class={`${textInputClass} min-w-0 flex-1`}
          placeholder="URL を入れるか、候補から選ぶ"
          onKeyDown={(event) => {
            // 候補を選んでいるときの Enter は Combobox に任せる（その候補を足す）。
            if (
              event.key === "Enter" &&
              !event.isComposing &&
              highlighted() === null
            ) {
              event.preventDefault();
              addTyped();
            }
          }}
        />
        <Button size="sm" shape="rounded" variant="primary" onClick={addTyped}>
          追加する
        </Button>
      </Combobox.Control>
      <Show when={error()}>
        {(message) => <span class="c-danger text-caption">{message()}</span>}
      </Show>
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content class="motion-pop max-h-80 overflow-y-auto rounded-2 border border-primary bg-primary p-1.5 shadow-lg outline-none empty:hidden">
            <For each={collection().group()}>
              {([group, groupItems]) => (
                <Combobox.ItemGroup>
                  <Combobox.ItemGroupLabel class="c-secondary block px-2.5 pt-2 pb-0.5 font-600 text-caption">
                    {GROUP_LABEL[group as RelaySuggestion["group"]]}
                  </Combobox.ItemGroupLabel>
                  <For each={groupItems}>
                    {(item) => (
                      <Combobox.Item
                        item={item}
                        class="flex cursor-pointer items-center gap-2.5 rounded-1.5 px-2.5 py-1.5 data-[disabled]:cursor-default data-[highlighted]:bg-secondary"
                      >
                        <span
                          class="i-material-symbols:language c-secondary size-4 shrink-0"
                          aria-hidden="true"
                        />
                        <Combobox.ItemText class="c-primary min-w-0 flex-1 truncate text-body">
                          {relayLabel(item.url)}
                        </Combobox.ItemText>
                        <span class="c-secondary shrink-0 text-caption">
                          {item.detail}
                        </span>
                        <Show when={item.added}>
                          <span
                            class="i-material-symbols:check-rounded c-accent-5 size-4 shrink-0"
                            aria-label="追加済み"
                          />
                        </Show>
                      </Combobox.Item>
                    )}
                  </For>
                </Combobox.ItemGroup>
              )}
            </For>
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
};

export default RelayInput;
