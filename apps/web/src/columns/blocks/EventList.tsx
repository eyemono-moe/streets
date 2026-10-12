import { columnFacets } from "@streets/core/deck/column-kinds";
import { columnShow } from "@streets/core/deck/deck";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type NostrSource,
  PAGE_SIZE,
  SECTION_WINDOW,
} from "@streets/core/read/source";
import { visibleColumnItems } from "@streets/core/view/column-items";
import { type Component, Match, Switch } from "solid-js";
import { useListsUnderWarning } from "../../content-warning-setting";
import OlderLoader from "../../deck/OlderLoader";
import Event from "../../note/Event";
import MutedGate from "../../note/MutedGate";
import VirtualList from "../../ui/VirtualList";
import { createBlockSection, useColumnScope } from "../column-scope";
import { NewerEdge, listWindow } from "../list-window";

/**
 * 取ったイベントを 1 件ずつ `Event` に渡して並べ、古いページを取り足す。
 * 1 件ずつ見て落とす（「表示するもの」・`filter`。ミュートはセクションが当てる）ことはあっても、
 * まとめたり並べ替えたりはしない。
 */
const EventList: Component<{
  source: () => NostrSource | undefined;
  /** 1 件ずつ見て、出さないものを落とす。 */
  filter?: (event: NostrEvent) => boolean;
  name?: string;
  /** source の `until` より新しい方へも取り足す。 */
  pagesNewer?: boolean;
}> = (props) => {
  const scope = useColumnScope();
  const section = createBlockSection({
    source: () => props.source(),
    pageSize: PAGE_SIZE,
    pagesNewer: props.pagesNewer,
    windowSize: SECTION_WINDOW,
    name: props.name,
    canFold: () => true,
  });
  const listsUnderWarning = useListsUnderWarning();
  const column = () => scope.column();
  const size = () =>
    column().density === "compact" ? "compact" : ("normal" as const);
  const expandMedia = () => column().expandMedia !== false;
  const visible = (events: NostrEvent[]) => {
    const filter = props.filter;
    const received = (filter ? events.filter(filter) : events).filter(
      listsUnderWarning,
    );
    return visibleColumnItems(
      received,
      columnShow(column()),
      columnFacets(column()),
    );
  };
  const items = () => visible(section.items());
  const windowed = listWindow(section, visible);

  return (
    <Switch>
      <Match when={items().length > 0}>
        <NewerEdge section={section} />
        <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
          <VirtualList
            items={items()}
            itemKey={(event) => event.id}
            followsStart={windowed.followsStart}
            newer={{
              noun: "投稿",
              authorOf: (event) => event.pubkey,
              pending: windowed.pending,
              latest: windowed.latest,
            }}
            onAtStart={windowed.onAtStart}
            class="[&>*]:border-primary [&>*]:border-b"
          >
            {(event) => (
              <MutedGate
                event={event}
                active={section.foldsMuted()}
                size={size()}
              >
                <Event
                  event={event}
                  size={size()}
                  expandMedia={expandMedia()}
                  replyContext
                />
              </MutedGate>
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

export default EventList;
