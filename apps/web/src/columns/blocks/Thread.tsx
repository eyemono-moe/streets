import type { NostrEvent } from "@streets/core/nostr/event";
import { createThreadSource } from "@streets/core/solid/create-thread-source";
import { threadSpine } from "@streets/core/view/thread-spine";
import { type Component, createMemo } from "solid-js";
import { createBlockSection, useColumnScope } from "../column-scope";
import ThreadSpineView from "../ThreadSpineView";

/** 焦点のイベントを起点に、根までの祖先とその返信を集めて木にする。 */
const Thread: Component<{ focus: string }> = (props) => {
  const scope = useColumnScope();
  const store = scope.readLayer.store;
  const thread = createThreadSource({
    focusId: () => props.focus,
    store,
    columnRelays: () => undefined,
    relaysOverride: undefined,
  });
  const section = createBlockSection({ source: thread.source });

  const events = (): NostrEvent[] => {
    const items = section.items();
    if (items.some((event) => event.id === props.focus)) return items;
    // 焦点は押した時点で store にある。購読の応答を待つと、押しても何も出ない間ができる。
    const seeded = store.get(props.focus);
    return seeded ? [...items, seeded] : items;
  };
  const spine = createMemo(() => threadSpine(events(), props.focus));

  return (
    <ThreadSpineView
      spine={spine()}
      settled={section.status().phase === "settled"}
      expandMedia={scope.column().expandMedia !== false}
    />
  );
};

export default Thread;
