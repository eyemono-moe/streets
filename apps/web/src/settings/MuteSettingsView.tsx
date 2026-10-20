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
import { t } from "../i18n/locale";
import Avatar from "../note/Avatar";
import UserLink from "../note/UserLink";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import Completion from "../ui/Completion";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import { textInputClass } from "../ui/TextField";
import SettingsSection from "./SettingsSection";

type TargetType = MuteTarget["type"];

const types = (): {
  value: TargetType;
  label: string;
  placeholder: string;
  invalid: string;
  inputLabel: string;
}[] => [
  {
    value: "pubkey",
    label: t("settings.mute.types.pubkey.label"),
    placeholder: t("settings.mute.types.pubkey.placeholder"),
    invalid: t("settings.mute.types.pubkey.invalid"),
    inputLabel: t("settings.mute.types.pubkey.inputLabel"),
  },
  {
    value: "thread",
    label: t("settings.mute.types.thread.label"),
    placeholder: t("settings.mute.types.thread.placeholder"),
    invalid: t("settings.mute.types.thread.invalid"),
    inputLabel: t("settings.mute.types.thread.inputLabel"),
  },
  {
    value: "hashtag",
    label: t("settings.mute.types.hashtag.label"),
    placeholder: t("settings.mute.types.hashtag.placeholder"),
    invalid: t("settings.mute.types.hashtag.invalid"),
    inputLabel: t("settings.mute.types.hashtag.inputLabel"),
  },
  {
    value: "word",
    label: t("settings.mute.types.word.label"),
    placeholder: t("settings.mute.types.word.placeholder"),
    invalid: t("settings.mute.types.word.invalid"),
    inputLabel: t("settings.mute.types.word.inputLabel"),
  },
];

const labelOf = (type: TargetType) =>
  types().find((entry) => entry.value === type)?.label;

const visibilityHint = (visibility: MuteVisibility): string =>
  visibility === "private"
    ? t("settings.mute.hintPrivate")
    : t("settings.mute.hintPublic");

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
        id="muteAdd"
        scope="account"
        description={t("settings.mute.description")}
      >
        <Show when={props.privatePart === "unavailable"}>
          <p class="c-secondary rounded-2 bg-secondary p-3 text-caption">
            {t("settings.mute.noticeUnavailable")}
          </p>
        </Show>
        <Show when={props.privatePart === "invalid"}>
          <p class="c-danger rounded-2 bg-danger-subtle p-3 text-caption">
            {t("settings.mute.noticeInvalid")}
          </p>
        </Show>
        <AddMute entries={props.entries} privateReady={privateReady()} />
      </SettingsSection>

      <SettingsSection
        id="muteList"
        title={t("settings.mute.listTitle", { count: props.entries.length })}
      >
        <Switch>
          <Match when={props.loading}>
            <p class="c-secondary text-caption">
              {t("settings.relays.loading")}
            </p>
          </Match>
          <Match when={props.entries.length === 0}>
            <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
              {t("settings.mute.empty")}
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
        <p class="c-secondary text-caption">{t("settings.mute.menuHint")}</p>
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
  const current = () => types().find((entry) => entry.value === type());

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
      setError(t("settings.mute.already"));
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
          label={t("settings.mute.typeLabel")}
          options={types()}
          value={type()}
          onChange={(next) => {
            setType(next);
            setError(undefined);
          }}
        />
        <SegmentedControl
          label={t("settings.mute.visibility")}
          variant="secondary"
          value={visibility()}
          options={[
            {
              value: "private",
              label: t("settings.mute.private"),
              disabled: !props.privateReady,
              hint: t("settings.mute.privateUnavailable"),
            },
            { value: "public", label: t("settings.mute.public") },
          ]}
          onChange={setChosen}
        />
      </div>
      <div class="flex items-center gap-2">
        <Completion
          sources={type() === "pubkey" ? people : []}
          label={t("settings.mute.peopleLabel")}
        >
          {(attach) => (
            <input
              ref={attach}
              class={`${textInputClass} min-w-0 flex-1`}
              placeholder={current()?.placeholder}
              aria-label={current()?.inputLabel}
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
          {t("settings.mute.add")}
        </Button>
      </div>
      <Show
        when={error()}
        fallback={
          <p class="c-secondary text-caption">{visibilityHint(visibility())}</p>
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
          {props.entry.visibility === "private"
            ? t("settings.mute.private")
            : t("settings.mute.public")}
        </span>
        {/* 一覧から外すだけで、相手や投稿が消えるわけではない（remove）。 */}
        <IconButton
          icon="i-material-symbols:do-not-disturb-on-outline-rounded"
          label={t("settings.mute.unmute")}
          title={t("settings.mute.unmute")}
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
            title={t("settings.mute.openEvent")}
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
