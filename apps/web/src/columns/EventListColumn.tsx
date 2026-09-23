import { type ColumnDef, groupsNotifications } from "@streets/core/deck/deck";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Section } from "@streets/core/solid/create-section";
import {
  type NotificationRow,
  actionTarget,
  notificationRows,
} from "@streets/core/view/notification-rows";
import {
  type Component,
  ErrorBoundary,
  Match,
  Show,
  Switch,
  createEffect,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import OlderLoader from "../deck/OlderLoader";
import ActionNotice from "../note/ActionNotice";
import Event, { BrokenEvent } from "../note/Event";
import VirtualList from "../ui/VirtualList";
import ZapNotice from "../zap/ZapNotice";

/** 投稿または通知を並べ、必要なら古いページを取り足す。 */
const EventListColumn: Component<{
  column: ColumnDef;
  items: readonly NostrEvent[];
  section: Section;
  paged: boolean;
}> = (props) => {
  const notifications = () => props.column.source.kind === "notifications";
  const size = () =>
    props.column.density === "compact" ? "compact" : ("normal" as const);
  const expandMedia = () => props.column.expandMedia !== false;
  const [rows, setRows] = createStore<{ list: NotificationRow[] }>({
    list: [],
  });

  createEffect(() => {
    if (!notifications()) return;
    setRows(
      "list",
      reconcile(
        notificationRows(props.items, groupsNotifications(props.column)),
        { key: "key" },
      ),
    );
  });

  return (
    <Switch>
      <Match when={props.items.length > 0}>
        <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
          <Show
            when={notifications()}
            fallback={
              <VirtualList
                items={props.items}
                itemKey={(event) => event.id}
                class="[&>*]:border-primary [&>*]:border-b"
              >
                {(event) => (
                  <Event
                    event={event}
                    size={size()}
                    expandMedia={expandMedia()}
                    replyContext
                  />
                )}
              </VirtualList>
            }
          >
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
          </Show>
        </div>
        <Show when={props.paged}>
          <OlderLoader
            paging={props.section.paging()}
            ready={props.section.status().phase === "settled"}
            onReach={props.section.loadMore}
          />
        </Show>
      </Match>
      <Match when={props.section.status().phase === "settled"}>
        <p class="c-secondary p-4 text-caption">まだ投稿がありません。</p>
      </Match>
      <Match when={true}>
        <p class="c-secondary p-4 text-caption">読み込み中…</p>
      </Match>
    </Switch>
  );
};

export default EventListColumn;
