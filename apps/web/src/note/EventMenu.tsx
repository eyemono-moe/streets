import { Drawer } from "@ark-ui/solid/drawer";
import { Menu } from "@ark-ui/solid/menu";
import { clientOf } from "@streets/core/nostr/app-handler";
import type { MuteTarget } from "@streets/core/nostr/build/mute";
import { buildRepost } from "@streets/core/nostr/build/repost";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  canBookmark,
  canPin,
  canReply,
} from "@streets/core/nostr/event-actions";
import {
  type EventActionId,
  allActionsOf,
  menuActionsOf,
} from "@streets/core/settings/action-layout";
import { canBroadcast } from "@streets/core/write/broadcast";
import { zapEndpointOf } from "@streets/core/zap/lnurl";
import {
  type Component,
  For,
  Show,
  createContext,
  createSignal,
  createUniqueId,
  useContext,
} from "solid-js";
import { Portal } from "solid-js/web";
import { actionLayout } from "../action-layout-setting";
import { type EventActions, useEventActions } from "../actions";
import { useSending } from "../actions-mediator";
import { canHover } from "../can-hover";
import { defaultReaction } from "../default-reaction-setting";
import ReactionPicker from "../emoji/ReactionPicker";
import { lazyPart } from "../lazy-part";
import { useFollowSets } from "../lists/FollowSetMediator";
import { useMutes } from "../settings/MuteMediator";
import { useDispatch } from "../ui-events";
import Avatar from "../ui/Avatar";
import IconButton from "../ui/IconButton";
import {
  nestedMenuPositioning,
  itemMenuPositioning,
  menuContentClass,
  menuGroupLabelClass,
  menuIconClass,
  menuItemClass,
  menuSeparatorClass,
  sheetContentClass,
  sheetGroupLabelClass,
  sheetIconClass,
  sheetItemClass,
} from "../ui/menu";
import {
  EVENT_ACTION_META,
  bookmarkLook,
  createEventDialogs,
  muteEventLook,
  pinLook,
  reactionLabel,
  useEngagements,
  useEventLevelOps,
} from "./event-ops";
import { ProfileName, ProfileText } from "./Name";
import { useProfileDetails } from "./use-profile";

const AuthorRelaysDialog = lazyPart(
  () => import("../profile/AuthorRelaysDialog"),
);

const AddToListDialog = lazyPart(() => import("../lists/AddToListDialog"));

const ClientDialog = lazyPart(() => import("./ClientDialog"));

type MenuItem = {
  value: string;
  label: string;
  icon: string;
  danger?: boolean;
  /** いまは押せない（送っている途中・ログインしていない・相手が受け取れない）。押せる見た目にしない。 */
  todo?: boolean;
};

const AUTHOR_RELAYS: MenuItem = {
  value: "author-relays",
  label: "リレー設定",
  icon: "i-material-symbols:hub-outline",
};

/**
 * ボトムシートの中では、項目を Menu.Item ではなく button で描く。Ark UI の Menu はポップアップしか
 * 持たず、Menu.Item は Menu の外に置けない。項目の並びは `Items` が 1 か所で持つ。
 */
const SheetPick = createContext<(value: string) => void>();

const Items: Component<{ items: MenuItem[] }> = (props) => {
  const pick = useContext(SheetPick);
  return (
    <For each={props.items}>
      {(item) =>
        pick ? (
          <button
            type="button"
            disabled={item.todo}
            class={sheetItemClass}
            classList={{ "c-danger": item.danger, "c-primary": !item.danger }}
            onClick={() => pick(item.value)}
          >
            <span class={`${item.icon} ${sheetIconClass}`} aria-hidden="true" />
            <span class="truncate">{item.label}</span>
          </button>
        ) : (
          <Menu.Item
            value={item.value}
            disabled={item.todo}
            class={menuItemClass}
            classList={{ "c-danger": item.danger }}
          >
            <span class={`${item.icon} ${menuIconClass}`} aria-hidden="true" />
            <span class="truncate">{item.label}</span>
          </Menu.Item>
        )
      }
    </For>
  );
};

/**
 * 「このイベント」の項目。アクション欄に出していない操作を、設定の順に並べる。
 * 数や済みの状態を読むので、メニューを開いている間だけ作る。
 */
const EventItems: Component<{
  event: NostrEvent;
  ids: readonly EventActionId[];
  actions: EventActions | undefined;
  muted: boolean;
  canMute: boolean;
  /** 返信を呼んだ側が書くか。kind:42 の返信は、そのときだけ出す。 */
  customReply: boolean;
  /** ミュートを呼んだ側の「ミュート…」に任せるか。ミュート済みの解除は残す。 */
  customMute: boolean;
}> = (props) => {
  const engagement = props.actions
    ? useEngagements(() => props.event, props.actions.viewer)
    : undefined;
  const reposting = useSending(() => ({
    type: "note/repost",
    target: props.event,
  }));
  const liking = useSending(() => ({
    type: "note/react",
    target: props.event,
    input: defaultReaction(),
  }));
  const bookmarked = () => props.actions?.bookmarked(props.event.id) ?? false;
  const bookmarking = useSending(() => ({
    type: "note/bookmark",
    target: props.event,
    on: !bookmarked(),
  }));
  const pinned = () => props.actions?.pinned(props.event.id) ?? false;
  const pinning = useSending(() => ({
    type: "note/pin",
    target: props.event,
    on: !pinned(),
  }));
  const broadcasts = useSending(() => ({
    type: "note/broadcast",
    target: props.event,
    relays: [],
  }));
  const author = useProfileDetails(() => props.event.pubkey);
  const itemsOf = (id: EventActionId): MenuItem[] => {
    const meta = EVENT_ACTION_META[id];
    switch (id) {
      case "reply":
        return canReply(props.event, { custom: props.customReply })
          ? [{ value: id, ...meta }]
          : [];
      case "react":
      case "activity":
      case "timeslip":
      case "copy-link":
      case "details":
        return [{ value: id, ...meta }];
      case "repost": {
        const reposted = engagement?.().viewerReposted ?? false;
        const repost: MenuItem[] = buildRepost(props.event)
          ? [
              {
                value: "repost",
                label: reposted ? "リポスト済み" : "リポスト",
                icon: meta.icon,
                todo: reposted || reposting(),
              },
            ]
          : [];
        return [
          ...repost,
          {
            value: "quote",
            label: "引用",
            icon: "i-material-symbols:format-quote-rounded",
          },
        ];
      }
      case "like": {
        const reacted = engagement?.().viewerReacted ?? false;
        return [
          {
            value: id,
            label: `${reactionLabel(defaultReaction())}${reacted ? "（済み）" : ""}`,
            icon: meta.icon,
            todo: reacted || liking(),
          },
        ];
      }
      case "zap": {
        // 送り先（lud16 / lud06）を書いている人にだけ送れる。
        const zappable = zapEndpointOf(author()?.content) !== undefined;
        return [
          {
            value: id,
            label: zappable ? "Zap する" : "この人は Zap を受け取れません",
            icon: meta.icon,
            todo: !zappable,
          },
        ];
      }
      // その kind では入れられないものは並べない。入っているものは外せるよう残す。
      case "bookmark":
        return bookmarked() || canBookmark(props.event)
          ? [
              {
                value: id,
                ...bookmarkLook(props.event, bookmarked()),
                todo: bookmarking(),
              },
            ]
          : [];
      case "pin":
        return pinned() || canPin(props.event)
          ? [{ value: id, ...pinLook(props.event, pinned()), todo: pinning() }]
          : [];
      case "mute-event":
        return props.customMute && !props.muted
          ? []
          : [
              {
                value: id,
                ...muteEventLook(props.muted),
                todo: !props.canMute,
              },
            ];
      case "broadcast":
        // 送るのはログインしている間だけ。暗号化されたものは送り直さない。
        return props.actions && canBroadcast(props.event)
          ? [{ value: id, ...meta, todo: broadcasts() }]
          : [];
    }
  };
  return <Items items={props.ids.flatMap(itemsOf)} />;
};

/**
 * 投稿の右上のメニュー。kind によらず出せる操作と、アクション欄に出していない操作を置く。
 * その kind では使えない操作は並べず、いまだけ押せない操作は押せない状態で並べる。
 */
const EventMenu: Component<{
  event: NostrEvent;
  /** この投稿にアクション欄があるか。無ければ、欄に入る操作はメニューにも出さない。 */
  withActions?: boolean;
  /**
   * アクション欄の代わりにホバーで出す道具列を持つ画面（チャット）で、道具列にある操作。
   * 渡すと欄の操作もメニューに並べ、カーソルを当てられる端末では道具列の分を外す。
   */
  toolbar?: readonly EventActionId[];
  /** 返信を呼んだ側が書くとき、その開き方。渡さなければ kind:1 の返信ダイアログを開く。 */
  onReply?: () => void;
  /**
   * 呼んだ側がミュートの選び方を持つとき、その開き方。渡すと「このイベントをミュート」と
   * 投稿者の「ミュート」の代わりに「ミュート…」を 1 つ出す。ミュート済みの解除はそのまま残る。
   */
  onMute?: () => void;
  /** 開いた状態で描く。Storybook で中身を並べるため。 */
  defaultOpen?: boolean;
  /** 作者の入れ子のメニューも開いた状態で描く。Storybook 用。 */
  defaultAuthorOpen?: boolean;
  /** ボトムシートで出すか。既定は、ホバーできない端末。Storybook で触る端末の形を出すため。 */
  sheet?: boolean;
}> = (props) => {
  const profileDetails = useProfileDetails(() => props.event.pubkey);
  const profile = () => profileDetails()?.profile;
  const dispatch = useDispatch();
  const mutes = useMutes();
  const lists = useFollowSets();
  const actions = useEventActions();
  const viewer = actions?.viewer;
  const mine = () => props.event.pubkey === viewer;
  const ops = useEventLevelOps(() => props.event);
  const dialogs = createEventDialogs(() => props.event);
  const [picking, setPicking] = createSignal(false);
  let trigger: HTMLElement | undefined;
  const eventIds = () =>
    props.toolbar && actions !== undefined
      ? allActionsOf(actionLayout(), canHover() ? props.toolbar : [])
      : menuActionsOf(
          actionLayout(),
          props.withActions === true && actions !== undefined,
        );
  const authorTarget = (): MuteTarget => ({
    type: "pubkey",
    value: props.event.pubkey,
  });
  const authorMuteEntry = () =>
    mutes
      ?.entries()
      .find(
        (entry) =>
          entry.target.type === "pubkey" &&
          entry.target.value === props.event.pubkey,
      );
  const following = () => actions?.following(props.event.pubkey) === true;
  const followSending = useSending(() => ({
    type: "user/follow",
    pubkey: props.event.pubkey,
    on: !following(),
  }));
  const authorItems = (): MenuItem[] => {
    // 自分もリストに入れられる（自分の投稿もそのリストのカラムに流したいことがある）。
    const addToList: MenuItem = {
      value: "add-to-list",
      label: "リストに追加",
      icon: "i-material-symbols:playlist-add-rounded",
      todo: lists === undefined,
    };
    // 自分はフォローできず、ミュートしても自分の投稿は隠さない。押せても意味が無いので出さない。
    if (mine()) return [addToList, AUTHOR_RELAYS];
    const muted = authorMuteEntry() !== undefined;
    const muteAuthor: MenuItem[] =
      props.onMute && !muted
        ? []
        : [
            {
              value: "mute-author",
              label: muted ? "ミュートを解除" : "ミュート",
              icon: muted
                ? "i-material-symbols:person-outline-rounded"
                : "i-material-symbols:person-off-outline-rounded",
              todo: mutes === undefined,
            },
          ];
    return [
      {
        value: "follow",
        label: following() ? "フォローを解除" : "フォロー",
        icon: following()
          ? "i-material-symbols:person-remove-outline-rounded"
          : "i-material-symbols:person-add-outline-rounded",
        // ログインしていないと、フォローの一覧を書けない。
        todo: actions === undefined || followSending(),
      },
      addToList,
      ...muteAuthor,
      AUTHOR_RELAYS,
    ];
  };
  const authorLabel = () => (
    <>
      <ProfileName
        pubkey={props.event.pubkey}
        profile={profile()}
        tags={profileDetails()?.tags}
      />
      <Show when={profile()?.name}>
        {(name) => (
          <>
            {" @"}
            <ProfileText text={name()} tags={profileDetails()?.tags} />
          </>
        )}
      </Show>
    </>
  );
  // 入れ子の開き口では、表示名と @名前 を並べず、@名前（無ければ表示名）だけを出す。
  const authorHandle = () => (
    <Show
      when={profile()?.name}
      fallback={
        <ProfileName
          pubkey={props.event.pubkey}
          profile={profile()}
          tags={profileDetails()?.tags}
        />
      }
    >
      {(name) => (
        <>
          @<ProfileText text={name()} tags={profileDetails()?.tags} />
        </>
      )}
    </Show>
  );
  const toggleAuthorMute = () => {
    const entry = authorMuteEntry();
    dispatch(
      entry
        ? { type: "mutes/remove", entry }
        : { type: "mutes/add", target: authorTarget() },
    );
  };
  // 入れ子のメニューの onSelect は親とは別に呼ばれるので、処理は両方からこの関数へ集める。
  const select = (value: string) => {
    switch (value) {
      case "reply":
        if (props.onReply) props.onReply();
        else dialogs.open("reply");
        break;
      case "quote":
      case "details":
      case "broadcast":
        dialogs.open(value);
        break;
      case "repost":
        dispatch({ type: "note/repost", target: props.event });
        break;
      case "like":
        dispatch({
          type: "note/react",
          target: props.event,
          input: defaultReaction(),
        });
        break;
      case "react":
        setPicking(true);
        break;
      case "zap":
        dispatch({ type: "zap/open", target: props.event });
        break;
      case "bookmark":
        dispatch({
          type: "note/bookmark",
          target: props.event,
          on: !(actions?.bookmarked(props.event.id) ?? false),
        });
        break;
      case "pin":
        dispatch({
          type: "note/pin",
          target: props.event,
          on: !(actions?.pinned(props.event.id) ?? false),
        });
        break;
      case "activity":
        ops.activity();
        break;
      case "copy-link":
        void ops.copyLink();
        break;
      case "mute-event":
        ops.toggleMute();
        break;
      case "follow":
        dispatch({
          type: "user/follow",
          pubkey: props.event.pubkey,
          on: !following(),
        });
        break;
      case "author-relays":
        setAuthorRelays(true);
        break;
      case "client":
        setShowingClient(true);
        break;
      case "add-to-list":
        setAddingToList(true);
        break;
      case "mute-author":
        toggleAuthorMute();
        break;
      case "timeslip":
        ops.timeslip();
        break;
      case "mute":
        props.onMute?.();
        break;
    }
  };

  const [authorRelays, setAuthorRelays] = createSignal(false);
  const client = () => clientOf(props.event);
  const [showingClient, setShowingClient] = createSignal(false);
  const [addingToList, setAddingToList] = createSignal(false);

  // ポップアップとボトムシートで同じ中身を使い、出し方だけを変える。
  const eventSection = () => (
    <>
      <EventItems
        event={props.event}
        ids={eventIds()}
        actions={actions}
        muted={ops.muted()}
        canMute={ops.canMute}
        customReply={props.onReply !== undefined}
        customMute={props.onMute !== undefined}
      />
      <Show when={props.onMute}>
        <Items
          items={[
            {
              value: "mute",
              label: "ミュート…",
              icon: "i-material-symbols:visibility-off-outline-rounded",
            },
          ]}
        />
      </Show>
      <Show when={client()}>
        {(ref) => (
          <Items
            items={[
              {
                value: "client",
                label: `${ref().name} から投稿`,
                icon: "i-material-symbols:apps-rounded",
              },
            ]}
          />
        )}
      </Show>
    </>
  );
  const labelId = createUniqueId();
  const [sheetOpen, setSheetOpen] = createSignal(props.defaultOpen === true);
  const sheet = () => props.sheet ?? !canHover();
  // シートが閉じきってから処理する。閉じる動きの間はシートのフォーカストラップが残り、
  // 開いた先（ダイアログ・絵文字のピッカー）からフォーカスを奪い返す。ピッカーはそれを
  // 外を触られたとみなして、開いた途端に閉じる。
  let picked: string | undefined;
  const pickInSheet = (value: string) => {
    picked = value;
    setSheetOpen(false);
  };
  const afterSheetClosed = () => {
    const value = picked;
    picked = undefined;
    if (value !== undefined) select(value);
  };

  return (
    // 開いた絵文字のピッカーは body の末尾に出て、この中に開いた印が残らない。印を出さないと、
    // チャットの道具列（開いているものがある間だけ出る）が隠れ、ピッカーが出る位置を失う。
    <span class="relative shrink-0" data-state={picking() ? "open" : undefined}>
      {/*
        閉じている間は中身を作らない。投稿 1 件ごとにメニューがあるので、
        作り続けるとカラム 1 本で DOM が 200 要素単位で増える。
      */}
      <Show
        when={sheet()}
        fallback={
          <Menu.Root
            lazyMount
            unmountOnExit
            defaultOpen={props.defaultOpen}
            positioning={itemMenuPositioning}
            onSelect={(details) => select(details.value)}
          >
            <Menu.Trigger
              asChild={(triggerProps) => (
                <IconButton
                  {...triggerProps()}
                  ref={(el: HTMLElement) => {
                    trigger = el;
                  }}
                  icon="i-material-symbols:more-vert"
                  label="この投稿の操作"
                />
              )}
            />
            <Portal>
              <Menu.Positioner>
                <Menu.Content class={`${menuContentClass} w-64`}>
                  <Menu.ItemGroup>
                    <Menu.ItemGroupLabel class={menuGroupLabelClass}>
                      このイベント
                    </Menu.ItemGroupLabel>
                    {eventSection()}
                  </Menu.ItemGroup>
                  <Menu.Separator class={menuSeparatorClass} />
                  <Show
                    when={canHover()}
                    fallback={
                      <Menu.ItemGroup>
                        <Menu.ItemGroupLabel
                          class={`${menuGroupLabelClass} truncate`}
                        >
                          {authorLabel()}
                        </Menu.ItemGroupLabel>
                        <Items items={authorItems()} />
                      </Menu.ItemGroup>
                    }
                  >
                    {/* 触る端末にはホバーが無く、入れ子のメニューを開けないので 1 枚に並べる。 */}
                    <Menu.Root
                      lazyMount
                      unmountOnExit
                      defaultOpen={props.defaultAuthorOpen}
                      positioning={nestedMenuPositioning}
                      onSelect={(details) => select(details.value)}
                    >
                      <Menu.TriggerItem class={menuItemClass}>
                        <Avatar
                          pubkey={props.event.pubkey}
                          picture={profile()?.picture}
                          class="size-4 rounded-full"
                        />
                        <span class="min-w-0 flex-1 truncate">
                          {authorHandle()}
                        </span>
                        <span
                          class="i-material-symbols:chevron-right-rounded size-4 shrink-0"
                          aria-hidden="true"
                        />
                      </Menu.TriggerItem>
                      <Portal>
                        <Menu.Positioner>
                          <Menu.Content class={`${menuContentClass} w-64`}>
                            <Menu.ItemGroup>
                              <Menu.ItemGroupLabel
                                class={`${menuGroupLabelClass} truncate`}
                              >
                                {authorLabel()}
                              </Menu.ItemGroupLabel>
                              <Items items={authorItems()} />
                            </Menu.ItemGroup>
                          </Menu.Content>
                        </Menu.Positioner>
                      </Portal>
                    </Menu.Root>
                  </Show>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        }
      >
        <SheetPick.Provider value={pickInSheet}>
          <Drawer.Root
            lazyMount
            unmountOnExit
            open={sheetOpen()}
            onOpenChange={(details) => setSheetOpen(details.open)}
            onExitComplete={afterSheetClosed}
            swipeDirection="down"
          >
            <Drawer.Trigger
              asChild={(triggerProps) => (
                <IconButton
                  {...triggerProps()}
                  ref={(el: HTMLElement) => {
                    trigger = el;
                  }}
                  icon="i-material-symbols:more-vert"
                  label="この投稿の操作"
                />
              )}
            />
            <Portal>
              <Drawer.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
              <Drawer.Positioner class="fixed inset-0">
                <Drawer.Content class={sheetContentClass}>
                  <Drawer.Grabber class="flex shrink-0 justify-center py-2">
                    <Drawer.GrabberIndicator class="h-1 w-10 rounded-full bg-ui-4" />
                  </Drawer.Grabber>
                  <Drawer.Title class="sr-only">この投稿の操作</Drawer.Title>
                  {/* 項目が多いときは、シートの中だけ流す。ホームバーを避けて下に余白を取る。 */}
                  <div class="min-h-0 overflow-y-auto overscroll-contain px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                    <div role="group" aria-labelledby={`${labelId}-event`}>
                      <span
                        id={`${labelId}-event`}
                        class={sheetGroupLabelClass}
                      >
                        このイベント
                      </span>
                      {eventSection()}
                    </div>
                    <hr class={`${menuSeparatorClass} border-0 border-t`} />
                    <div role="group" aria-labelledby={`${labelId}-author`}>
                      <span
                        id={`${labelId}-author`}
                        class={`${sheetGroupLabelClass} truncate`}
                      >
                        {authorLabel()}
                      </span>
                      <Items items={authorItems()} />
                    </div>
                  </div>
                </Drawer.Content>
              </Drawer.Positioner>
            </Portal>
          </Drawer.Root>
        </SheetPick.Provider>
      </Show>
      {/* アクション欄に絵文字の開き口を出していないときは、このメニューの位置に開く。 */}
      <Show when={picking()}>
        <ReactionPicker
          target={props.event}
          anchor={() => trigger}
          open={picking()}
          onOpenChange={setPicking}
        />
      </Show>
      {dialogs.view}
      <Show when={authorRelays()}>
        <AuthorRelaysDialog
          pubkey={props.event.pubkey}
          onClose={() => setAuthorRelays(false)}
        />
      </Show>
      <Show when={showingClient() && client()}>
        {(ref) => (
          <ClientDialog
            event={props.event}
            client={ref()}
            onClose={() => setShowingClient(false)}
          />
        )}
      </Show>
      <Show when={addingToList()}>
        <AddToListDialog
          pubkey={props.event.pubkey}
          onClose={() => setAddingToList(false)}
        />
      </Show>
    </span>
  );
};

export default EventMenu;
