import { Collapsible } from "@ark-ui/solid/collapsible";
import { type Component, For, Show } from "solid-js";
import { EventRefView, type EventSize } from "../note/Event";

/**
 * ピン留めした投稿を、投稿の一覧の上に 1 つの折りたためるまとまりで並べる。
 * Nostr のピン留めはいくつでも付けられるので、多い人でも閉じれば一覧がすぐ読める。
 */
const PinnedNotesView: Component<{
  ids: readonly string[];
  size: EventSize;
  expandMedia?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = (props) => (
  <Show when={props.ids.length > 0}>
    <Collapsible.Root
      open={props.open}
      onOpenChange={(details) => props.onOpenChange(details.open)}
      lazyMount
      unmountOnExit
      class="border-primary border-b bg-primary"
    >
      <Collapsible.Trigger
        class="c-secondary hover:c-primary group flex w-full cursor-pointer items-center gap-1.5 bg-transparent text-left text-caption outline-none focus-visible:ring-2 focus-visible:ring-accent-5 focus-visible:ring-inset"
        classList={{
          "px-3 py-2": props.size === "normal",
          "px-2 py-1.5": props.size === "compact",
        }}
      >
        <span
          class="i-material-symbols:push-pin-outline size-3.5 shrink-0"
          aria-hidden="true"
        />
        <span class="font-600">ピン留め</span>
        <span>{props.ids.length} 件</span>
        <span
          class="i-material-symbols:expand-more-rounded group-data-[state=closed]:-rotate-90 ml-auto size-4.5 shrink-0 transition-transform"
          aria-hidden="true"
        />
      </Collapsible.Trigger>
      <Collapsible.Content class="motion-collapse">
        <div class="flex flex-col [&>*]:border-primary [&>*]:border-t">
          <For each={props.ids}>
            {(id) => (
              <EventRefView
                target={{ form: "id", id }}
                size={props.size}
                expandMedia={props.expandMedia}
              />
            )}
          </For>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  </Show>
);

export default PinnedNotesView;
