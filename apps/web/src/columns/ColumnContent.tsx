import { columnAlerts } from "@streets/core/deck/column-alerts";
import { columnFacets } from "@streets/core/deck/column-facets";
import { type ColumnDef, columnShow } from "@streets/core/deck/deck";
import { excludeOwnActions } from "@streets/core/deck/notification-filter";
import { resolveSource } from "@streets/core/deck/resolve-source";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { PAGE_SIZE } from "@streets/core/read/source";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { createSection } from "@streets/core/solid/create-section";
import { visibleColumnItems } from "@streets/core/view/column-items";
import { eventActivity } from "@streets/core/view/event-activity";
import {
  type Component,
  ErrorBoundary,
  For,
  Match,
  Switch,
  createEffect,
} from "solid-js";
import { setDiagnostics } from "../devtools/diagnostics";
import ProfileHeader from "../profile/ProfileHeader";
import { useMutes } from "../settings/MuteMediator";
import ActivityColumn from "./ActivityColumn";
import EventListColumn from "./EventListColumn";
import PeopleColumn from "./PeopleColumn";
import ThreadColumn from "./ThreadColumn";

export type ColumnContentProps = {
  column: ColumnDef;
  readLayer: ReadLayer;
  viewer: string;
  followees: () => readonly string[];
  relayList: () => RelayListState;
  bookmarks: () => readonly string[];
  scrollerRef: (element: HTMLDivElement) => void;
};

/** source ごとの本文を選ぶ。個々の表示規則は各カラムのモジュールに置く。 */
const ColumnContent: Component<ColumnContentProps> = (props) => {
  const source = () => props.column.source;
  const paged = ![
    "followees-list",
    "followers-list",
    "thread",
    "activity",
  ].includes(source().kind);
  const section = createSection({
    manager: props.readLayer.manager,
    pageSize: paged ? PAGE_SIZE : undefined,
    source: () =>
      resolveSource(source(), {
        followees: props.followees,
        viewer: props.viewer,
        relayList: props.relayList,
        bookmarks: props.bookmarks,
      }),
  });
  const mutes = useMutes();
  const received = () => {
    const current = source();
    const events =
      current.kind === "notifications"
        ? excludeOwnActions(section.items(), props.viewer)
        : section.items();
    const hidesMuted =
      current.kind === "followees" ||
      current.kind === "notifications" ||
      current.kind === "literal";
    return mutes && hidesMuted
      ? events.filter((event) => !mutes.hides(event))
      : events;
  };
  const items = () =>
    visibleColumnItems(
      received(),
      columnShow(props.column),
      columnFacets(props.column),
    );
  const threadFocus = () => {
    const current = source();
    return current.kind === "thread" ? current.focus : undefined;
  };
  const activity = () => {
    const current = source();
    return current.kind === "activity" ? current.target : undefined;
  };
  const profilePubkey = () => {
    const current = source();
    return current.kind === "user" ? current.pubkey : undefined;
  };

  createEffect(() =>
    setDiagnostics("sections", props.column.id, {
      ...section.status(),
      items: section.items().length,
    }),
  );

  const events = () => (
    <EventListColumn
      column={props.column}
      items={items()}
      section={section}
      paged={paged}
    />
  );

  return (
    <>
      <For
        each={columnAlerts(props.column, section.status(), props.relayList())}
      >
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
      <div
        ref={props.scrollerRef}
        class="min-h-0 flex-1"
        classList={{
          "flex flex-col overflow-hidden": activity() !== undefined,
          "overflow-y-auto overscroll-y-contain": activity() === undefined,
        }}
      >
        <ErrorBoundary
          fallback={(error, reset) => {
            console.error("カラムを描けませんでした", props.column.id, error);
            return (
              <div class="c-secondary flex flex-col items-start gap-2 p-4 text-caption">
                <p>このカラムを表示できませんでした。</p>
                <button
                  type="button"
                  class="c-primary cursor-pointer rounded-full border border-primary bg-primary px-3 py-1 font-600 hover:bg-secondary"
                  onClick={reset}
                >
                  もう一度表示する
                </button>
              </div>
            );
          }}
        >
          <Switch fallback={events()}>
            <Match when={threadFocus()}>
              {(focus) => (
                <ThreadColumn
                  focus={focus()}
                  readLayer={props.readLayer}
                  expandMedia={props.column.expandMedia !== false}
                />
              )}
            </Match>
            <Match when={activity()}>
              {(target) => (
                <ActivityColumn
                  activity={eventActivity(section.items(), target())}
                  settled={section.status().phase === "settled"}
                  incomplete={section.status().incomplete !== undefined}
                />
              )}
            </Match>
            <Match when={profilePubkey()}>
              {(pubkey) => (
                <>
                  <ProfileHeader
                    pubkey={pubkey()}
                    readLayer={props.readLayer}
                  />
                  {events()}
                </>
              )}
            </Match>
            <Match when={source().kind === "followees-list"}>
              <PeopleColumn
                kind="followees-list"
                events={section.items()}
                status={section.status()}
              />
            </Match>
            <Match when={source().kind === "followers-list"}>
              <PeopleColumn
                kind="followers-list"
                events={section.items()}
                status={section.status()}
              />
            </Match>
          </Switch>
        </ErrorBoundary>
      </div>
    </>
  );
};

export default ColumnContent;
