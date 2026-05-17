import { kinds } from "nostr-tools";
import { type Component, For, Match, Show, Switch, createMemo } from "solid-js";
import {
  createEventFeedId,
  useCoreEventFeed,
} from "../../../../core/solid/use-event-feed";
import type { NostrTransportFilter } from "../../../../core/transport/transport";
import Event from "../../../../shared/components/Event";
import type { ParsedEventPacket } from "../../../../shared/libs/parser";
import { useFollowees } from "../../../../shared/libs/query";
import type { ColumnContent } from "../../libs/deckSchema";

type DebugTimelineMode = NonNullable<ColumnContent<"debug-timeline">["mode"]>;

const modeLabel: Record<DebugTimelineMode, string> = {
  followees: "followees only",
  feed: "followees + liveBackfill feed without Event rendering",
  "feed-plain-event": "feed + Event without actions/replies/reactions",
  "feed-actions": "feed + EventActions",
  "feed-reactions": "feed + ReactionButtons",
  "feed-replies": "feed + replies",
  "feed-full": "feed + normal timeline Event props",
};

const DebugEventList: Component<{
  events: readonly ParsedEventPacket[] | undefined;
  mode: DebugTimelineMode;
}> = (props) => (
  <For each={props.events ?? []}>
    {(event) => (
      <Switch
        fallback={
          <Event event={event} showActions collapseReplies showReplies />
        }
      >
        <Match when={props.mode === "feed-plain-event"}>
          <Event event={event} />
        </Match>
        <Match when={props.mode === "feed-actions"}>
          <Event event={event} showActions />
        </Match>
        <Match when={props.mode === "feed-reactions"}>
          <Event event={event} showReactions />
        </Match>
        <Match when={props.mode === "feed-replies"}>
          <Event event={event} collapseReplies showReplies />
        </Match>
      </Switch>
    )}
  </For>
);

const DebugTimeline: Component<{
  state: ColumnContent<"debug-timeline">;
  isTempColumn?: boolean;
}> = (props) => {
  const mode = () => props.state.mode ?? "feed-plain-event";
  const limit = () => props.state.limit ?? 20;
  const followees = useFollowees(() => props.state.pubkey);
  const authors = createMemo(
    () =>
      followees()
        .data?.parsed.followees.map((followee) => followee.pubkey)
        .sort() ?? [],
  );
  const filter = createMemo<NostrTransportFilter | undefined>(() => {
    const currentAuthors = authors();
    if (currentAuthors.length === 0 || mode() === "followees") {
      return undefined;
    }
    return {
      authors: currentAuthors,
      kinds: [kinds.ShortTextNote, kinds.Repost],
      limit: limit(),
    };
  });
  const feed = useCoreEventFeed(() => {
    const filters = filter();
    if (!filters) {
      return undefined;
    }
    const relays = props.state.relays;
    return {
      id: createEventFeedId({
        filters,
        relays,
        strategy: "liveBackfill",
      }),
      filters,
      relays,
      strategy: "liveBackfill",
      limit: limit(),
    };
  });
  const shouldRenderEvents = () => mode() !== "followees" && mode() !== "feed";

  return (
    <div class="flex h-full flex-col overflow-y-auto">
      <div class="sticky top-0 z-1 flex flex-col gap-1 border-b bg-primary p-2 text-caption">
        <div class="font-600">Debug timeline column</div>
        <div>mode: {modeLabel[mode()]}</div>
        <div>viewer pubkey: {props.state.pubkey}</div>
        <div>followees: {authors().length}</div>
        <div>limit: {limit()}</div>
        <div>events: {feed.events().length}</div>
        <div>followees fetching: {String(followees().isFetching)}</div>
        <div>feed fetching: {String(feed.isFetching())}</div>
        <Show when={mode() !== "followees"}>
          <button
            type="button"
            class="w-fit rounded border px-2 py-1"
            disabled={!feed.hasNextPage() || feed.isFetching()}
            onClick={() => void feed.fetchNextPage()}
          >
            fetch next page
          </button>
        </Show>
      </div>
      <div class="divide-y">
        <Show when={shouldRenderEvents()}>
          <DebugEventList events={feed.events()} mode={mode()} />
        </Show>
      </div>
    </div>
  );
};

export default DebugTimeline;
