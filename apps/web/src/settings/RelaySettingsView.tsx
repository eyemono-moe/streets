import { Collapsible } from "@ark-ui/solid/collapsible";
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
import Avatar from "../note/Avatar";
import UserLink from "../note/UserLink";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SegmentedControl from "../ui/SegmentedControl";
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
  /** リレーが自分について答えた内容。取れていなければ undefined。 */
  infoOf: (url: RelayUrl) => RelayInfo | undefined;
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
                    info={props.infoOf(entry.url)}
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
  allows: (op: RelayOp) => boolean;
  onEdit: (op: RelayOp) => void;
}> = (props) => {
  const remove = (): RelayOp => ({ type: "remove", url: props.entry.url });
  const label = () => relayLabel(props.entry.url);
  // 名前を名乗っていなければ、URL を名前の代わりにする。
  const name = () => props.info?.name ?? label().replace(/^wss?:\/\//, "");
  const hasDetails = () =>
    props.info?.description !== undefined ||
    props.info?.pubkey !== undefined ||
    props.info?.contact !== undefined;

  return (
    <li class="bg-primary">
      <Collapsible.Root lazyMount unmountOnExit disabled={!hasDetails()}>
        {/* 狭いときは、操作を名前の下へ回す。横に詰めると名前が 1 文字も見えなくなる。 */}
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          <Collapsible.Trigger class="group flex min-w-48 flex-1 items-start gap-3 bg-transparent p-0 text-left enabled:cursor-pointer">
            <RelayIcon info={props.info} status={props.status} />
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="c-primary flex min-w-0 items-center gap-1 text-body">
                <span class="truncate font-600">{name()}</span>
                <Show when={hasDetails()}>
                  <span
                    class="i-material-symbols:expand-more-rounded c-secondary size-4.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </Show>
              </span>
              {/* URL はリレーを見分ける唯一の手がかり。切らずに折り返す。 */}
              <span class="c-primary break-all text-caption">{label()}</span>
              <span class="c-secondary text-caption">
                {STATUS[props.status].label}
              </span>
            </div>
          </Collapsible.Trigger>
          <div class="ml-auto flex items-center gap-1">
            <SegmentedControl
              label={`${name()} の使い方`}
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
              aria-label={`${name()} を一覧から外す`}
              disabled={!props.allows(remove())}
              title={
                props.allows(remove())
                  ? `${name()} を一覧から外す`
                  : "これを外すと、読み込みか書き込みに使うリレーが 1 つも無くなります"
              }
              onClick={() => props.onEdit(remove())}
            />
          </div>
        </div>
        <Collapsible.Content class="motion-collapse">
          <RelayDetails info={props.info} />
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
};

/** リレーのアイコン。接続の様子を右下の点で重ねる。 */
const RelayIcon: Component<{
  info: RelayInfo | undefined;
  status: RelayStatus;
}> = (props) => {
  const [broken, setBroken] = createSignal(false);
  return (
    <span class="relative size-8 shrink-0">
      <Show
        when={props.info?.icon && !broken() ? props.info.icon : undefined}
        fallback={
          <span class="c-secondary grid size-full place-items-center rounded-2 bg-secondary">
            <span
              class="i-material-symbols:globe size-4.5"
              aria-hidden="true"
            />
          </span>
        }
      >
        {(icon) => (
          <img
            src={icon()}
            alt=""
            class="size-full rounded-2 bg-secondary object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        )}
      </Show>
      <span
        // 縁を行の背景と同じ色にして、アイコンから切り離して見せる。
        class={`-bottom-0.5 -right-0.5 absolute size-2.5 rounded-full border-2 border-white dark:border-ui-950 ${STATUS[props.status].dot}`}
        aria-hidden="true"
      />
    </span>
  );
};

/** リレーが自分について答えた内容。答えた項目だけを並べる。 */
const RelayDetails: Component<{ info: RelayInfo | undefined }> = (props) => (
  <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 pb-3 pl-14 text-caption">
    <Show when={props.info?.description}>
      {(description) => (
        <>
          <dt class="c-secondary">説明</dt>
          <dd class="c-primary break-anywhere line-clamp-4 whitespace-pre-wrap">
            {description()}
          </dd>
        </>
      )}
    </Show>
    <Show when={props.info?.pubkey}>
      {(pubkey) => (
        <>
          <dt class="c-secondary">管理者</dt>
          <dd class="c-primary flex min-w-0 items-center gap-1.5">
            <Avatar pubkey={pubkey()} size="tiny" />
            <UserLink pubkey={pubkey()} class="c-primary min-w-0 truncate" />
          </dd>
        </>
      )}
    </Show>
    <Show when={props.info?.contact}>
      {(contact) => (
        <>
          <dt class="c-secondary">連絡先</dt>
          <dd class="c-primary break-all">
            <Show
              when={/^(mailto:|https:\/\/)/.test(contact()) && contact()}
              fallback={contact()}
            >
              {(href) => (
                <a
                  class="text-link"
                  href={href()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {href().replace(/^mailto:/, "")}
                </a>
              )}
            </Show>
          </dd>
        </>
      )}
    </Show>
  </dl>
);

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
