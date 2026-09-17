import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { createSection } from "@streets/core/solid/create-section";
import { createThreadSource } from "@streets/core/solid/create-thread-source";
import { threadSpine } from "@streets/core/view/thread-spine";
import { type Component, For, Show, createMemo } from "solid-js";
import Event from "../note/Event";

/**
 * 1 本の背骨。焦点までの祖先と、焦点への返信を出す。祖先と返信は compact、
 * 焦点だけ normal —— どれを開いているかが、前後に埋もれないようにする。
 */
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
    <div class="flex flex-col gap-px bg-tertiary pb-px">
      {/* 根まで辿れないことを黙らせない。途中が欠けると「根から始まる」ように見える。 */}
      <Show when={!spine().reachedRoot && section.status().phase === "settled"}>
        <p class="c-secondary bg-primary px-3 py-2 text-caption">
          このスレッドの上の方は取得できませんでした。
        </p>
      </Show>
      <For each={spine().ancestors}>
        {(event, index) => (
          <Event
            event={event}
            size="compact"
            expandMedia={props.expandMedia}
            // 上にも下にも投稿があるなら線は通り抜ける。根（か、根が取れていない先頭）だけ下向き。
            threadLine={index() === 0 && spine().reachedRoot ? "below" : "both"}
          />
        )}
      </For>
      <Show
        when={spine().focus}
        fallback={
          <p class="c-secondary bg-primary p-4 text-caption">読み込み中…</p>
        }
      >
        {(focus) => (
          <Event
            event={focus()}
            size="normal"
            expandMedia={props.expandMedia}
            threadLine={spine().ancestors.length > 0 ? "above" : undefined}
          />
        )}
      </Show>
      <For each={spine().replies}>
        {(event) => (
          <Event event={event} size="compact" expandMedia={props.expandMedia} />
        )}
      </For>
    </div>
  );
};

export default ThreadView;
