import { kinds } from "nostr-tools";
import { type Component, For, Match, Show, Switch, createMemo } from "solid-js";
import {
  createEventFeedId,
  useCoreEventFeed,
} from "../../../../core/solid/use-event-feed";
import { useCoreEventPackets } from "../../../../core/solid/use-social-read";
import type { NostrTransportFilter } from "../../../../core/transport/transport";
import Event from "../../../../shared/components/Event";
import type { ParsedEventPacket } from "../../../../shared/libs/parser";
import type { ShortTextNote } from "../../../../shared/libs/parser/1_shortTextNote";
import type { ColumnContent } from "../../libs/deckSchema";

type DebugUserMode = NonNullable<ColumnContent<"debug-user">["mode"]>;

const modeLabel: Record<DebugUserMode, string> = {
  single: "single one-shot query",
  feed: "liveBackfill feed",
  "feed-plain-event": "liveBackfill + Event without actions/replies/reactions",
  "feed-actions": "liveBackfill + EventActions",
  "feed-reactions": "liveBackfill + ReactionButtons",
  "feed-replies": "liveBackfill + replies",
  "feed-full": "liveBackfill + normal user-column Event props",
};

const DebugEventList: Component<{
  events: readonly ParsedEventPacket[] | undefined;
  mode: DebugUserMode;
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

const DebugUser: Component<{
  state: ColumnContent<"debug-user">;
}> = (props) => {
  const mode = () => props.state.mode ?? "feed-plain-event";
  const limit = () => props.state.limit ?? 1;
  const filter = createMemo<NostrTransportFilter>(() => ({
    authors: [props.state.pubkey],
    kinds: [kinds.ShortTextNote, kinds.Repost],
    limit: limit(),
  }));
  const single = useCoreEventPackets<ShortTextNote>(() =>
    mode() === "single" ? filter() : undefined,
  );
  const feed = useCoreEventFeed(() => {
    if (mode() === "single") {
      return undefined;
    }
    const filters = filter();
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
  const events = () => (mode() === "single" ? single().data : feed.events());
  const isFetching = () =>
    mode() === "single" ? single().isFetching : feed.isFetching();

  return (
    <div class="flex h-full flex-col overflow-y-auto">
      <div class="sticky top-0 z-1 flex flex-col gap-1 border-b bg-primary p-2 text-caption">
        <div class="font-600">Debug user column</div>
        <div>mode: {modeLabel[mode()]}</div>
        <div>pubkey: {props.state.pubkey}</div>
        <div>limit: {limit()}</div>
        <div>events: {events()?.length ?? 0}</div>
        <div>fetching: {String(isFetching())}</div>
        <Show when={mode() !== "single"}>
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
        <DebugEventList events={events()} mode={mode()} />
      </div>
    </div>
  );
};

export default DebugUser;
