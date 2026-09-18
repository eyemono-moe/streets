import type { RelayStatus } from "@streets/core/read/connection-pool";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type RelayOp,
  parseRelayInput,
  relayLabel,
} from "@streets/core/settings/relay-edit";
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
import ToggleChip from "../ui/ToggleChip";
import SettingsSection from "./SettingsSection";

const STATUS: Record<RelayStatus, { label: string; dot: string }> = {
  "in-use": { label: "つながっています", dot: "bg-[#188038]" },
  failing: { label: "つながりにくくなっています", dot: "bg-[#E37400]" },
  // 必要になったときだけつなぐので、つないでいないのは異常ではない。
  idle: { label: "今は使っていません", dot: "bg-ui-6" },
};

export type RelaySettingsViewProps = {
  entries: readonly RelayListEntry[];
  /** 自分の一覧をまだ取りに行っている途中。 */
  loading: boolean;
  statusOf: (url: RelayUrl) => RelayStatus;
  /** その操作をしてよいか（最後の書き込み先を外す、などを止める）。 */
  allows: (op: RelayOp) => boolean;
  /** 一覧が無い人が今使っているリレー。 */
  fallback: readonly RelayUrl[];
};

/** リレーの設定。今の一覧を受け取って描き、変えたらイベントを上へ渡す。 */
const RelaySettingsView: Component<RelaySettingsViewProps> = (props) => {
  const dispatch = useDispatch();
  const edit = (op: RelayOp) => dispatch({ type: "relays/edit", op });

  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        title="使うリレー"
        scope="account"
        description="リレーは、投稿やリアクションを預けておくサーバーです。「書き込み」にしたリレーに自分の投稿が保存され、ほかの人はそこからあなたの投稿を読みます。「読み込み」にしたリレーからは、フォローしている人の投稿や通知を取ってきます。"
      >
        <Switch>
          <Match when={props.loading}>
            <p class="c-secondary text-caption">読み込み中…</p>
          </Match>
          <Match when={props.entries.length === 0}>
            <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
              {"まだリレーを選んでいません。いまは次のリレーを使っています。"}
              <For each={props.fallback}>
                {(url) => (
                  <span class="c-primary block break-all">
                    {relayLabel(url)}
                  </span>
                )}
              </For>
            </p>
          </Match>
          <Match when={true}>
            <ul class="flex flex-col overflow-hidden rounded-2 border border-primary [&>*+*]:border-t [&>*]:border-primary">
              <For each={props.entries}>
                {(entry) => (
                  <RelayRow
                    entry={entry}
                    status={props.statusOf(entry.url)}
                    allows={props.allows}
                    onEdit={edit}
                  />
                )}
              </For>
            </ul>
          </Match>
        </Switch>
        <AddRelay
          entries={props.entries}
          onAdd={(url) => edit({ type: "add", url })}
        />
      </SettingsSection>
    </div>
  );
};

const RelayRow: Component<{
  entry: RelayListEntry;
  status: RelayStatus;
  allows: (op: RelayOp) => boolean;
  onEdit: (op: RelayOp) => void;
}> = (props) => {
  const usage = (read: boolean, write: boolean): RelayOp => ({
    type: "set-usage",
    url: props.entry.url,
    read,
    write,
  });
  const remove = (): RelayOp => ({ type: "remove", url: props.entry.url });
  // 押せない理由は 2 通り。両方切ると使わないリレーになる（それなら外す）か、
  // 最後の読み込み先・書き込み先を無くしてしまうか。
  const reason = (read: boolean, write: boolean) =>
    !read && !write
      ? "使わないなら、× で一覧から外してください"
      : "これを切ると、使うリレーが 1 つも無くなります";

  return (
    // 狭いときは、操作を URL の下へ回す。横に詰めると URL が 1 文字も見えなくなる。
    <li class="flex min-h-13 flex-wrap items-center gap-x-3 gap-y-1.5 bg-primary px-3 py-2">
      <div class="flex min-w-48 flex-1 items-center gap-3">
        <span
          class={`size-2 shrink-0 rounded-full ${STATUS[props.status].dot}`}
          aria-hidden="true"
        />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="c-primary truncate text-body">
            {relayLabel(props.entry.url)}
          </span>
          <span class="c-secondary truncate text-caption">
            {STATUS[props.status].label}
          </span>
        </div>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <ToggleChip
          label="読み込み"
          pressed={props.entry.read}
          disabled={!props.allows(usage(!props.entry.read, props.entry.write))}
          disabledReason={reason(!props.entry.read, props.entry.write)}
          onChange={(read) => props.onEdit(usage(read, props.entry.write))}
        />
        <ToggleChip
          label="書き込み"
          pressed={props.entry.write}
          disabled={!props.allows(usage(props.entry.read, !props.entry.write))}
          disabledReason={reason(props.entry.read, !props.entry.write)}
          onChange={(write) => props.onEdit(usage(props.entry.read, write))}
        />
        <Button
          variant="ghost"
          size="sm"
          shape="rounded"
          icon="i-material-symbols:close-rounded"
          aria-label={`${relayLabel(props.entry.url)} を外す`}
          disabled={!props.allows(remove())}
          title={
            props.allows(remove())
              ? undefined
              : "これを外すと、使うリレーが 1 つも無くなります"
          }
          onClick={() => props.onEdit(remove())}
        />
      </div>
    </li>
  );
};

const AddRelay: Component<{
  entries: readonly RelayListEntry[];
  onAdd: (url: RelayUrl) => void;
}> = (props) => {
  const [text, setText] = createSignal("");
  const [error, setError] = createSignal<string>();

  const submit = () => {
    const result = parseRelayInput(text(), props.entries);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    props.onAdd(result.url);
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
          placeholder="wss://"
          aria-label="足すリレーの URL"
          aria-invalid={error() !== undefined}
          aria-describedby="relay-input-error"
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
        >
          追加
        </Button>
      </div>
      <Show when={error()}>
        {(message) => (
          <p id="relay-input-error" class="c-danger text-caption">
            {message()}
          </p>
        )}
      </Show>
    </form>
  );
};

export default RelaySettingsView;
