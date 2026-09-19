import type { RelayStatus } from "@streets/core/read/connection-pool";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import {
  type RelayOp,
  type RelayUsage,
  parseRelayInput,
  relayLabel,
  usageOf,
  usageOp,
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
import SegmentedControl from "../ui/SegmentedControl";
import RelaySummary from "./RelaySummary";
import SettingsSection from "./SettingsSection";

export type RelaySettingsViewProps = {
  entries: readonly RelayListEntry[];
  /** 自分の一覧をまだ取りに行っている途中。 */
  loading: boolean;
  statusOf: (url: RelayUrl) => RelayStatus;
  /** その操作をしてよいか（最後の書き込み先を外す、などを止める）。 */
  allows: (op: RelayOp) => boolean;
  /** 一覧が無い人が今使っているリレー。 */
  fallback: readonly RelayUrl[];
  /** リレーが自分について答えた内容。取れていなければ undefined。 */
  infoOf?: (url: RelayUrl) => RelayInfo | undefined;
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
        description="リレーは、投稿やリアクションを預けておくサーバーです。「書き込み」にしたリレーに自分の投稿が保存され、ほかの人はそこからあなたの投稿を読みます。「読み込み」にしたリレーからは、フォローしている人の投稿や通知を取ってきます。「両方」にすると、どちらにも使います。"
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
                    info={props.infoOf?.(entry.url)}
                    loadInfo={props.infoOf === undefined}
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

// 説明の「読み込み」「書き込み」と同じ語を使う。矢印は受け取る（↓）・送る（↑）の向き。
// 雲のアイコンは「アカウントに保存」の印に使っているので、ここでは使わない。
const USAGES: { value: RelayUsage; label: string; icon: string }[] = [
  {
    value: "both",
    label: "両方",
    icon: "i-material-symbols:swap-vert-rounded",
  },
  {
    value: "read",
    label: "読み込み",
    icon: "i-material-symbols:download-rounded",
  },
  {
    value: "write",
    label: "書き込み",
    icon: "i-material-symbols:upload-rounded",
  },
];

const RelayRow: Component<{
  entry: RelayListEntry;
  status: RelayStatus;
  info: RelayInfo | undefined;
  loadInfo: boolean;
  allows: (op: RelayOp) => boolean;
  onEdit: (op: RelayOp) => void;
}> = (props) => {
  const remove = (): RelayOp => ({ type: "remove", url: props.entry.url });

  return (
    <li class="bg-primary">
      <RelaySummary
        url={props.entry.url}
        info={props.info}
        loadInfo={props.loadInfo}
        status={props.status}
        actions={
          <div class="ml-auto flex items-center gap-1">
            <SegmentedControl
              label={`${relayLabel(props.entry.url)} の使い方`}
              variant="secondary"
              value={usageOf(props.entry)}
              options={USAGES.map((usage) => ({
                ...usage,
                disabled: !props.allows(usageOp(props.entry.url, usage.value)),
                hint: "これにすると、読み込みか書き込みに使うリレーが 1 つも無くなります",
              }))}
              onChange={(usage) =>
                props.onEdit(usageOp(props.entry.url, usage))
              }
            />
            {/* 一覧から外すだけで、リレーそのものは消えない（remove）。ゴミ箱や × にしない。 */}
            <Button
              variant="ghost"
              size="sm"
              shape="rounded"
              icon="i-material-symbols:do-not-disturb-on-outline-rounded"
              aria-label={`${relayLabel(props.entry.url)} を一覧から外す`}
              disabled={!props.allows(remove())}
              title={
                props.allows(remove())
                  ? `${relayLabel(props.entry.url)} を一覧から外す`
                  : "これを外すと、読み込みか書き込みに使うリレーが 1 つも無くなります"
              }
              onClick={() => props.onEdit(remove())}
            />
          </div>
        }
      />
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
