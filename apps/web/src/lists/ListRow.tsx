import type { NostrEvent } from "@streets/core/nostr/event";
import { type ParentComponent, Show } from "solid-js";
import Avatar from "../note/Avatar";
import type { EventSize } from "../note/Event";
import EventStamp from "../note/EventStamp";
import UserLink from "../note/UserLink";
import ListPicture from "./ListPicture";

/**
 * 流れてきたリスト 1 件。投稿の行と同じ骨格で、アイコンの位置にリストの画像、
 * 名前の位置に題名を置く。作った人は題名の下に小さく出す —— 投稿と同じく
 * 作った人を見出しにすると、リストの中にも作った人が出て 2 回になる。
 * 種類ごとの中身は `children` で足す。
 */
const ListRow: ParentComponent<{
  event: NostrEvent;
  size: EventSize;
  title: string;
  image?: string;
  /** 画像が無いときの印。 */
  icon?: string;
  /** 「12 人」「8 件」など。 */
  count?: string;
  description?: string;
}> = (props) => (
  <div
    class="flex items-start"
    classList={{
      "gap-3": props.size === "normal",
      "gap-2": props.size === "compact",
    }}
  >
    <ListPicture
      url={props.image}
      icon={props.icon}
      class={props.size === "normal" ? "size-10 rounded-2" : "size-8 rounded-2"}
    />
    <div
      class="flex min-w-0 flex-1 flex-col"
      classList={{
        "gap-2": props.size === "normal",
        "gap-1.5": props.size === "compact",
      }}
    >
      <div class="flex min-w-0 flex-col gap-0.5">
        <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-1.5">
          <span
            class="c-primary break-anywhere font-600"
            classList={{
              "text-body": props.size === "normal",
              "text-[14px]": props.size === "compact",
            }}
          >
            {props.title}
          </span>
          <EventStamp event={props.event} size={props.size} />
        </div>
        <span class="c-secondary flex min-w-0 items-center gap-1 text-caption">
          <Avatar pubkey={props.event.pubkey} size="tiny" static />
          <span class="flex min-w-0">
            <UserLink pubkey={props.event.pubkey} class="min-w-0 truncate" />
            <Show when={props.count}>
              {(count) => <span class="shrink-0">・{count()}</span>}
            </Show>
          </span>
        </span>
      </div>
      <Show when={props.description}>
        {(description) => (
          <p class="c-secondary break-anywhere whitespace-pre-wrap text-caption">
            {description()}
          </p>
        )}
      </Show>
      {props.children}
    </div>
  </div>
);

export default ListRow;
