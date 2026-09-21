import {
  type BlossomServer,
  DEFAULT_BLOSSOM_SERVERS,
  parseServerInput,
} from "@streets/core/media/blossom";
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
import SettingsSection from "./SettingsSection";

export type MediaSettingsViewProps = {
  servers: readonly BlossomServer[];
  saving: boolean;
  /** 自分で選んだ一覧か。false なら既定をそのまま使っている。 */
  chosen: boolean;
};

/** 画像の預け先の設定。今の一覧を受け取って描き、変えたらイベントを上へ渡す。 */
const MediaSettingsView: Component<MediaSettingsViewProps> = (props) => (
  <div class="flex flex-col gap-7">
    <SettingsSection
      title="画像の預け先"
      scope="account"
      description="投稿に付ける画像を置いておくサーバーです。Nostr のリレーは画像そのものを持たないので、別の場所へ預け、その場所の URL を投稿に書きます。上から順に試し、最初に受け取ってくれたところへ預けます。"
    >
      <Show when={!props.chosen && props.servers.length > 0}>
        <p class="c-secondary rounded-2 bg-secondary p-3 text-caption">
          まだ自分で選んでいません。いまは下の預け先を、上から順に使っています。外したり足したりすると、その一覧を自分の設定として保存します。
        </p>
      </Show>
      <Switch>
        <Match when={props.servers.length === 0}>
          <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
            預け先がありません。このままでは画像を添えられません。下のおすすめから足すか、URL
            を入れてください。
          </p>
        </Match>
        <Match when={true}>
          <ul class="flex flex-col overflow-hidden rounded-2 border border-primary [&>*+*]:border-t [&>*]:border-primary">
            <For each={props.servers}>
              {(server, index) => (
                <ServerRow
                  server={server}
                  primary={index() === 0}
                  disabled={props.saving}
                />
              )}
            </For>
          </ul>
        </Match>
      </Switch>
      <Recommended servers={props.servers} disabled={props.saving} />
      <AddServer servers={props.servers} disabled={props.saving} />
    </SettingsSection>
  </div>
);

const ServerRow: Component<{
  server: BlossomServer;
  primary: boolean;
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-primary px-3 py-2.5">
      <span class="c-primary min-w-48 flex-1 break-all text-body">
        {props.server}
      </span>
      <div class="ml-auto flex items-center gap-2">
        <Show when={props.primary}>
          <span class="c-secondary text-caption">いちばん先に試す</span>
        </Show>
        {/* 一覧から外すだけで、預けたファイルは消えない（remove）。 */}
        <Button
          variant="ghost"
          size="sm"
          shape="rounded"
          icon="i-material-symbols:do-not-disturb-on-outline-rounded"
          aria-label={`${props.server} を一覧から外す`}
          title="一覧から外す"
          disabled={props.disabled}
          onClick={() =>
            dispatch({ type: "media/remove-server", url: props.server })
          }
        />
      </div>
    </li>
  );
};

/** よく使われている預け先。押すとその 1 つを足す。 */
const Recommended: Component<{
  servers: readonly BlossomServer[];
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const rest = () =>
    DEFAULT_BLOSSOM_SERVERS.filter((server) => !props.servers.includes(server));
  return (
    <Show when={rest().length > 0}>
      <div class="flex flex-col gap-1.5">
        <span class="c-secondary font-600 text-caption">おすすめ</span>
        <div class="flex flex-wrap gap-2">
          <For each={rest()}>
            {(server) => (
              <Button
                variant="secondary"
                size="sm"
                icon="i-material-symbols:add-rounded"
                disabled={props.disabled}
                onClick={() =>
                  dispatch({ type: "media/add-server", url: server })
                }
              >
                {server.replace(/^https:\/\//, "")}
              </Button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
};

const AddServer: Component<{
  servers: readonly BlossomServer[];
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [text, setText] = createSignal("");
  const [error, setError] = createSignal<string>();

  const submit = () => {
    const result = parseServerInput(text(), props.servers);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    dispatch({ type: "media/add-server", url: result.url });
    setText("");
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
      <div class="flex items-center gap-2">
        <input
          class="c-primary placeholder:c-secondary h-9 min-w-0 flex-1 rounded-2 border border-primary bg-primary px-2.5 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent-5"
          placeholder="https://"
          aria-label="足す預け先の URL"
          aria-invalid={error() !== undefined}
          aria-describedby="media-input-error"
          value={text()}
          onInput={(event) => {
            setText(event.currentTarget.value);
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
            預け先は自分で選べます。運営者や保存期間はサーバーごとに違うので、預けたものが消えても困らないものだけを置いてください。
          </p>
        }
      >
        {(message) => (
          <p id="media-input-error" class="c-danger text-caption">
            {message()}
          </p>
        )}
      </Show>
    </form>
  );
};

export default MediaSettingsView;
