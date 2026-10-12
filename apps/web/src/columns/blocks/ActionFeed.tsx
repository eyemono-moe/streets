import { columnFacets } from "@streets/core/deck/column-kinds";
import { columnShow, groupsActions } from "@streets/core/deck/deck";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type NostrSource,
  PAGE_SIZE,
  SECTION_WINDOW,
} from "@streets/core/read/source";
import { visibleColumnItems } from "@streets/core/view/column-items";
import {
  type NotificationRow,
  actionRowsByTarget,
  actionTarget,
  rowAuthor,
} from "@streets/core/view/notification-rows";
import {
  type Component,
  ErrorBoundary,
  type JSX,
  Match,
  Show,
  Switch,
  createEffect,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useListsUnderWarning } from "../../content-warning-setting";
import OlderLoader from "../../deck/OlderLoader";
import ActionNotice from "../../note/ActionNotice";
import Event, { BrokenEvent, type EventSize } from "../../note/Event";
import VirtualList from "../../ui/VirtualList";
import { createBlockSection, useColumnScope } from "../column-scope";
import { type ListWindow, NewerEdge, listWindow } from "../list-window";

/**
 * 誰かのリアクション・リポストを並べる。同じノートへの同じ操作は、届いた順が
 * 離れていても 1 行にまとめる（カラムの設定で切れる）。
 *
 * 相手の著者・スレッドがミュートに当たる行は、タグで分かるので出さない。語や
 * ハッシュタグは相手のノートが届くまで分からないので、行は残して中身だけを畳む ——
 * 届いてから行ごと消すと、読んでいる一覧が動く。
 */
const ActionFeed: Component<{
  source: () => NostrSource | undefined;
}> = (props) => {
  const scope = useColumnScope();
  const section = createBlockSection({
    source: () => props.source(),
    pageSize: PAGE_SIZE,
    windowSize: SECTION_WINDOW,
  });
  const listsUnderWarning = useListsUnderWarning();
  const column = () => scope.column();
  const size = () =>
    column().density === "compact" ? "compact" : ("normal" as const);
  const expandMedia = () => column().expandMedia !== false;

  const visible = (events: NostrEvent[]) =>
    visibleColumnItems(
      events.filter(listsUnderWarning),
      columnShow(column()),
      columnFacets(column()),
    );
  const items = () => visible(section.items());

  const [rows, setRows] = createStore<{ list: NotificationRow[] }>({
    list: [],
  });
  createEffect(() => {
    setRows(
      "list",
      reconcile(actionRowsByTarget(items(), groupsActions(column())), {
        key: "key",
      }),
    );
  });

  return (
    <ActionFeedView
      rows={rows.list}
      settled={section.status().phase === "settled"}
      size={size()}
      expandMedia={expandMedia()}
      windowing={listWindow(section, visible)}
      header={<NewerEdge section={section} />}
      footer={
        <OlderLoader paging={section.paging()} onReach={section.loadMore} />
      }
    />
  );
};

/** 並べる部分。読み取りから切り離し、Storybook で行の並びを確かめられるようにする。 */
export const ActionFeedView: Component<{
  rows: readonly NotificationRow[];
  /** 取り終えたか。行が無いとき、「まだ無い」と「読み込み中」を分ける。 */
  settled: boolean;
  size: EventSize;
  expandMedia: boolean;
  /** 持つ件数の上限に関わる、一覧への指示。 */
  windowing?: ListWindow;
  /** 一覧の上に置くもの（新しいページの取り直し）。 */
  header?: JSX.Element;
  /** 一覧の下に置くもの（古いページの取り足し）。 */
  footer?: JSX.Element;
}> = (props) => (
  <Switch>
    <Match when={props.rows.length > 0}>
      {props.header}
      <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
        <VirtualList
          items={props.rows}
          itemKey={(row) => row.key}
          followsStart={props.windowing?.followsStart}
          newer={{
            noun: "反応",
            authorOf: rowAuthor,
            pending: props.windowing?.pending,
            latest: props.windowing?.latest,
          }}
          onAtStart={props.windowing?.onAtStart}
          class="[&>*]:border-primary [&>*]:border-b"
        >
          {(row) => (
            <ErrorBoundary
              fallback={(error) => {
                console.error("反応を描けませんでした", row.key, error);
                return <BrokenEvent />;
              }}
            >
              <Show
                when={row.type === "group" ? row.events : undefined}
                fallback={
                  <Show when={row.type === "event" && row.event}>
                    {(event) => (
                      <Show
                        when={actionTarget(event())}
                        fallback={
                          <Event
                            event={event()}
                            size={props.size}
                            expandMedia={props.expandMedia}
                          />
                        }
                      >
                        <ActionNotice
                          events={[event()]}
                          size={props.size}
                          expandMedia={props.expandMedia}
                          gateMuted
                        />
                      </Show>
                    )}
                  </Show>
                }
              >
                {(events) => (
                  <ActionNotice
                    events={events()}
                    size={props.size}
                    expandMedia={props.expandMedia}
                    gateMuted
                  />
                )}
              </Show>
            </ErrorBoundary>
          )}
        </VirtualList>
      </div>
      {props.footer}
    </Match>
    <Match when={props.settled}>
      <p class="c-secondary p-4 text-caption">まだ反応がありません。</p>
    </Match>
    <Match when={true}>
      <p class="c-secondary p-4 text-caption">読み込み中…</p>
    </Match>
  </Switch>
);

export default ActionFeed;
