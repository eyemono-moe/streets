import { columnFacets } from "@streets/core/deck/column-kinds";
import { columnShow, groupsNotifications } from "@streets/core/deck/deck";
import { excludeOwnActions } from "@streets/core/deck/notification-filter";
import type { NostrEvent } from "@streets/core/nostr/event";
import { type NostrSource, PAGE_SIZE } from "@streets/core/read/source";
import { visibleColumnItems } from "@streets/core/view/column-items";
import {
  type NotificationRow,
  actionTarget,
  notificationRows,
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
import OlderLoader from "../../deck/OlderLoader";
import ActionNotice from "../../note/ActionNotice";
import Event, { BrokenEvent } from "../../note/Event";
import { useMutes } from "../../settings/MuteMediator";
import VirtualList from "../../ui/VirtualList";
import { useOwnZapKey } from "../../zap/own-zap-key";
import ZapNotice from "../../zap/ZapNotice";
import { createBlockSection, useColumnScope } from "../column-scope";

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
  });
  const mutes = useMutes();
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
  const items = () => {
    const received = excludeOwnActions(section.items(), props.viewer).filter(
      genuine,
    );
    const visible = mutes
      ? received.filter((event) => !mutes.hides(event))
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
      reconcile(notificationRows(items(), groupsNotifications(column())), {
        key: "key",
      }),
    );
  });

  return (
    <Switch>
      <Match when={items().length > 0}>
        <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
          <VirtualList
            items={rows.list}
            itemKey={(row) => row.key}
            class="[&>*]:border-primary [&>*]:border-b"
          >
            {(row) => (
              <ErrorBoundary
                fallback={(error) => {
                  console.error("通知を描けませんでした", row.key, error);
                  return <BrokenEvent />;
                }}
              >
                <Show
                  when={row.type === "group" && row}
                  fallback={
                    <Show when={row.type === "event" && row}>
                      {(single) => (
                        <Show
                          when={single().event.kind !== 9735}
                          fallback={
                            <ZapNotice
                              receipt={single().event}
                              size={size()}
                              expandMedia={expandMedia()}
                            />
                          }
                        >
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
