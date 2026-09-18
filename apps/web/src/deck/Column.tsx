import { Collapsible } from "@ark-ui/solid/collapsible";
import { Drawer } from "@ark-ui/solid/drawer";
import { columnAlerts } from "@streets/core/deck/column-alerts";
import { columnFacets } from "@streets/core/deck/column-facets";
import {
  type ColumnStackState,
  columnStackTransition,
  emptyColumnStack,
  openLayers,
} from "@streets/core/deck/column-stack";
import {
  type ColumnDef,
  columnShow,
  groupsNotifications,
} from "@streets/core/deck/deck";
import { excludeOwnActions } from "@streets/core/deck/notification-filter";
import { resolveSource } from "@streets/core/deck/resolve-source";
import { followeesFrom, followersFrom } from "@streets/core/nostr/follow-list";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { createSection } from "@streets/core/solid/create-section";
import { visibleColumnItems } from "@streets/core/view/column-items";
import {
  type NotificationRow,
  actionTarget,
  notificationRows,
} from "@streets/core/view/notification-rows";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { setDiagnostics } from "../devtools/diagnostics";
import ActionNotice from "../note/ActionNotice";
import Event from "../note/Event";
import ProfileHeader from "../profile/ProfileHeader";
import ProfileList from "../profile/ProfileList";
import { useMutes } from "../settings/MuteMediator";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";
import ColumnSettings from "./ColumnSettings";
import ColumnTitle, { useColumnTitle } from "./ColumnTitle";
import ThreadView from "./ThreadView";
import { columnMeta } from "./column-meta";

/** 重ねられている間だけ渡る。戻る・開き直すはイベントとして下のカラムへ渡す。 */
export type StackedColumn = {
  /** 戻った先の名前。ヘッダーの説明に出す。 */
  /** 戻る先（1 段下）のカラム。題名は `ColumnTitle` で中身から決める。 */
  backTo: ColumnDef;
};

export type ColumnProps = {
  column: ColumnDef;
  readLayer: ReadLayer;
  viewer: string;
  followees: () => readonly string[];
  relayList: () => RelayListState;
  bookmarks: () => readonly string[];
  settingsOpen: boolean;
  /** ヘッダーを掴んで並べ替えられるか。 */
  draggable?: boolean;
  /** URL から開いたカラム。保存されていないので、残すか閉じるかを選ばせる。 */
  temporary?: boolean;
  /** モバイルでは題名をタブが持つので、アクセント線とヘッダーを出さない。 */
  chrome?: boolean;
  /** 重ねられている間だけ渡る。ヘッダーが「戻る」側に変わる。 */
  stacked?: StackedColumn;
};

const Header: Component<{
  column: ColumnDef;
  open: boolean;
  draggable?: boolean;
  temporary?: boolean;
  /** 題名を押したとき。ヘッダーの空いたところを押したときも同じにする（外側で拾う）。 */
  onTitle: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  const meta = () => columnMeta(props.column);
  return (
    // ヘッダーを掴んでカラムを並べ替える。本文まで draggable にすると本文を選べなくなる。
    <header
      class="flex h-11.25 shrink-0 items-center gap-2.5 bg-primary px-3"
      classList={{ "cursor-grab": props.draggable === true }}
      draggable={props.draggable === true}
      onDragStart={(event) => {
        event.dataTransfer?.setData("text/plain", props.column.id);
        dispatch({ type: "deck/drag-start", id: props.column.id });
      }}
      // 落とし先の外で離しても、掴んだままの見た目を残さない。
      onDragEnd={() => dispatch({ type: "deck/drag-end" })}
    >
      <span
        class={`c-secondary size-4.5 shrink-0 ${meta().icon}`}
        aria-hidden="true"
      />
      {/* 題名はボタンにして、キーボードからも先頭へ戻れるようにする。 */}
      <button
        type="button"
        title="先頭へ戻る"
        class="flex min-w-0 flex-1 cursor-pointer flex-col bg-transparent p-0 text-left"
        onClick={() => props.onTitle()}
      >
        <h2 class="w-full truncate font-600 text-body">
          <ColumnTitle column={props.column} />
        </h2>
        <p class="c-secondary w-full truncate text-caption">
          {meta().subtitle}
        </p>
      </button>
      <Show when={props.temporary}>
        <>
          <button
            type="button"
            class="c-secondary flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-2.5 font-600 text-caption"
            onClick={() => dispatch({ type: "deck/keep-temp" })}
          >
            <span
              class="i-material-symbols:bookmark-outline-rounded size-3.5"
              aria-hidden="true"
            />
            カラムに残す
          </button>
          <button
            type="button"
            aria-label="閉じる"
            class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
            onClick={() => dispatch({ type: "deck/close-temp" })}
          >
            <span
              class="i-material-symbols:close-rounded size-4.5"
              aria-hidden="true"
            />
          </button>
        </>
      </Show>
      <Show when={!props.temporary}>
        <button
          type="button"
          aria-label="カラムの設定"
          aria-expanded={props.open}
          class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
          onClick={() =>
            dispatch({ type: "deck/toggle-settings", id: props.column.id })
          }
        >
          <span
            class="size-4.5"
            classList={{
              "i-material-symbols:more-horiz": !props.open,
              "i-material-symbols:close-rounded": props.open,
            }}
            aria-hidden="true"
          />
        </button>
      </Show>
    </header>
  );
};

/** 重ねられたカラムのヘッダー。戻る操作と、正規のカラムとして開く導線を持つ。 */
const StackedHeader: Component<{
  column: ColumnDef;
  stacked: StackedColumn;
  onTitle: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードからは題名のボタンで先頭へ戻る
    <header
      class="flex h-11.25 shrink-0 items-center gap-2.5 bg-primary px-3"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) {
          return;
        }
        props.onTitle();
      }}
    >
      <button
        type="button"
        aria-label="戻る"
        class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
        onClick={() => dispatch({ type: "stack/back" })}
      >
        <span
          class="i-material-symbols:chevron-left-rounded size-5.5"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        title="先頭へ戻る"
        class="flex min-w-0 flex-1 cursor-pointer flex-col bg-transparent p-0 text-left"
        onClick={() => props.onTitle()}
      >
        <h2 class="w-full truncate font-600 text-body">
          <ColumnTitle column={props.column} />
        </h2>
        <p class="c-secondary w-full truncate text-caption">
          <ColumnTitle column={props.stacked.backTo} />
          に戻る
        </p>
      </button>
      <button
        type="button"
        aria-label="デッキのカラムとして開く"
        title="デッキのカラムとして開く"
        class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
        onClick={() =>
          dispatch({ type: "deck/add-column", column: props.column })
        }
      >
        <span
          class="i-material-symbols:open-in-new-rounded size-4.5"
          aria-hidden="true"
        />
      </button>
    </header>
  );
};

/**
 * デッキの 1 列。カラムの上にはカラムを重ねられる（スタック）。重ねるものは
 * ただのカラム定義で、スレッドもユーザー詳細も外から見れば同じ「カラム」。
 */
const Column: Component<ColumnProps> = (props) => {
  // スレッドのカラムは `ThreadView` が自分で購読する（根は store から決まる）。
  const threadFocus = () =>
    props.column.source.kind === "thread"
      ? props.column.source.focus
      : undefined;
  // ユーザーのカラムは、投稿の上にプロフィールを出す。
  const profilePubkey = () =>
    props.column.source.kind === "user"
      ? props.column.source.pubkey
      : undefined;
  /** フォロー・フォロワーのカラムが並べる人。kind:3 から取り出す。 */
  const people = (): readonly string[] | undefined => {
    const source = props.column.source;
    if (source.kind === "followees-list") {
      return followeesFrom(section.items()[0]);
    }
    if (source.kind === "followers-list") return followersFrom(section.items());
    return undefined;
  };
  const section = createSection({
    manager: props.readLayer.manager,
    // ウォームアップの結果を memo の外で読むと、settle のたびに全カラムの購読が張り直される。
    source: () =>
      resolveSource(props.column.source, {
        followees: props.followees,
        viewer: props.viewer,
        relayList: props.relayList,
        bookmarks: props.bookmarks,
      }),
  });
  const show = () => columnShow(props.column);
  const facets = () => columnFacets(props.column);
  // 通知は自分宛（#p）で集めるので、自分の返信やリアクションも混ざる。自分の操作は知らせない。
  const mutes = useMutes();
  // ミュートは流れてくるものだけに当てる。人のページ・スレッド・ブックマークは
  // 自分で開いたものなので隠さない。
  const hidesMuted = () =>
    props.column.source.kind === "followees" ||
    props.column.source.kind === "notifications" ||
    props.column.source.kind === "literal";
  const received = () => {
    const items =
      props.column.source.kind === "notifications"
        ? excludeOwnActions(section.items(), props.viewer)
        : section.items();
    return mutes && hidesMuted()
      ? items.filter((event) => !mutes.hides(event))
      : items;
  };
  const items = () => visibleColumnItems(received(), show(), facets());

  // 通知は行に並べ直す（同じノートへの連続したリアクション・リポストを 1 行にまとめる）。
  // 行は key ごとに突き合わせる。まとまりに 1 件足されるたびに行を作り直すと、
  // 対象のノートを取り直し、並べたアイコンもちらつく。
  const isNotifications = () => props.column.source.kind === "notifications";
  const [rows, setRows] = createStore<{ list: NotificationRow[] }>({
    list: [],
  });
  createEffect(() => {
    if (!isNotifications()) return;
    setRows(
      "list",
      reconcile(notificationRows(items(), groupsNotifications(props.column)), {
        key: "key",
      }),
    );
  });
  const alerts = () =>
    columnAlerts(props.column, section.status(), props.relayList());
  const size = () =>
    props.column.density === "compact" ? "compact" : ("normal" as const);
  const expandMedia = () => props.column.expandMedia !== false;

  // 重ねたカラム。いちばん下のカラムが持ち、デッキには保存しない。
  // 遷移は core の純粋関数で、ここは結果を store へ当てるだけ。reconcile で段を key ごとに
  // 突き合わせるので、開閉しても段の Drawer は作り直されず、閉じる動きが残る。
  const [stack, setStack] = createStore<ColumnStackState>(emptyColumnStack());
  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "stack/open":
      case "stack/back":
      case "stack/closed":
        setStack(
          reconcile(columnStackTransition(unwrap(stack), event), {
            key: "key",
          }),
        );
        return true;
      default:
        return false;
    }
  };
  const opened = () => openLayers(stack).length > 0;

  createEffect(() =>
    setDiagnostics("sections", props.column.id, {
      ...section.status(),
      items: section.items().length,
    }),
  );

  // 中身は関数にして、下の provider の中で作る。Solid の context は
  // 「要素を作った場所」で決まるので、外で組み立てると provider が届かない。
  const events = () => (
    <Switch>
      <Match when={items().length > 0}>
        {/*
          区切りは投稿ごとの下線で引く。親の背景を 1px の隙間から覗かせる引き方は、
          content-visibility を当てた投稿が端数の位置で丸められると消えることがある。
        */}
        <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
          <Show
            when={isNotifications()}
            fallback={
              <For each={items()}>
                {(event) => (
                  <Event
                    event={event}
                    size={size()}
                    expandMedia={expandMedia()}
                  />
                )}
              </For>
            }
          >
            <For each={rows.list}>
              {(row) => (
                <Show
                  when={row.type === "group" && row}
                  fallback={
                    <Show when={row.type === "event" && row}>
                      {(single) => (
                        <Show
                          when={actionTarget(single().event)}
                          fallback={
                            <Event
                              event={single().event}
                              size={size()}
                              expandMedia={expandMedia()}
                            />
                          }
                        >
                          <ActionNotice
                            events={[single().event]}
                            size={size()}
                            expandMedia={expandMedia()}
                          />
                        </Show>
                      )}
                    </Show>
                  }
                >
                  {(group) => (
                    <ActionNotice
                      events={group().events}
                      size={size()}
                      expandMedia={expandMedia()}
                    />
                  )}
                </Show>
              )}
            </For>
          </Show>
        </div>
      </Match>
      <Match when={section.status().phase === "settled"}>
        <p class="c-secondary p-4 text-caption">まだ投稿がありません。</p>
      </Match>
      <Match when={true}>
        <p class="c-secondary p-4 text-caption">読み込み中…</p>
      </Match>
    </Switch>
  );

  let scroller: HTMLDivElement | undefined;
  const scrollToTop = () =>
    scroller?.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  // 重なっている間は 1 段戻る（ダイアログの外側を押した扱い）。重なっていなければ
  // 一覧の先頭（最新）へ戻る。
  const onHeader = () =>
    opened() ? handle({ type: "stack/back" }) : scrollToTop();

  const body = () => (
    <div ref={scroller} class="min-h-0 flex-1 overflow-y-auto">
      <Switch fallback={events()}>
        <Match when={threadFocus()}>
          {(focus) => (
            <ThreadView
              focus={focus()}
              readLayer={props.readLayer}
              expandMedia={expandMedia()}
            />
          )}
        </Match>
        <Match when={profilePubkey()}>
          {(pubkey) => (
            <>
              <ProfileHeader pubkey={pubkey()} readLayer={props.readLayer} />
              {events()}
            </>
          )}
        </Match>
        <Match when={people()}>
          {(people) => (
            <ProfileList
              people={people()}
              settled={section.status().phase === "settled"}
              empty={
                props.column.source.kind === "followers-list"
                  ? "フォロワーを取得できませんでした。"
                  : "まだ誰もフォローしていません。"
              }
            />
          )}
        </Match>
      </Switch>
    </div>
  );

  const chrome = () => (
    <>
      <Show when={props.chrome !== false && !props.stacked}>
        <div class="h-0.75 shrink-0 bg-accent-primary" />
      </Show>
      <Show
        when={props.stacked}
        fallback={
          <Show when={props.chrome !== false}>
            {/*
              ヘッダーの空いたところを押したとき。重なっている間は 1 段戻り、
              そうでなければ先頭へ戻る（題名のボタンと同じ）。
            */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: キーボードからは題名のボタンと「戻る」ボタンで操作する */}
            <div
              onClick={(event) => {
                const target = event.target;
                if (target instanceof Element && target.closest("button")) {
                  return;
                }
                onHeader();
              }}
            >
              <Header
                column={props.column}
                open={props.settingsOpen}
                draggable={props.draggable}
                temporary={props.temporary}
                onTitle={onHeader}
              />
            </div>
          </Show>
        }
      >
        {(stacked) => (
          <StackedHeader
            column={props.column}
            stacked={stacked()}
            onTitle={scrollToTop}
          />
        )}
      </Show>
      {/* 閉じている間は中身を作らない（lazyMount）。カラムの数だけ設定の DOM を持たないため。 */}
      <Collapsible.Root
        open={props.settingsOpen}
        lazyMount
        unmountOnExit
        class="shrink-0"
      >
        <Collapsible.Content class="motion-collapse">
          <ColumnSettings column={props.column} facets={facets()} />
        </Collapsible.Content>
      </Collapsible.Root>
      <For each={alerts()}>
        {(alert) => (
          <p
            role="alert"
            class="c-secondary bg-secondary px-3 py-2 text-caption"
          >
            {alert.message}
            {alert.action ? `。${alert.action}` : ""}
          </p>
        )}
      </For>
    </>
  );

  // 重ねられた側は自分でスタックを持たない。押されたものは下のカラムのスタックへ積む。
  const inner = () => (
    <section
      // 重なりの影が隣のカラムまで伸びないように、カラムの中で切る。
      class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-primary"
      // 保存されていないことを枠で示す。
      classList={{
        "outline outline-2 -outline-offset-2 outline-accent-5":
          props.temporary === true,
      }}
    >
      {chrome()}
      <Show when={!props.stacked} fallback={body()}>
        {/*
          重ねても下のカラムを取り外さない。取り外すとスクロール位置が失われ、
          戻ったときに読んでいた場所が分からなくなる。
        */}
        <div class="relative min-h-0 flex-1">
          {/*
            重ね順は z-index ではなく DOM の順で決める：下のカラム → 外側 → 重ねたカラム。
            中の重ね順（sticky なアイコンなど）が外へ漏れないよう、段ごとに isolate する。
          */}
          <div class="absolute inset-0 isolate flex flex-col">{body()}</div>
          <Show when={stack.layers.length > 0}>
            {/* 覗いている部分＝重なりの外側。押したら 1 段戻る（ダイアログと同じ勘）。 */}
            <button
              type="button"
              aria-label="重ねた表示を閉じる"
              class="motion-fade absolute inset-0 w-full cursor-pointer bg-ui-950/25"
              data-state={opened() ? "open" : "closed"}
              onClick={() => handle({ type: "stack/back" })}
            />
          </Show>
          <For each={stack.layers}>
            {(layer, index) => {
              const layerTitle = useColumnTitle(() => layer.column);
              return (
                <Drawer.Root
                  open={layer.open}
                  onOpenChange={(details) => {
                    // Escape とスワイプは、開いている一番上の段にしか届かない。
                    if (!details.open) handle({ type: "stack/back" });
                  }}
                  onExitComplete={() =>
                    handle({ type: "stack/closed", key: layer.key })
                  }
                  lazyMount
                  unmountOnExit
                  // カラムの中の重なりなので、デッキの他のカラムは触れたままにする。
                  modal={false}
                  trapFocus={false}
                  preventScroll={false}
                  // 外側は上の暗幕が受ける。他のカラムを押しただけで閉じないように切る。
                  closeOnInteractOutside={false}
                  swipeDirection="down"
                >
                  {/* 下の段も隠さない。段ごとにずらして重ね、深さが見えるようにする。 */}
                  <Drawer.Positioner class="absolute inset-0 isolate">
                    <Drawer.Content
                      aria-label={layerTitle()}
                      // 影だけではダークモードで沈むので、上辺の枠線でも縁を見せる。
                      class="motion-stack absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-3 border-primary border-t bg-primary shadow-[0_-10px_30px_rgba(0,0,0,0.28)] outline-none transition-transform duration-180 ease-out dark:shadow-[0_-10px_30px_rgba(0,0,0,0.7)]"
                      // 段ごとに少しずつ下げて、下のカラムが覗くようにする（上限 3 段ぶん）。
                      style={{ top: `${Math.min(index() + 1, 3) * 8}px` }}
                    >
                      <Column
                        {...props}
                        column={layer.column}
                        settingsOpen={false}
                        draggable={false}
                        temporary={false}
                        stacked={{
                          backTo:
                            index() > 0
                              ? (stack.layers[index() - 1]?.column ??
                                props.column)
                              : props.column,
                        }}
                      />
                    </Drawer.Content>
                  </Drawer.Positioner>
                </Drawer.Root>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );

  // 重ねられた側は自分のスタックを持たず、イベントは下のカラムの段がそのまま裁定する。
  return props.stacked ? (
    inner()
  ) : (
    <Mediates handle={handle}>{inner()}</Mediates>
  );
};

export default Column;
