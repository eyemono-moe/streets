import type {
  ColumnKind,
  ColumnSource,
  ColumnSourceOf,
} from "@streets/core/deck/column-kinds";
import {
  buildChannelInfoColumn,
  buildFollowSetInfoColumn,
} from "@streets/core/deck/column-presets";
import {
  bookmarksSource,
  followListSource,
  followeesActivitySource,
  followeesSource,
  followersSource,
  literalSource,
  notificationsSource,
  searchSource,
  userMediaSource,
  userPostsSource,
  userReactionsSource,
} from "@streets/core/deck/column-sources";
import {
  type ColumnDef,
  columnShow,
  groupsActions,
} from "@streets/core/deck/deck";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  hasSearchExclusions,
  parseSearchQuery,
  passesSearchExclusions,
} from "@streets/core/search/query";
import { relayLabel } from "@streets/core/settings/relay-edit";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { formatEventTimeFull } from "@streets/core/view/format-time";
import { type Component, Show, createMemo } from "solid-js";
import { useEventActions } from "../actions";
import { useSending } from "../actions-mediator";
import type { ColumnPatch } from "../deck/ColumnSettings";
import RelayColumnEditor from "../deck/RelayColumnEditor";
import SearchQueryEditor from "../deck/SearchQueryEditor";
import SettingField from "../deck/SettingField";
import { fallbackRelays } from "../fallback-relay-setting";
import { t, locale } from "../i18n/locale";
import { followSetName } from "../lists/follow-set-name";
import { useFollowSets } from "../lists/FollowSetMediator";
import { useBotLookup } from "../note/use-profile";
import ProfileHeader from "../profile/ProfileHeader";
import { useDispatch } from "../ui-events";
import ColumnTabs from "../ui/ColumnTabs";
import DateTimeInput from "../ui/DateTimeInput";
import IconButton from "../ui/IconButton";
import Switch from "../ui/Switch";
import WelcomeColumn from "../welcome/WelcomeColumn";
import ActionFeed from "./blocks/ActionFeed";
import Activity from "./blocks/Activity";
import Article from "./blocks/Article";
import Authors from "./blocks/Authors";
import ChannelChat from "./blocks/ChannelChat";
import ChannelInfo from "./blocks/ChannelInfo";
import ChannelList from "./blocks/ChannelList";
import EventList from "./blocks/EventList";
import FollowList from "./blocks/FollowList";
import {
  FollowSetInfo,
  FollowSetList,
  FollowSetTimeline,
} from "./blocks/FollowSets";
import MediaGrid from "./blocks/MediaGrid";
import NotificationList from "./blocks/NotificationList";
import PinnedNotesTab, { createPinnedNotes } from "./blocks/PinnedNotes";
import Thread from "./blocks/Thread";
import { useColumnScope } from "./column-scope";
import ColumnProfile from "./ColumnProfile";
import {
  ActivitySample,
  FollowSetsSample,
  NotificationsSample,
  TimelineSample,
} from "./sample/SampleColumn";
import TimeCircuits from "./TimeCircuits";

/**
 * カラムの中身が読む、ログイン中の人に紐づく値。変わる値は遅延アクセサで渡し、
 * 使う中身の中でだけ呼ぶ —— 全カラムで読むと、値が落ち着くたびに全カラムの
 * 購読が張り直される。
 */
export type ColumnInputs = {
  /** ログインしているか。していなければ、自分に紐づくカラムは中身を作らない。 */
  signedIn: boolean;
  viewer: string;
  followees: () => readonly string[];
  relayList: () => RelayListState;
  bookmarks: () => readonly string[];
  searchRelays: () => readonly RelayUrl[];
};

export type ColumnMeta = { icon: string; subtitle: string };

type ColumnView<S> = {
  /** ヘッダーのアイコンと説明。デッキが保存するのは「意図」だけなので、見せ方はここで決める。 */
  meta: (source: S) => ColumnMeta;
  /** 記号ではなくその人のアイコンを出す（人のカラムをいくつも足すと見分けが付かない）。 */
  avatar?: (source: S) => string;
  /** 中身が自分でスクロールする（タブの中身だけを動かす）。 */
  scrollsInternally?: boolean;
  /**
   * 中身の下に自分の入力欄を持つ。狭い画面では、右下に浮かぶ投稿ボタンが入力欄の
   * 送信ボタンに重なるので、このカラムを見ている間は出さない。
   */
  ownComposer?: boolean;
  /** ブロックを組み合わせた中身。 */
  Content: Component<{ source: S; inputs: ColumnInputs }>;
  /**
   * ログインしていない人に、中身の代わりに見せる見本。アカウントが要る種類だけが持つ。
   * 無ければ、ログインが要ることだけを出す。
   */
  Sample?: Component;
  /** 見出しの右に置く、その種類だけの操作（チャンネルのお気に入りなど）。 */
  HeaderActions?: Component<{ source: S }>;
  /** その種類だけの設定。共通の設定の下に出す。 */
  Settings?: Component<{
    column: ColumnDef;
    source: S;
    signedIn: boolean;
    relayList?: RelayListState;
  }>;
  /** 設定の一番下（削除の下）に置く飾り。設定の項目ではないもの。 */
  SettingsFooter?: Component<{ source: S }>;
};

const usePatch = (column: () => ColumnDef) => {
  const dispatch = useDispatch();
  return (patch: ColumnPatch) =>
    dispatch({ type: "deck/patch-column", id: column().id, patch });
};

const GroupActionsSwitch: Component<{ column: ColumnDef }> = (props) => {
  const patch = usePatch(() => props.column);
  return (
    <Switch
      label={t("columns.views.groupActions")}
      checked={groupsActions(props.column)}
      onChange={(groupNotifications) => patch({ groupNotifications })}
    />
  );
};

/** 選んだリレーの公開ノートだけを読むカラムか（リレーを後から選び直せる）。 */
const relayColumnSource = (source: ColumnSourceOf<"literal">) => {
  if (!source.relays) return undefined;
  const onlyPublicNotes =
    source.filters.length === 1 &&
    source.filters[0]?.kinds?.length === 1 &&
    source.filters[0]?.kinds?.[0] === 1 &&
    Object.keys(source.filters[0]).length === 1;
  return onlyPublicNotes ? source : undefined;
};

/** 見出しの ⓘ。チャンネルの情報をカラムの中に重ねる。 */
const ChannelInfoButton: Component<{
  id: string;
  relays: readonly RelayUrl[];
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <IconButton
      icon="i-material-symbols:info-outline-rounded"
      label={t("columns.views.channelInfo")}
      onClick={() =>
        dispatch({
          type: "stack/open",
          column: buildChannelInfoColumn(props.id, props.relays),
        })
      }
    />
  );
};

/** 見出しの ⓘ。リストの情報と入っている人をカラムの中に重ねる。 */
const FollowSetInfoButton: Component<{
  pubkey: string;
  identifier: string;
}> = (props) => {
  const dispatch = useDispatch();
  const lists = useFollowSets();
  return (
    <IconButton
      icon="i-material-symbols:info-outline-rounded"
      label={t("columns.views.followSetInfo")}
      onClick={() => {
        // 題名は届いたリストの名前で決まる。これは届くまでの仮の名前。
        const set =
          lists?.viewer === props.pubkey
            ? lists.find(props.identifier)
            : undefined;
        dispatch({
          type: "stack/open",
          column: buildFollowSetInfoColumn(
            props.pubkey,
            props.identifier,
            set ? followSetName(set) : t("columns.views.followSetFallbackName"),
          ),
        });
      }}
    />
  );
};

/** 見出しの ★。押すとお気に入りに入れる・外す。ログインしていなければ出さない。 */
const FavoriteChannelButton: Component<{ id: string }> = (props) => {
  const dispatch = useDispatch();
  const actions = useEventActions();
  const favorite = () =>
    actions?.favoriteChannelIds().includes(props.id) ?? false;
  const sending = useSending(() => ({
    type: "channel/favorite",
    id: props.id,
    on: !favorite(),
  }));
  return (
    <Show when={actions}>
      <IconButton
        icon={
          favorite()
            ? "i-material-symbols:star-rounded"
            : "i-material-symbols:star-outline-rounded"
        }
        active={favorite()}
        label={
          favorite()
            ? t("columns.views.favorite.remove")
            : t("columns.views.favorite.add")
        }
        aria-pressed={favorite()}
        disabled={sending()}
        onClick={() =>
          dispatch({ type: "channel/favorite", id: props.id, on: !favorite() })
        }
      />
    </Show>
  );
};

const PERSON_ICON = "i-material-symbols:person-outline-rounded";

/**
 * 自分の読み込みリレー。取得中は空（まだ探さない）。ログインしていないか、設定が無いか読み込みリレーが
 * 無ければ既定のリレーで探す —— 空のままだと、チャンネルを永久に見つけられない。
 */
export const viewerReadRelays = (state: RelayListState): RelayUrl[] => {
  // ログインしていなければ自分のリレーは無いので、既定のリレーで探す。
  if (state.phase === "loading") return [];
  const read =
    state.phase === "ready"
      ? state.entries.filter((entry) => entry.read).map((entry) => entry.url)
      : [];
  return read.length > 0 ? read : [...fallbackRelays()];
};

const COLUMN_VIEWS: { [K in ColumnKind]: ColumnView<ColumnSourceOf<K>> } = {
  literal: {
    // リレーを指していても、住所（naddr）で開いたカラムはリレーの全体ではない。
    meta: (source) =>
      relayColumnSource(source)
        ? {
            icon: "i-material-symbols:globe",
            subtitle: t("columns.views.subtitle.relay"),
          }
        : {
            icon: "i-material-symbols:pin-drop-outline-rounded",
            subtitle: t("columns.views.subtitle.condition"),
          },
    Content: (props) => (
      <EventList source={() => literalSource(props.source)} />
    ),
    Settings: (props) => {
      const patch = usePatch(() => props.column);
      return (
        <Show when={relayColumnSource(props.source)}>
          {(source) => (
            <SettingField label={t("columns.views.settings.relays")}>
              <RelayColumnEditor
                candidates={
                  props.relayList?.phase === "ready"
                    ? props.relayList.entries
                    : []
                }
                selected={source().relays ?? []}
                minimum={1}
                onChange={(relays) => {
                  patch({
                    title:
                      relays.length === 1
                        ? relayLabel(relays[0])
                        : t("columns.views.settings.relaysTitle", {
                            count: relays.length,
                          }),
                    source: { ...source(), relays },
                  });
                }}
              />
            </SettingField>
          )}
        </Show>
      );
    },
  },
  search: {
    meta: () => ({
      icon: "i-material-symbols:search-rounded",
      subtitle: t("columns.views.subtitle.search"),
    }),
    Content: (props) => {
      const query = createMemo(() => parseSearchQuery(props.source.query));
      const isBot = useBotLookup();
      return (
        <EventList
          source={() =>
            searchSource(
              props.source.query,
              props.inputs.searchRelays(),
              query().from === "follows" ? props.inputs.followees() : [],
            )
          }
          filter={
            hasSearchExclusions(query())
              ? (event) => passesSearchExclusions(query(), event, isBot)
              : undefined
          }
        />
      );
    },
    Settings: (props) => {
      const patch = usePatch(() => props.column);
      return (
        <SettingField label={t("columns.views.settings.searchQuery")}>
          {/* 探したときと同じ触り方で、後から条件を変えられるようにする。 */}
          <SearchQueryEditor
            text={props.source.query}
            signedIn={props.signedIn}
            // 打つたびに購読し直すと、やり取りが増えて画面もちらつく。
            debounceMs={600}
            onChange={(text) => {
              const next = text.trim();
              if (next === "") return;
              patch({ title: next, source: { kind: "search", query: next } });
            }}
          />
        </SettingField>
      );
    },
  },
  followees: {
    meta: () => ({
      icon: "i-material-symbols:home-outline-rounded",
      subtitle: t("columns.views.subtitle.followees"),
    }),
    Sample: () => (
      <TimelineSample
        heading={t("columns.views.sample.followees.heading")}
        body={t("columns.views.sample.followees.body")}
      />
    ),
    Content: (props) => {
      const scope = useColumnScope();
      return (
        <EventList
          source={() =>
            followeesSource(
              props.source.kinds,
              props.inputs.followees(),
              props.inputs.viewer,
              { chats: columnShow(scope.column()).chats },
            )
          }
        />
      );
    },
  },
  timeslip: {
    meta: (source) => ({
      icon: "i-material-symbols:history-rounded",
      subtitle: t("columns.views.subtitle.timeslip", {
        time: formatEventTimeFull(new Date(source.until * 1000), locale()),
      }),
    }),
    Sample: () => (
      <TimelineSample
        heading={t("columns.views.sample.timeslip.heading")}
        body={t("columns.views.sample.timeslip.body")}
      />
    ),
    Content: (props) => {
      const scope = useColumnScope();
      return (
        <EventList
          source={() =>
            followeesSource(
              props.source.kinds,
              props.inputs.followees(),
              props.inputs.viewer,
              {
                chats: columnShow(scope.column()).chats,
                until: props.source.until,
              },
            )
          }
          pagesNewer
        />
      );
    },
    Settings: (props) => {
      const patch = usePatch(() => props.column);
      return (
        <SettingField label={t("columns.views.settings.timeslip")}>
          <DateTimeInput
            label={t("columns.views.settings.timeslipInput")}
            value={props.source.until}
            max={Math.floor(Date.now() / 1000)}
            // 日時を変えたら、それまでいた時点から出発したことにする。
            onChange={(until) =>
              patch({
                source: {
                  ...props.source,
                  until,
                  departed: props.source.until,
                },
              })
            }
          />
        </SettingField>
      );
    },
    SettingsFooter: (props) => (
      <TimeCircuits
        destination={props.source.until}
        departed={props.source.departed}
      />
    ),
  },
  "followees-activity": {
    meta: () => ({
      icon: "i-material-symbols:vital-signs-rounded",
      subtitle: t("columns.views.subtitle.followeesActivity"),
    }),
    Sample: () => (
      <ActivitySample
        heading={t("columns.views.sample.followeesActivity.heading")}
        body={t("columns.views.sample.followeesActivity.body")}
      />
    ),
    Content: (props) => (
      <ActionFeed
        source={() =>
          followeesActivitySource(props.inputs.followees(), props.inputs.viewer)
        }
      />
    ),
    Settings: (props) => <GroupActionsSwitch column={props.column} />,
  },
  notifications: {
    meta: () => ({
      icon: "i-material-symbols:notifications-outline-rounded",
      subtitle: t("columns.views.subtitle.notifications"),
    }),
    Sample: () => (
      <NotificationsSample
        heading={t("columns.views.sample.notifications.heading")}
        body={t("columns.views.sample.notifications.body")}
      />
    ),
    Content: (props) => (
      <NotificationList
        viewer={props.inputs.viewer}
        source={() =>
          notificationsSource(
            props.inputs.viewer,
            props.inputs.relayList(),
            fallbackRelays(),
          )
        }
      />
    ),
    Settings: (props) => <GroupActionsSwitch column={props.column} />,
  },
  bookmarks: {
    meta: () => ({
      icon: "i-material-symbols:bookmark-outline-rounded",
      subtitle: t("columns.views.subtitle.bookmarks"),
    }),
    Sample: () => (
      <TimelineSample
        heading={t("columns.views.sample.bookmarks.heading")}
        body={t("columns.views.sample.bookmarks.body")}
      />
    ),
    Content: (props) => (
      <EventList source={() => bookmarksSource(props.inputs.bookmarks())} />
    ),
  },
  article: {
    meta: () => ({
      icon: "i-material-symbols:article-outline-rounded",
      subtitle: t("columns.views.subtitle.article"),
    }),
    Content: (props) => (
      <Article
        pubkey={props.source.pubkey}
        identifier={props.source.identifier}
        relays={props.source.relays}
      />
    ),
  },
  thread: {
    meta: () => ({
      icon: "i-material-symbols:mode-comment-outline-rounded",
      subtitle: t("columns.views.subtitle.thread"),
    }),
    Content: (props) => <Thread focus={props.source.focus} />,
  },
  activity: {
    meta: () => ({
      icon: "i-material-symbols:monitoring-rounded",
      subtitle: t("columns.views.subtitle.activity"),
    }),
    scrollsInternally: true,
    Content: (props) => <Activity target={props.source.target} />,
  },
  user: {
    meta: () => ({
      icon: PERSON_ICON,
      subtitle: t("columns.views.subtitle.user"),
    }),
    avatar: (source) => source.pubkey,
    Content: (props) => {
      const scope = useColumnScope();
      const pinned = createPinnedNotes(() => props.source.pubkey);
      return (
        <>
          <ColumnProfile
            id={scope.column().id}
            open={scope.partOpen?.("profile") ?? true}
          >
            <ProfileHeader
              pubkey={props.source.pubkey}
              readLayer={scope.readLayer}
            />
          </ColumnProfile>
          <ColumnTabs
            label={t("columns.views.userTabs.label")}
            name="user"
            scroll="column"
            tabs={[
              {
                value: "posts",
                get label() {
                  return t("columns.views.userTabs.posts");
                },
                content: () => (
                  <EventList
                    name="posts"
                    source={() =>
                      userPostsSource(props.source.pubkey, {
                        chats: columnShow(scope.column()).chats,
                      })
                    }
                  />
                ),
              },
              {
                value: "media",
                get label() {
                  return t("columns.views.userTabs.media");
                },
                content: () => (
                  <MediaGrid
                    name="media"
                    source={() =>
                      userMediaSource(props.source.pubkey, {
                        chats: columnShow(scope.column()).chats,
                      })
                    }
                  />
                ),
              },
              {
                value: "pinned",
                get label() {
                  return t("columns.views.userTabs.pinned");
                },
                // 件数は、ピン留めがあるときだけ出す。
                get count() {
                  return pinned.ids().length > 0
                    ? pinned.ids().length
                    : undefined;
                },
                content: () => <PinnedNotesTab pinned={pinned} />,
              },
              {
                value: "reactions",
                get label() {
                  return t("columns.views.userTabs.reactions");
                },
                content: () => (
                  <EventList
                    name="reactions"
                    source={() => userReactionsSource(props.source.pubkey)}
                  />
                ),
              },
            ]}
          />
        </>
      );
    },
  },
  "channel-info": {
    meta: () => ({
      icon: "i-material-symbols:info-outline-rounded",
      subtitle: t("columns.views.subtitle.channelInfo"),
    }),
    Content: (props) => (
      <ChannelInfo
        channelId={props.source.id}
        hints={props.source.relays ?? []}
        viewerRead={() => viewerReadRelays(props.inputs.relayList())}
      />
    ),
  },
  "channel-list": {
    meta: () => ({
      icon: "i-material-symbols:forum-outline-rounded",
      subtitle: t("columns.views.subtitle.channelList"),
    }),
    Content: (props) => (
      <ChannelList
        viewerRead={() => viewerReadRelays(props.inputs.relayList())}
      />
    ),
  },
  channel: {
    meta: () => ({
      icon: "i-material-symbols:forum-outline-rounded",
      subtitle: t("columns.views.subtitle.channel"),
    }),
    HeaderActions: (props) => (
      <>
        <ChannelInfoButton
          id={props.source.id}
          relays={props.source.relays ?? []}
        />
        <FavoriteChannelButton id={props.source.id} />
      </>
    ),
    scrollsInternally: true,
    ownComposer: true,
    Content: (props) => (
      <ChannelChat
        channelId={props.source.id}
        hints={props.source.relays ?? []}
        viewerRead={() => viewerReadRelays(props.inputs.relayList())}
        viewer={props.inputs.viewer}
      />
    ),
  },
  "followees-list": {
    meta: () => ({
      icon: PERSON_ICON,
      subtitle: t("columns.views.subtitle.followeesList"),
    }),
    Content: (props) => (
      <FollowList source={() => followListSource(props.source.pubkey)} />
    ),
  },
  "followers-list": {
    meta: () => ({
      icon: PERSON_ICON,
      subtitle: t("columns.views.subtitle.followersList"),
    }),
    Content: (props) => (
      <Authors
        source={() => followersSource(props.source.pubkey)}
        empty={t("columns.blocks.empty.followers")}
      />
    ),
  },
  "follow-sets": {
    meta: () => ({
      icon: "i-material-symbols:format-list-bulleted-rounded",
      subtitle: t("columns.views.subtitle.followSets"),
    }),
    Sample: () => (
      <FollowSetsSample
        heading={t("columns.views.sample.followSets.heading")}
        body={t("columns.views.sample.followSets.body")}
      />
    ),
    Content: (props) => (
      <FollowSetList
        viewerRead={() => viewerReadRelays(props.inputs.relayList())}
      />
    ),
  },
  "follow-set": {
    meta: () => ({
      icon: "i-material-symbols:group-outline-rounded",
      subtitle: t("columns.views.subtitle.followSet"),
    }),
    HeaderActions: (props) => (
      <FollowSetInfoButton
        pubkey={props.source.pubkey}
        identifier={props.source.identifier}
      />
    ),
    Content: (props) => (
      <FollowSetTimeline
        pubkey={props.source.pubkey}
        identifier={props.source.identifier}
      />
    ),
  },
  "follow-set-info": {
    meta: () => ({
      icon: "i-material-symbols:info-outline-rounded",
      subtitle: t("columns.views.subtitle.followSetInfo"),
    }),
    Content: (props) => (
      <FollowSetInfo
        pubkey={props.source.pubkey}
        identifier={props.source.identifier}
      />
    ),
  },
  welcome: {
    meta: () => ({
      icon: "i-material-symbols:waving-hand-outline-rounded",
      subtitle: t("columns.views.subtitle.welcome"),
    }),
    Content: () => <WelcomeColumn />,
  },
};

// 種類と中身の型の対応は union の分配では表せないので、引く場所をここ 1 つに閉じる。
export const columnView = (source: ColumnSource) =>
  COLUMN_VIEWS[source.kind] as unknown as ColumnView<ColumnSource>;
