import { createViewportObserver } from "@solid-primitives/intersection-observer";
import type { Filter } from "nostr-tools";
import { type Component, For, Match, Switch } from "solid-js";
import {
  createEventFeedId,
  useCoreEventFeed,
} from "../../core/solid/use-event-feed";
import type { NostrTransportFilter } from "../../core/transport/transport";
import { useI18n } from "../../i18n";
import Event from "./Event";

const InfiniteEvents: Component<{
  filter: Filter;
  relays?: string[];
}> = (props) => {
  const t = useI18n();
  const feed = useCoreEventFeed(() => {
    const filters = props.filter as NostrTransportFilter;
    const relays = props.relays;
    return {
      id: createEventFeedId({
        filters,
        relays,
        strategy: "liveBackfill",
      }),
      filters,
      relays,
      strategy: "liveBackfill",
      limit: 20,
    };
  });

  // @ts-ignore(6133) typescript can't detect `use` directive
  const [intersectionObserver] = createViewportObserver();

  const fetchNextPage = () => {
    void feed.fetchNextPage();
  };

  return (
    <div class="h-full divide-y">
      <For each={feed.events()}>
        {(event) => (
          <Event
            event={event}
            showActions
            showReactions
            collapseReplies
            showReplies
          />
        )}
      </For>
      <div
        use:intersectionObserver={(e) => {
          if (feed.hasNextPage() && !feed.isFetching() && e.isIntersecting) {
            fetchNextPage();
          }
        }}
      />
      <button
        class="flex h-25vh w-full items-start justify-center bg-transparent bg-transparent p-2 enabled:active:bg-alpha-active not-active:enabled:hover:bg-alpha-hover disabled:opacity-50 data-[loading='true']:cursor-progress"
        type="button"
        onClick={fetchNextPage}
        disabled={!feed.hasNextPage() || feed.isFetching()}
        data-loading={feed.isFetching()}
      >
        <Switch fallback={t("loadMore")}>
          <Match when={feed.isFetching()}>{t("loading")}</Match>
          <Match when={!feed.hasNextPage()}>{t("noMoreEvents")}</Match>
        </Switch>
      </button>
    </div>
  );
};

export default InfiniteEvents;
