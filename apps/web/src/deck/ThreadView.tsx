import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { createSection } from "@streets/core/solid/create-section";
import { createThreadSource } from "@streets/core/solid/create-thread-source";
import { threadSpine } from "@streets/core/view/thread-spine";
import { type Component, For, Show, createMemo } from "solid-js";
import Event from "../note/Event";

/**
 * 1 本の背骨（根 → 焦点 → その直接の返信）。木は描かない —— 兄弟の枝まで出すと、
 * 1 カラムの幅では会話の筋を追えなくなる。
 */
const ThreadView: Component<{
  focusId: string;
  readLayer: ReadLayer;
  expandMedia: boolean;
}> = (props) => {
  const thread = createThreadSource({
    focusId: () => props.focusId,
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
    if (items.some((event) => event.id === props.focusId)) return items;
    // 焦点は押した時点で store にある。購読の応答を待つと、押しても何も出ない間ができる。
    const seeded = props.readLayer.store.get(props.focusId);
    return seeded ? [...items, seeded] : items;
  };
  const spine = createMemo(() => threadSpine(events(), props.focusId));

  return (
    <div class="flex flex-col gap-px bg-tertiary pb-px">
      {/* 根まで辿れないことを黙らせない。途中が欠けると「根から始まる」ように見える。 */}
      <Show when={!spine().reachedRoot && section.status().phase === "settled"}>
        <p class="c-secondary bg-primary px-3 py-2 text-caption">
          このスレッドの上の方は取得できませんでした。
        </p>
      </Show>
      <For each={spine().ancestors}>
        {(event) => (
          <Event event={event} size="normal" expandMedia={props.expandMedia} />
        )}
      </For>
      <Show
        when={spine().focus}
        fallback={
          <p class="c-secondary bg-primary p-4 text-caption">読み込み中…</p>
        }
      >
        {(focus) => (
          // 焦点だけ背景を変える。どれを開いているかが、返信に埋もれて分からなくなるため。
          <div class="bg-secondary">
            <Event
              event={focus()}
              size="normal"
              expandMedia={props.expandMedia}
            />
          </div>
        )}
      </Show>
      <For each={spine().replies}>
        {(event) => (
          <Event event={event} size="normal" expandMedia={props.expandMedia} />
        )}
      </For>
    </div>
  );
};

export default ThreadView;
