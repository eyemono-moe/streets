import { columnFacets } from "@streets/core/deck/column-kinds";
import { columnShow, groupsActions } from "@streets/core/deck/deck";
import { mutesActionTarget } from "@streets/core/moderation/mute-list";
import { type NostrSource, PAGE_SIZE } from "@streets/core/read/source";
import { visibleColumnItems } from "@streets/core/view/column-items";
import {
  type NotificationRow,
  actionRowsByTarget,
  actionTarget,
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
import { useMutes } from "../../settings/MuteMediator";
import VirtualList from "../../ui/VirtualList";
import { createBlockSection, useColumnScope } from "../column-scope";

/**
 * 誰かのリアクション・リポストを並べる。同じノートへの同じ操作は、届いた順が
 * 離れていても 1 行にまとめる（カラムの設定で切れる）。
 */
const ActionFeed: Component<{
  source: () => NostrSource | undefined;
}> = (props) => {
  const scope = useColumnScope();
  const section = createBlockSection({
    source: () => props.source(),
    pageSize: PAGE_SIZE,
  });
  const mutes = useMutes();
  const listsUnderWarning = useListsUnderWarning();
  const column = () => scope.column();
  const size = () =>
    column().density === "compact" ? "compact" : ("normal" as const);
  const expandMedia = () => column().expandMedia !== false;

  const items = () => {
    const received = section.items().filter(listsUnderWarning);
    const visible = mutes
      ? received.filter(
          (event) =>
            !mutes.hides(event) && !mutesActionTarget(mutes.entries(), event),
        )
      : received;
    return visibleColumnItems(
      visible,
      columnShow(column()),
      columnFacets(column()),
    );
  };

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
  /** 一覧の下に置くもの（古いページの取り足し）。 */
  footer?: JSX.Element;
}> = (props) => (
  <Switch>
    <Match when={props.rows.length > 0}>
      <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
        <VirtualList
          items={props.rows}
          itemKey={(row) => row.key}
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
