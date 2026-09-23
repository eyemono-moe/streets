import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { normalizeRelayUrl } from "@streets/core/relay/relay-url";
import { DEFAULT_SEARCH_RELAYS } from "@streets/core/settings/search-relay-list";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createSignal,
} from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import { textInputClass } from "../ui/TextField";
import SettingsSection from "./SettingsSection";

export type SearchSettingsViewProps = {
  relays: readonly RelayUrl[];
  saving: boolean;
  /** 自分で選んだ一覧か。false なら既定をそのまま使っている。 */
  chosen: boolean;
};

/** 検索するリレーの設定。今の一覧を受け取って描き、変えたらイベントを上へ渡す。 */
const SearchSettingsView: Component<SearchSettingsViewProps> = (props) => (
  <div class="flex flex-col gap-7">
    <SettingsSection
      title="検索するリレー"
      scope="account"
      description="言葉での検索は、検索に対応したリレー（NIP-50）へ問い合わせます。投稿を読むリレーとは別に指定できます。上から順に、すべてへ問い合わせます。"
    >
      <Show when={!props.chosen && props.relays.length > 0}>
        <p class="c-secondary rounded-2 bg-secondary p-3 text-caption">
          まだ自分で選んでいません。いまは下のリレーへ問い合わせています。外したり足したりすると、その一覧を自分の設定として保存します。
        </p>
      </Show>
      <Switch>
        <Match when={props.relays.length === 0}>
          <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
            検索するリレーがありません。このままでは言葉で検索できません。下のおすすめから足すか、URL
            を入力してください。
          </p>
        </Match>
        <Match when={props.relays.length > 0}>
          <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
            <For each={props.relays}>
              {(relay) => <RelayRow relay={relay} disabled={props.saving} />}
            </For>
          </ul>
        </Match>
      </Switch>
      <Recommended relays={props.relays} disabled={props.saving} />
      <AddRelay relays={props.relays} disabled={props.saving} />
    </SettingsSection>
  </div>
);

const RelayRow: Component<{ relay: RelayUrl; disabled: boolean }> = (props) => {
  const dispatch = useDispatch();
  return (
    <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-primary px-3 py-2.5">
      <span class="c-primary min-w-48 flex-1 break-all text-body">
        {props.relay}
      </span>
      <Button
        variant="ghost"
        size="sm"
        shape="rounded"
        icon="i-material-symbols:do-not-disturb-on-outline-rounded"
        aria-label={`${props.relay} を一覧から外す`}
        title="一覧から外す"
        disabled={props.disabled}
        onClick={() =>
          dispatch({ type: "search-relays/remove", url: props.relay })
        }
      />
    </li>
  );
};

/** 検索に対応していることが分かっているリレー。押すとその 1 つを足す。 */
const Recommended: Component<{
  relays: readonly RelayUrl[];
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const rest = () =>
    DEFAULT_SEARCH_RELAYS.filter((relay) => !props.relays.includes(relay));
  return (
    <Show when={rest().length > 0}>
      <div class="flex flex-col gap-1.5">
        <span class="c-secondary font-600 text-caption">おすすめ</span>
        <div class="flex flex-wrap gap-2">
          <For each={rest()}>
            {(relay) => (
              <Button
                variant="secondary"
                size="sm"
                icon="i-material-symbols:add-rounded"
                disabled={props.disabled}
                onClick={() =>
                  dispatch({ type: "search-relays/add", url: relay })
                }
              >
                {relay.replace(/^wss:\/\//, "").replace(/\/$/, "")}
              </Button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
};

const AddRelay: Component<{
  relays: readonly RelayUrl[];
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal<string>();

  const submit = () => {
    const text = input().trim();
    if (text === "") {
      setError("リレーの URL を入力してください");
      return;
    }
    // `wss://` を省いて打つ人が多いので補う。
    const url = normalizeRelayUrl(
      /^wss?:\/\//i.test(text) ? text : `wss://${text}`,
    );
    if (!url) {
      setError("wss:// で始まる URL を入力してください");
      return;
    }
    if (props.relays.includes(url)) {
      setError("このリレーはもう入っています");
      return;
    }
    dispatch({ type: "search-relays/add", url });
    setInput("");
    setError(undefined);
  };

  return (
    <form
      class="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div class="flex flex-wrap items-center gap-2">
        <input
          class={`${textInputClass} min-w-48 flex-1`}
          placeholder="wss://search.example"
          aria-label="足す検索リレーの URL"
          aria-invalid={error() !== undefined}
          aria-describedby={error() ? "search-relay-error" : undefined}
          value={input()}
          disabled={props.disabled}
          onInput={(event) => {
            setInput(event.currentTarget.value);
            setError(undefined);
          }}
        />
        <Button
          type="submit"
          variant="primary"
          icon="i-material-symbols:add-rounded"
          disabled={props.disabled}
        >
          追加
        </Button>
      </div>
      <Show
        when={error()}
        fallback={
          <p class="c-secondary text-caption">
            検索に対応していないリレーを入れても、そこからは結果が返りません。
          </p>
        }
      >
        {(message) => (
          <p id="search-relay-error" class="c-danger text-caption">
            {message()}
          </p>
        )}
      </Show>
    </form>
  );
};

export default SearchSettingsView;
