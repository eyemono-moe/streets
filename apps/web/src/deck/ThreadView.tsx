import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { createSection } from "@streets/core/solid/create-section";
import { createThreadSource } from "@streets/core/solid/create-thread-source";
import { threadSpine } from "@streets/core/view/thread-spine";
import { type Component, createMemo } from "solid-js";
import ThreadSpineView from "./ThreadSpineView";

/** 焦点のイベントを起点に、根までの祖先とその返信を集めて出す。 */
const ThreadView: Component<{
  focus: string;
  readLayer: ReadLayer;
  expandMedia: boolean;
}> = (props) => {
  const thread = createThreadSource({
    focusId: () => props.focus,
    store: props.readLayer.store,
    columnRelays: () => undefined,
    relaysOverride: undefined,
  });
  const section = createSection({
    manager: props.readLayer.manager,
    source: thread.source,
  });

  const events = (): NostrEvent[] => {
    const items = section.items();
    if (items.some((event) => event.id === props.focus)) return items;
    // 焦点は押した時点で store にある。購読の応答を待つと、押しても何も出ない間ができる。
    const seeded = props.readLayer.store.get(props.focus);
    return seeded ? [...items, seeded] : items;
  };
  const spine = createMemo(() => threadSpine(events(), props.focus));

  return (
    <ThreadSpineView
      spine={spine()}
      settled={section.status().phase === "settled"}
      expandMedia={props.expandMedia}
    />
  );
};

export default ThreadView;
