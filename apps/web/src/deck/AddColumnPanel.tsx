import {
  buildColumn,
  buildFollowSetsColumn,
  buildRelayColumn,
  buildTimeslipColumn,
} from "@streets/core/deck/column-presets";
import type { ColumnDef } from "@streets/core/deck/deck";
import { type ColumnPicker, isColumnPicker } from "@streets/core/deck/deck-ui";
import { CHANNEL_CREATE_KIND } from "@streets/core/nostr/channel";
import { encodeNevent } from "@streets/core/nostr/nip19";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createSignal,
  createEffect,
} from "solid-js";
import ChannelList from "../columns/blocks/ChannelList";
import { FollowSetList } from "../columns/blocks/FollowSets";
import { ColumnScope } from "../columns/column-scope";
import { viewerReadRelays } from "../columns/column-views";
import {
  useUserCandidates,
  useUserSearch,
  userSource,
} from "../completion/sources";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import Completion from "../ui/Completion";
import DateTimeInput from "../ui/DateTimeInput";
import IconButton from "../ui/IconButton";
import { textInputClass } from "../ui/TextField";
import { COLUMN_ADD_PRESETS } from "./column-add-presets";
import RelayColumnEditor from "./RelayColumnEditor";

const Row: Component<{
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
}> = (props) => (
  <button
    type="button"
    class="flex w-full cursor-pointer items-center gap-2.5 bg-primary px-3 py-2.5 text-left hover:bg-secondary"
    onClick={() => props.onClick()}
  >
    <span
      class={`c-secondary size-4.5 shrink-0 ${props.icon}`}
      aria-hidden="true"
    />
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate font-600 text-body">{props.label}</span>
      <span class="c-secondary truncate text-caption">{props.description}</span>
    </span>
    <span
      class="i-material-symbols:chevron-right-rounded c-secondary size-4.5 shrink-0"
      aria-hidden="true"
    />
  </button>
);

/** サイドバーのパネルに出す、カラムを追加するための中身。題名と閉じるはパネル側が持つ。 */
/**
 * チャンネルを選ぶ。押したチャンネルは一時カラム（左端）で開き、残すかは開いた先の
 * 「カラムに残す」で決める。一覧そのものをデッキのカラムとして足すこともできる。
 */
const ChannelPicker: Component<{
  relayList: RelayListState;
  readLayer?: ReadLayer;
  onBack: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <section class="motion-fade flex animate-in flex-col gap-3">
      <div class="flex items-center gap-1">
        <IconButton
          icon="i-material-symbols:arrow-back-rounded"
          label="カラムの種類へ戻る"
          onClick={() => props.onBack()}
        />
        <div>
          <h3 class="c-primary font-600 text-body">チャンネルを選ぶ</h3>
          <p class="c-secondary mt-0.5 text-caption">
            選んだチャンネルのメッセージを表示します。
          </p>
        </div>
        <IconButton
          icon="i-material-symbols:open-in-new-rounded"
          label="一覧をデッキのカラムとして足す"
          title="一覧をデッキのカラムとして足す"
          class="ml-auto self-start"
          onClick={() => {
            const column = buildColumn("channels", "");
            if (column) dispatch({ type: "deck/add-column", column });
          }}
        />
      </div>
      <Show when={props.readLayer}>
        {(layer) => (
          <div class="-mx-3">
            <ColumnScope
              value={{
                column: () => PICKER_COLUMN,
                readLayer: layer(),
              }}
            >
              <ChannelList
                viewerRead={() => viewerReadRelays(props.relayList)}
                // 押したら一時カラムで開く。デッキに残すかは、開いた先の「カラムに残す」で決める。
                onOpen={(column) => {
                  if (column.source.kind !== "channel") return;
                  // URL が長くなってもリレーを切らない。先頭のリレーが落ちていると、
                  // 開いた先でチャンネルの情報にも発言にも辿り着けない。
                  const nevent = encodeNevent({
                    id: column.source.id,
                    relays: column.source.relays ?? [],
                    eventKind: CHANNEL_CREATE_KIND,
                  });
                  if (nevent)
                    dispatch({ type: "deck/open-temp", entity: nevent });
                }}
              />
            </ColumnScope>
          </div>
        )}
      </Show>
    </section>
  );
};

/**
 * リストを選ぶ。押したリストのカラムをデッキに足す。一覧そのものをカラムとして
 * 置いておく人は少ないので、一覧はここで見せ、足すのは選んだリストだけにする。
 */
const FollowSetPicker: Component<{
  relayList: RelayListState;
  readLayer?: ReadLayer;
  onBack: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <section class="motion-fade flex animate-in flex-col gap-3">
      <div class="flex items-center gap-1">
        <IconButton
          icon="i-material-symbols:arrow-back-rounded"
          label="カラムの種類へ戻る"
          onClick={() => props.onBack()}
        />
        <div>
          <h3 class="c-primary font-600 text-body">リストを選ぶ</h3>
          <p class="c-secondary mt-0.5 text-caption">
            選んだリストに入っている人の投稿を表示します。
          </p>
        </div>
        <IconButton
          icon="i-material-symbols:open-in-new-rounded"
          label="一覧をデッキのカラムとして足す"
          title="一覧をデッキのカラムとして足す"
          class="ml-auto self-start"
          onClick={() =>
            dispatch({
              type: "deck/add-column",
              column: buildFollowSetsColumn(),
            })
          }
        />
      </div>
      <Show when={props.readLayer}>
        {(layer) => (
          <div class="-mx-3">
            <ColumnScope
              value={{
                column: () => FOLLOW_SET_PICKER_COLUMN,
                readLayer: layer(),
              }}
            >
              <FollowSetList
                viewerRead={() => viewerReadRelays(props.relayList)}
                onOpen={(column) =>
                  dispatch({
                    type: "deck/add-column",
                    column: { ...column, id: crypto.randomUUID() },
                  })
                }
              />
            </ColumnScope>
          </div>
        )}
      </Show>
    </section>
  );
};

/** 検索リレーへの問い合わせの進み具合。何も問い合わせていないときは出さない。 */
export const UserSearchStatus: Component<{
  searching: boolean;
  /** 答えがそろったときの、見つかった人数。 */
  found: number | undefined;
}> = (props) => (
  <Show when={props.searching || props.found !== undefined}>
    <p class="c-secondary text-caption" aria-live="polite">
      {props.searching
        ? "検索リレーで探しています…"
        : props.found === 0
          ? "検索リレーでは見つかりませんでした"
          : `検索リレーで ${props.found} 人見つかりました`}
    </p>
  </Show>
);

/**
 * 人を選ぶ。名前で補完するか、ID（npub1… / nprofile1…）を貼る。選んだ人の
 * カラムをデッキに足す。候補はフォロー中の人に加え、検索リレーで見つかった人も出す。
 */
const UserPicker: Component<{
  searchRelays: () => readonly RelayUrl[];
  onBack: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  const [text, setText] = createSignal("");
  const [error, setError] = createSignal<string>();
  const search = useUserSearch(text, () => props.searchRelays());
  const people = [
    userSource(useUserCandidates(undefined, search.found), {
      trigger: { kind: "user", prefixes: [] },
      format: (nprofile) => nprofile,
    }),
  ];

  const submit = () => {
    const column = buildColumn("user", text());
    if (!column) {
      setError(
        "候補から選ぶか、npub1… か nprofile1… で始まるユーザーの ID を入力してください",
      );
      return;
    }
    dispatch({ type: "deck/add-column", column });
    setText("");
    setError(undefined);
  };

  return (
    <section class="motion-fade flex animate-in flex-col gap-3">
      <div class="flex items-center gap-1">
        <IconButton
          icon="i-material-symbols:arrow-back-rounded"
          label="カラムの種類へ戻る"
          onClick={() => props.onBack()}
        />
        <div>
          <h3 class="c-primary font-600 text-body">ユーザーを選ぶ</h3>
          <p class="c-secondary mt-0.5 text-caption">
            選んだ人のノートと返信を表示します。
          </p>
        </div>
      </div>
      <form
        class="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Completion sources={people} label="人の候補">
          {(attach) => (
            <input
              ref={attach}
              class={textInputClass}
              placeholder="名前・npub1… で探す"
              aria-label="カラムに出す人"
              aria-invalid={error() !== undefined}
              autofocus
              value={text()}
              onInput={(event) => {
                setText(event.currentTarget.value);
                setError(undefined);
              }}
            />
          )}
        </Completion>
        <Show
          when={error()}
          fallback={
            <UserSearchStatus
              searching={search.searching()}
              found={search.searched() ? search.found().length : undefined}
            />
          }
        >
          {(message) => <p class="c-danger text-caption">{message()}</p>}
        </Show>
        <Button
          type="submit"
          variant="primary"
          shape="rounded"
          block
          disabled={text().trim() === ""}
        >
          ユーザーカラムを追加
        </Button>
      </form>
    </section>
  );
};

const DAY_SECONDS = 24 * 60 * 60;

/** さかのぼる日時を選ぶ。最初は 1 日前にしておく。 */
const TimeslipPicker: Component<{ onBack: () => void }> = (props) => {
  const dispatch = useDispatch();
  const now = Math.floor(Date.now() / 1000);
  const [until, setUntil] = createSignal(now - DAY_SECONDS);
  return (
    <section class="motion-fade flex animate-in flex-col gap-3">
      <div class="flex items-center gap-1">
        <IconButton
          icon="i-material-symbols:arrow-back-rounded"
          label="カラムの種類へ戻る"
          onClick={() => props.onBack()}
        />
        <div>
          <h3 class="c-primary font-600 text-body">日時を選ぶ</h3>
          <p class="c-secondary mt-0.5 text-caption">
            フォロー中の人の投稿を、選んだ日時から過去へさかのぼって表示します。
          </p>
        </div>
      </div>
      <form
        class="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          dispatch({
            type: "deck/add-column",
            column: buildTimeslipColumn(until()),
          });
        }}
      >
        <DateTimeInput
          label="さかのぼり始める日時"
          value={until()}
          max={now}
          autofocus
          onChange={setUntil}
        />
        <Button type="submit" variant="primary" shape="rounded" block>
          タイムスリップカラムを追加
        </Button>
      </form>
    </section>
  );
};

const FOLLOW_SET_PICKER_COLUMN: ColumnDef = {
  id: "add-column/follow-sets",
  title: "リスト",
  source: { kind: "follow-sets" },
};

/** パネルの中の一覧は、デッキのカラムではない。診断値の名前と見せ方の既定にだけ使う。 */
const PICKER_COLUMN: ColumnDef = {
  id: "add-column/channels",
  title: "チャンネル",
  source: { kind: "channel-list" },
};

const AddColumnPanel: Component<{
  relayList: RelayListState;
  /** Storybook で選ぶ画面を開いた状態から始めるため。 */
  initialPicker?: ColumnPicker;
  request?: { picker: ColumnPicker; sequence: number };
  /** チャンネルやリストを選ぶ一覧が読む。Storybook では渡さない（一覧の見た目は別のストーリーで見る）。 */
  readLayer?: ReadLayer;
  /** 人を名前で探すときの問い合わせ先。 */
  searchRelays: () => readonly RelayUrl[];
}> = (props) => {
  const dispatch = useDispatch();
  const [picker, setPicker] = createSignal<ColumnPicker | undefined>(
    props.initialPicker,
  );
  createEffect(() => {
    // reconcile は同じオブジェクトを更新するため、連続した要求も番号で拾う。
    const request = props.request;
    setPicker(
      request?.sequence === undefined ? props.initialPicker : request.picker,
    );
  });
  const [selectedRelays, setSelectedRelays] = createSignal<RelayUrl[]>([]);
  const back = () => setPicker(undefined);

  return (
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <Switch
        fallback={
          <div class="motion-fade animate-in">
            <div class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
              <For each={COLUMN_ADD_PRESETS}>
                {(preset) => (
                  <Row
                    icon={preset.icon}
                    label={preset.label}
                    description={preset.description}
                    onClick={() => {
                      const kind = preset.kind;
                      if (isColumnPicker(kind)) {
                        setPicker(kind);
                        return;
                      }
                      const column = buildColumn(kind, "");
                      if (column)
                        dispatch({
                          type: "deck/add-column",
                          column: column,
                        });
                    }}
                  />
                )}
              </For>
            </div>
          </div>
        }
      >
        <Match when={picker() === "follow-sets"}>
          <FollowSetPicker
            relayList={props.relayList}
            readLayer={props.readLayer}
            onBack={back}
          />
        </Match>
        <Match when={picker() === "channels"}>
          <ChannelPicker
            relayList={props.relayList}
            readLayer={props.readLayer}
            onBack={back}
          />
        </Match>
        <Match when={picker() === "user"}>
          <UserPicker searchRelays={props.searchRelays} onBack={back} />
        </Match>
        <Match when={picker() === "timeslip"}>
          <TimeslipPicker onBack={back} />
        </Match>
        <Match when={picker() === "relay"}>
          <section class="motion-fade flex animate-in flex-col gap-3">
            <div class="flex items-center gap-1">
              <IconButton
                icon="i-material-symbols:arrow-back-rounded"
                label="カラムの種類へ戻る"
                onClick={back}
              />
              <div>
                <h3 class="c-primary font-600 text-body">リレーを選ぶ</h3>
                <p class="c-secondary mt-0.5 text-caption">
                  選んだリレーにある公開ノートを時系列で表示します。
                </p>
              </div>
            </div>
            <div>
              <p class="c-secondary mt-0.5 text-caption">
                URL
                を入れるか、候補から選んでください。候補には、アカウントとフォローしている人が使っているリレーが出ます。
              </p>
            </div>
            <Show when={props.relayList.phase === "loading"}>
              <p class="c-secondary text-caption">
                リレー設定を読み込んでいます…
              </p>
            </Show>
            <Show when={props.relayList.phase === "missing"}>
              <p class="c-secondary text-caption">
                アカウントのリレー設定がありません。URLを直接入力できます。
              </p>
            </Show>
            <RelayColumnEditor
              candidates={
                props.relayList.phase === "ready" ? props.relayList.entries : []
              }
              selected={selectedRelays()}
              onChange={setSelectedRelays}
            />
            <Button
              variant="primary"
              shape="rounded"
              block
              disabled={selectedRelays().length === 0}
              onClick={() => {
                const column = buildRelayColumn(selectedRelays());
                if (column) dispatch({ type: "deck/add-column", column });
              }}
            >
              リレーカラムを追加
            </Button>
          </section>
        </Match>
      </Switch>
    </div>
  );
};

export default AddColumnPanel;
