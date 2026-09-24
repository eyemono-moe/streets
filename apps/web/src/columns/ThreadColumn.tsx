import type { ColumnDef } from "@streets/core/deck/deck";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { MAX_ITEMS_PER_SECTION } from "@streets/core/read/source";
import { createSection } from "@streets/core/solid/create-section";
import { createThreadSource } from "@streets/core/solid/create-thread-source";
import { threadSpine } from "@streets/core/view/thread-spine";
import { type Component, createEffect, createMemo } from "solid-js";
import { setDiagnostics } from "../devtools/diagnostics";
import ColumnBody from "./ColumnBody";
import ThreadSpineView from "./ThreadSpineView";

/** 焦点のイベントを起点に、根までの祖先とその返信を集めて出す。 */
const ThreadColumn: Component<{
  focus: string;
  column: ColumnDef;
  readLayer: ReadLayer;
  expandMedia: boolean;
  scrollerRef: (element: HTMLDivElement) => void;
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
  // 上限に達すると古いものから落ちる。焦点を補った後の一覧で見ると、焦点が最古に見えて欠けを見逃す。
  const oldestKept = (): number | undefined => {
    const items = section.items();
    // 一覧は新しい順なので、末尾が最古。
    return items.length >= MAX_ITEMS_PER_SECTION
      ? items.at(-1)?.created_at
      : undefined;
  };
  const spine = createMemo(() =>
    threadSpine(events(), props.focus, { oldestKept: oldestKept() }),
  );
  createEffect(() =>
    setDiagnostics("sections", props.column.id, {
      ...section.status(),
      items: section.items().length,
    }),
  );

  return (
    <ColumnBody columnId={props.column.id} scrollerRef={props.scrollerRef}>
      <ThreadSpineView
        spine={spine()}
        settled={section.status().phase === "settled"}
        expandMedia={props.expandMedia}
      />
    </ColumnBody>
  );
};

export default ThreadColumn;
