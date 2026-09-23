import { buildThreadColumn } from "@streets/core/deck/column-presets";
import type {
  DecodedMuteList,
  MuteEntry,
  MuteVisibility,
} from "@streets/core/moderation/mute-list";
import { parseMuteTarget } from "@streets/core/moderation/mute-list";
import type { MuteTarget } from "@streets/core/nostr/build/mute";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createSignal,
} from "solid-js";
import { useUserCandidates, userSource } from "../completion/sources";
import Avatar from "../note/Avatar";
import UserLink from "../note/UserLink";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import Completion from "../ui/Completion";
import SegmentedControl from "../ui/SegmentedControl";
import { textInputClass } from "../ui/TextField";
import SettingsSection from "./SettingsSection";

type TargetType = MuteTarget["type"];

const TYPES: {
  value: TargetType;
  label: string;
  placeholder: string;
  invalid: string;
}[] = [
  {
    value: "pubkey",
    label: "ユーザー",
    placeholder: "npub1… または nprofile1…",
    invalid: "npub1… か nprofile1… で始まる、ユーザーの ID を入力してください",
  },
  {
    value: "thread",
    label: "イベント",
    placeholder: "note1… または nevent1…",
    invalid: "note1… か nevent1… で始まる、イベントの ID を入力してください",
  },
  {
    value: "hashtag",
    label: "ハッシュタグ",
    placeholder: "# は付けなくてもかまいません",
    invalid: "ハッシュタグを入力してください",
  },
  {
    value: "word",
    label: "単語",
    placeholder: "隠したい言葉",
    invalid: "単語を入力してください",
  },
];

const labelOf = (type: TargetType) =>
  TYPES.find((entry) => entry.value === type)?.label ?? "";

const VISIBILITY_HINT: Record<MuteVisibility, string> = {
  private:
    "非公開：暗号化して保存するので、ミュートしていることはほかの人には分かりません。",
  public: "公開：ミュートしていることを、ほかの人も見られます。",
};

/** 長い ID は頭と尻尾だけ見せる。見分けるにはそれで足りる。 */
const shortId = (id: string) =>
  id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;

export type MuteSettingsViewProps = {
  entries: readonly MuteEntry[];
  loading: boolean;
  /** 非公開の項目を読み書きできるか。 */
  privatePart: DecodedMuteList["privatePart"] | undefined;
};

/** ミュートの設定。今の一覧を受け取って描き、変えたらイベントを上へ渡す。 */
const MuteSettingsView: Component<MuteSettingsViewProps> = (props) => {
  const privateReady = () => props.privatePart === "ready";

  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        title="ミュートを足す"
        scope="account"
        description="見たくない人・イベント・ハッシュタグ・単語を、ホームや通知、検索から隠します。人のページやスレッドを自分で開いたときは隠しません。"
      >
        <Show when={props.privatePart === "unavailable"}>
          <p class="c-secondary rounded-2 bg-secondary p-3 text-caption">
            今のログインの方法では非公開のミュートを扱えないため、公開のミュートだけを表示しています。
          </p>
        </Show>
        <Show when={props.privatePart === "invalid"}>
          <p class="c-danger rounded-2 bg-danger-subtle p-3 text-caption">
            非公開のミュートを読み取れませんでした。公開のミュートだけを表示しています。
          </p>
        </Show>
        <AddMute entries={props.entries} privateReady={privateReady()} />
      </SettingsSection>

      <SettingsSection
        title={`ミュートしているもの（${props.entries.length}）`}
      >
        <Switch>
          <Match when={props.loading}>
            <p class="c-secondary text-caption">読み込み中…</p>
          </Match>
          <Match when={props.entries.length === 0}>
            <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
              まだ何もミュートしていません。
            </p>
          </Match>
          <Match when={true}>
            <ul class="flex flex-col overflow-hidden rounded-2 border border-primary [&>*+*]:border-t [&>*]:border-primary">
              <For each={props.entries}>
                {(entry) => <MuteRow entry={entry} />}
              </For>
            </ul>
          </Match>
        </Switch>
        <p class="c-secondary text-caption">
          イベントやユーザーは、投稿の右上のメニューからもミュートできます。
        </p>
      </SettingsSection>
    </div>
  );
};

const AddMute: Component<{
  entries: readonly MuteEntry[];
  privateReady: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [type, setType] = createSignal<TargetType>("pubkey");
  // 「ユーザー」を選んでいる間は、欄全体で人を探す。
  const people = [
    userSource(useUserCandidates(), {
      trigger: { kind: "user", prefixes: [] },
      format: (nprofile) => nprofile,
    }),
  ];
  const [chosen, setChosen] = createSignal<MuteVisibility>("private");
  // 非公開を扱えないなら、選んでいても公開として足す。
  const visibility = (): MuteVisibility =>
    props.privateReady ? chosen() : "public";
  const [text, setText] = createSignal("");
  const [error, setError] = createSignal<string>();
  const current = () => TYPES.find((entry) => entry.value === type());

  const submit = () => {
    const target = parseMuteTarget(type(), text());
    if (!target) {
      setError(current()?.invalid);
      return;
    }
    const already = props.entries.some(
      (entry) =>
        entry.visibility === visibility() &&
        entry.target.type === target.type &&
        entry.target.value === target.value,
    );
    if (already) {
      setError("もうミュートしています");
      return;
    }
    dispatch({ type: "mutes/add", target, visibility: visibility() });
    setText("");
    setError(undefined);
  };

  return (
    <form
      class="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div class="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="ミュートするものの種類"
          options={TYPES}
          value={type()}
          onChange={(next) => {
            setType(next);
            setError(undefined);
          }}
        />
        <SegmentedControl
          label="公開範囲"
          variant="secondary"
          value={visibility()}
          options={[
            {
              value: "private",
              label: "非公開",
              disabled: !props.privateReady,
              hint: "今のログインの方法では、非公開のミュートを扱えません",
            },
            { value: "public", label: "公開" },
          ]}
          onChange={setChosen}
        />
      </div>
      <div class="flex items-center gap-2">
        <Completion
          sources={type() === "pubkey" ? people : []}
          label="人の候補"
        >
          {(attach) => (
            <input
              ref={attach}
              class={`${textInputClass} min-w-0 flex-1`}
              placeholder={current()?.placeholder}
              aria-label={`ミュートする${current()?.label ?? ""}`}
              aria-invalid={error() !== undefined}
              aria-describedby="mute-input-error"
              value={text()}
              onInput={(event) => {
                setText(event.currentTarget.value);
                setError(undefined);
              }}
            />
          )}
        </Completion>
        <Button
          type="submit"
          variant="primary"
          icon="i-material-symbols:add-rounded"
        >
          追加
        </Button>
      </div>
      <Show
        when={error()}
        fallback={
          <p class="c-secondary text-caption">
            {VISIBILITY_HINT[visibility()]}
          </p>
        }
      >
        {(message) => (
          <p id="mute-input-error" class="c-danger text-caption">
            {message()}
          </p>
        )}
      </Show>
    </form>
  );
};

const MuteRow: Component<{ entry: MuteEntry }> = (props) => {
  const dispatch = useDispatch();
  return (
    <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-primary px-3 py-2.5">
      <div class="flex min-w-48 flex-1 items-center gap-3">
        <span class="c-secondary w-26 shrink-0 truncate rounded-full bg-secondary px-2.5 py-0.5 text-center font-600 text-caption">
          {labelOf(props.entry.target.type)}
        </span>
        <div class="flex min-w-0 flex-1 items-center gap-1.5 text-body">
          <MuteTargetView target={props.entry.target} />
        </div>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <span class="c-secondary text-caption">
          {props.entry.visibility === "private" ? "非公開" : "公開"}
        </span>
        {/* 一覧から外すだけで、相手や投稿が消えるわけではない（remove）。 */}
        <Button
          variant="ghost"
          size="sm"
          shape="rounded"
          icon="i-material-symbols:do-not-disturb-on-outline-rounded"
          aria-label="ミュートを解除"
          title="ミュートを解除"
          onClick={() => dispatch({ type: "mutes/remove", entry: props.entry })}
        />
      </div>
    </li>
  );
};

const MuteTargetView: Component<{ target: MuteTarget }> = (props) => {
  const dispatch = useDispatch();
  return (
    <Switch>
      <Match when={props.target.type === "pubkey" && props.target.value}>
        {(pubkey) => (
          <>
            <Avatar pubkey={pubkey()} size="tiny" />
            <UserLink
              pubkey={pubkey()}
              class="c-primary min-w-0 truncate font-600"
            />
          </>
        )}
      </Match>
      <Match when={props.target.type === "thread" && props.target.value}>
        {(id) => (
          <button
            type="button"
            class="c-primary min-w-0 cursor-pointer truncate bg-transparent p-0 text-left hover:underline"
            title="このイベントを開く"
            onClick={() =>
              dispatch({ type: "stack/open", column: buildThreadColumn(id()) })
            }
          >
            {shortId(encodeBech32("note", id()))}
          </button>
        )}
      </Match>
      <Match when={props.target.type === "hashtag"}>
        <span class="c-primary min-w-0 break-all">#{props.target.value}</span>
      </Match>
      <Match when={true}>
        <span class="c-primary min-w-0 break-all">{props.target.value}</span>
      </Match>
    </Switch>
  );
};

export default MuteSettingsView;
