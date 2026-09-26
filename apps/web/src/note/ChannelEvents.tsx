import { buildChannelColumn } from "@streets/core/deck/column-presets";
import {
  CHANNEL_CREATE_KIND,
  type Channel,
  channelFrom,
  channelOf,
} from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  formatEventTime,
  formatEventTimeFull,
} from "@streets/core/view/format-time";
import { type Component, Show } from "solid-js";
import ChannelPicture from "../chat/ChannelPicture";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import AuthorNames from "./AuthorNames";
import Avatar from "./Avatar";
import { type EventSize, NoteContent } from "./Event";
import ReactionList from "./ReactionList";
import { useEvent } from "./use-event";

/** kind:41 が指しているチャンネル（kind:40）の id。 */
const channelIdOfUpdate = (event: NostrEvent): string | undefined =>
  event.tags.find(
    (tag) => tag[0] === "e" && /^[0-9a-f]{64}$/.test(tag[1] ?? ""),
  )?.[1];

/** その id のチャンネルを引く。kind:41 を渡せば、その書き換えも当てる。 */
const useChannel = (
  id: () => string | undefined,
  update?: () => NostrEvent | undefined,
) => {
  const lookup = useEvent(() => ({ id: id() ?? "" }));
  return (): Channel | undefined => {
    const current = lookup();
    if (
      current.phase !== "found" ||
      current.event.kind !== CHANNEL_CREATE_KIND
    ) {
      return undefined;
    }
    const extra = update?.();
    return channelFrom(current.event, extra ? [extra] : []);
  };
};

const useOpenChannel = () => {
  const dispatch = useDispatch();
  return (channel: Channel) =>
    dispatch({
      type: "stack/open",
      column: buildChannelColumn(
        channel.id,
        channel.metadata.name,
        channel.metadata.relays,
      ),
    });
};

/**
 * チャンネルそのもの（kind:40）と、その情報の書き換え（kind:41）。検索の結果などに
 * 出たときに、チャンネルとして見せて開けるようにする。
 */
export const ChannelCard: Component<{ event: NostrEvent; size: EventSize }> = (
  props,
) => {
  const open = useOpenChannel();
  const created = () =>
    props.event.kind === CHANNEL_CREATE_KIND
      ? channelFrom(props.event, [])
      : undefined;
  const updated = useChannel(
    () =>
      props.event.kind === CHANNEL_CREATE_KIND
        ? undefined
        : channelIdOfUpdate(props.event),
    () => props.event,
  );
  const channel = () => created() ?? updated();
  return (
    <article class="flex flex-col gap-2 bg-primary p-3">
      <Show when={props.event.kind !== CHANNEL_CREATE_KIND}>
        <p class="c-secondary flex min-w-0 items-center gap-1.5 text-caption">
          <span
            class="i-material-symbols:edit-square-outline-rounded size-3.5 shrink-0"
            aria-hidden="true"
          />
          チャンネルの情報を書き換えました
        </p>
      </Show>
      <Show
        when={channel()}
        fallback={
          <p class="c-secondary text-caption">チャンネルを読み込み中…</p>
        }
      >
        {(current) => (
          <div class="flex items-center gap-2.5">
            <ChannelPicture
              url={current().metadata.picture}
              class={
                props.size === "compact"
                  ? "size-8 rounded-2"
                  : "size-10 rounded-2"
              }
            />
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="c-primary truncate font-600 text-body">
                {current().metadata.name ?? "名前の無いチャンネル"}
              </span>
              <span class="c-secondary truncate text-caption">
                {current().metadata.about ?? "説明がありません"}
              </span>
            </div>
            <Show when={props.size === "normal"}>
              <Button
                size="sm"
                icon="i-material-symbols:forum-outline-rounded"
                onClick={() => open(current())}
              >
                開く
              </Button>
            </Show>
          </div>
        )}
      </Show>
    </article>
  );
};

/**
 * チャンネルでの発言（kind:42）。どのチャンネルの発言かを上に出し、押すとその
 * チャンネルを開く。投稿の返信の操作は出さない —— 返信は kind:1 ではなく、
 * チャンネルの中で書くもの。
 */
export const ChannelMessageCard: Component<{
  event: NostrEvent;
  size: EventSize;
  expandMedia?: boolean;
}> = (props) => {
  const open = useOpenChannel();
  const channel = useChannel(() => channelOf(props.event));
  const date = () => new Date(props.event.created_at * 1000);
  return (
    <article class="flex flex-col gap-2 bg-primary p-3">
      <Show
        when={channel()}
        fallback={
          <p class="c-secondary flex items-center gap-1.5 text-caption">
            <span
              class="i-material-symbols:forum-outline-rounded size-3.5 shrink-0"
              aria-hidden="true"
            />
            チャンネルでの発言
          </p>
        }
      >
        {(current) => (
          <button
            type="button"
            class="c-secondary flex min-w-0 cursor-pointer items-center gap-1.5 bg-transparent p-0 text-left text-caption hover:underline"
            onClick={() => open(current())}
          >
            <span
              class="i-material-symbols:forum-outline-rounded size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span class="min-w-0 truncate">
              {current().metadata.name ?? "名前の無いチャンネル"} での発言
            </span>
          </button>
        )}
      </Show>
      <div class="flex gap-2.5">
        <Avatar
          pubkey={props.event.pubkey}
          size={props.size === "compact" ? "compact" : "normal"}
        />
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <div class="flex min-w-0 items-baseline gap-1.5">
            <div class="min-w-0 shrink">
              <AuthorNames pubkey={props.event.pubkey} size={props.size} />
            </div>
            <time
              class="c-secondary shrink-0 text-caption"
              datetime={date().toISOString()}
              title={formatEventTimeFull(date())}
            >
              {formatEventTime(date(), new Date())}
            </time>
          </div>
          <NoteContent
            event={props.event}
            size={props.size}
            expandMedia={props.expandMedia}
          />
          <Show when={props.size === "normal"}>
            <ReactionList event={props.event} />
          </Show>
        </div>
      </div>
    </article>
  );
};
