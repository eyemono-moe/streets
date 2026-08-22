import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import { threadSpine } from "../../core/view/thread-spine";
import EventView from "./EventView";

/**
 * 1 本のスレッドを描く (背骨: 祖先 → 選択したイベント → 返信)。木ではない
 * —— 兄弟の枝も返信の返信も出さない (計算そのものは `threadSpine`、
 * Task 2)。件数がカラムより桁違いに少ないので `ColumnItems.tsx` の
 * `content-visibility` 最適化は要らない。
 */
const ThreadView: Component<{
  events: () => NostrEvent[];
  focusId: string;
}> = (props) => {
  const spine = createMemo(() => threadSpine(props.events(), props.focusId));

  return (
    <ul data-testid="thread" class="divide-y">
      <Show when={!spine().reachedRoot}>
        {/*
          黙って根から始まっているように見せない (ADR-0011)。祖先が
          欠けたスレッドは「誰が誰に返信したのか」を読み違えさせる。
        */}
        <li data-testid="thread-truncated" class="c-secondary p-3 text-caption">
          これより前の返信は取得できていません
        </li>
      </Show>
      <For each={spine().ancestors}>
        {(event) => (
          <li data-testid="thread-ancestor">
            <EventView id={event.id} variant="compact" />
          </li>
        )}
      </For>
      <Show
        when={spine().focus}
        fallback={
          <li data-testid="thread-focus" class="c-secondary p-3 text-caption">
            読み込み中
          </li>
        }
      >
        {(focus) => (
          <li data-testid="thread-focus">
            <EventView id={focus().id} variant="full" />
          </li>
        )}
      </Show>
      <For each={spine().replies}>
        {(event) => (
          <li data-testid="thread-reply">
            <EventView id={event.id} variant="compact" />
          </li>
        )}
      </For>
    </ul>
  );
};

export default ThreadView;
