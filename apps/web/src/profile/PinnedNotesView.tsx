import { type Component, For } from "solid-js";
import { EventRefView, type EventSize } from "../note/Event";

/**
 * ピン留めした投稿を、投稿の一覧の上に並べる。見出しを投稿ごとに付けるのは、
 * 下に続く時系列の投稿と見分けるため。
 */
const PinnedNotesView: Component<{
  ids: readonly string[];
  size: EventSize;
  expandMedia?: boolean;
}> = (props) => (
  <For each={props.ids}>
    {(id) => (
      <div class="border-primary border-b bg-primary">
        <p
          class="c-secondary flex items-center gap-1.5 text-caption"
          classList={{
            "px-3 pt-2": props.size === "normal",
            "px-2 pt-1.5": props.size === "compact",
          }}
        >
          <span
            class="i-material-symbols:push-pin-outline size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>ピン留め</span>
        </p>
        <EventRefView
          target={{ form: "id", id }}
          size={props.size}
          expandMedia={props.expandMedia}
        />
      </div>
    )}
  </For>
);

export default PinnedNotesView;
