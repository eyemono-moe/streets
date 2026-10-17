import { columnFacets } from "@streets/core/deck/column-kinds";
import { columnShow, groupsActions } from "@streets/core/deck/deck";
import { excludeOwnActions } from "@streets/core/deck/notification-filter";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type NostrSource,
  PAGE_SIZE,
  SECTION_WINDOW,
} from "@streets/core/read/source";
import { visibleColumnItems } from "@streets/core/view/column-items";
import {
  type NotificationRow,
  actionTarget,
  notificationRows,
  rowAuthor,
} from "@streets/core/view/notification-rows";
import { parseZapReceipt } from "@streets/core/zap/zap-receipt";
import {
  type Component,
  ErrorBoundary,
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
import MutedGate from "../../note/MutedGate";
import VirtualList from "../../ui/VirtualList";
import { useOwnZapKey } from "../../zap/own-zap-key";
import ZapNotice from "../../zap/ZapNotice";
import { createBlockSection, useColumnScope } from "../column-scope";
import { NewerEdge, listWindow } from "../list-window";

/** 通知の 1 行。まとめた反応・Zap・返信などの投稿を描き分ける。 */
export const NotificationRowView: Component<{
  row: NotificationRow;
  size: EventSize;
  expandMedia: boolean;
  /** ミュートの対象の投稿を畳むか。 */
  foldsMuted: boolean;
}> = (props) => (
  <Show
    when={props.row.type === "group" && props.row}
    fallback={
      <Show when={props.row.type === "event" && props.row}>
        {(single) => (
          <Show
            when={single().event.kind !== 9735}
            fallback={
              <ZapNotice
                receipt={single().event}
                size={props.size}
                expandMedia={props.expandMedia}
              />
            }
          >
            <Show
              when={actionTarget(single().event)}
              fallback={
                <MutedGate
                  event={single().event}
                  active={props.foldsMuted}
                  size={props.size}
                >
                  <Event
                    event={single().event}
                    size={props.size}
                    expandMedia={props.expandMedia}
                  />
                </MutedGate>
              }
            >
              <ActionNotice
                events={[single().event]}
                size={props.size}
                expandMedia={props.expandMedia}
              />
            </Show>
          </Show>
        )}
      </Show>
    }
  >
    {(group) => (
      <ActionNotice
        events={group().events}
        size={props.size}
        expandMedia={props.expandMedia}
      />
    )}
  </Show>
);

/**
 * 自分宛のイベントを通知の行にして並べる。同じノートへの連続した
 * リアクション・リポストは 1 行にまとめる（カラムの設定で切れる）。
 */
const NotificationList: Component<{
  source: () => NostrSource | undefined;
  viewer: string;
}> = (props) => {
  const scope = useColumnScope();
  const section = createBlockSection({
    source: () => props.source(),
    pageSize: PAGE_SIZE,
    windowSize: SECTION_WINDOW,
    // まとめるリアクション・リポストと Zap は 1 行の投稿ではないので畳まない。
    canFold: (event) =>
      event.kind !== 9735 && actionTarget(event) === undefined,
  });
  const listsUnderWarning = useListsUnderWarning();
  const zapKey = useOwnZapKey(() => props.viewer);
  const column = () => scope.column();
  const size = () =>
    column().density === "compact" ? "compact" : ("normal" as const);
  const expandMedia = () => column().expandMedia !== false;

  // 偽の Zap（宛先・金額・受領の署名者が食い違うもの）は通知に並べない。
  const genuine = (event: NostrEvent) =>
    event.kind !== 9735 ||
    parseZapReceipt(event, {
      recipient: props.viewer,
      nostrPubkey: zapKey(),
    }) !== undefined;
  const visible = (events: NostrEvent[]) => {
    const received = excludeOwnActions(events, props.viewer)
      .filter(genuine)
      .filter(listsUnderWarning);
    return visibleColumnItems(
      received,
      columnShow(column()),
      columnFacets(column()),
    );
  };
  const items = () => visible(section.items());
  const windowed = listWindow(section, visible);

  const [rows, setRows] = createStore<{ list: NotificationRow[] }>({
    list: [],
  });
  createEffect(() => {
    setRows(
      "list",
      reconcile(notificationRows(items(), groupsActions(column())), {
        key: "key",
      }),
    );
  });

  return (
    <Switch>
      <Match when={items().length > 0}>
        <NewerEdge section={section} />
        <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
          <VirtualList
            items={rows.list}
            itemKey={(row) => row.key}
            followsStart={windowed.followsStart}
            newer={{
              noun: "通知",
              authorOf: rowAuthor,
              pending: windowed.pending,
              latest: windowed.latest,
            }}
            onAtStart={windowed.onAtStart}
            class="[&>*]:border-primary [&>*]:border-b"
          >
            {(row) => (
              <ErrorBoundary
                fallback={(error) => {
                  console.error("通知を描けませんでした", row.key, error);
                  return <BrokenEvent />;
                }}
              >
                <NotificationRowView
                  row={row}
                  size={size()}
                  expandMedia={expandMedia()}
                  foldsMuted={section.foldsMuted()}
                />
              </ErrorBoundary>
            )}
          </VirtualList>
        </div>
        <OlderLoader paging={section.paging()} onReach={section.loadMore} />
      </Match>
      <Match when={section.status().phase === "settled"}>
        <p class="c-secondary p-4 text-caption">まだ投稿がありません。</p>
      </Match>
      <Match when={true}>
        <p class="c-secondary p-4 text-caption">読み込み中…</p>
      </Match>
    </Switch>
  );
};

export default NotificationList;
