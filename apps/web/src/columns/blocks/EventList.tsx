import {
  columnFacets,
  columnHidesMuted,
} from "@streets/core/deck/column-kinds";
import { columnShow } from "@streets/core/deck/deck";
import { type NostrSource, PAGE_SIZE } from "@streets/core/read/source";
import { visibleColumnItems } from "@streets/core/view/column-items";
import { type Component, Match, Switch } from "solid-js";
import { useListsUnderWarning } from "../../content-warning-setting";
import OlderLoader from "../../deck/OlderLoader";
import Event from "../../note/Event";
import { useMutes } from "../../settings/MuteMediator";
import VirtualList from "../../ui/VirtualList";
import { createBlockSection, useColumnScope } from "../column-scope";

/**
 * 取ったイベントを 1 件ずつ `Event` に渡して並べ、古いページを取り足す。
 * 1 件ずつ見て落とす（ミュート・「表示するもの」・カラムの `shows`）ことはあっても、
 * まとめたり並べ替えたりはしない。
 */
const EventList: Component<{
  source: () => NostrSource | undefined;
  name?: string;
}> = (props) => {
  const scope = useColumnScope();
  const section = createBlockSection({
    source: () => props.source(),
    pageSize: PAGE_SIZE,
    name: props.name,
  });
  const mutes = useMutes();
  const listsUnderWarning = useListsUnderWarning();
  const column = () => scope.column();
  const size = () =>
    column().density === "compact" ? "compact" : ("normal" as const);
  const expandMedia = () => column().expandMedia !== false;
  const items = () => {
    const shows = scope.shows;
    const received = (
      shows ? section.items().filter(shows) : section.items()
    ).filter(listsUnderWarning);
    const visible =
      mutes && columnHidesMuted(column())
        ? received.filter((event) => !mutes.hides(event))
        : received;
    return visibleColumnItems(
      visible,
      columnShow(column()),
      columnFacets(column()),
    );
  };

  return (
    <Switch>
      <Match when={items().length > 0}>
        <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
          <VirtualList
            items={items()}
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
