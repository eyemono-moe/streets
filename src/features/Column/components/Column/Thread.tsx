import { type Component, For, Show, createMemo } from "solid-js";
import { useI18n } from "../../../../i18n";
import Event from "../../../../shared/components/Event";
import { useEventByID, useRepliesOfEvent } from "../../../../shared/libs/query";
import type { ColumnContent } from "../../libs/deckSchema";
import ColumnHeader from "../ColumnHeader";
import TempColumnHeader from "../TempColumnHeader";

const Thread: Component<{
  state: ColumnContent<"thread">;
  isTempColumn?: boolean;
}> = (props) => {
  const t = useI18n();

  const targetEvent = useEventByID(() => props.state.targetEventID);

  const replies = useRepliesOfEvent(() => props.state.targetEventID);
  const directReplies = createMemo(() =>
    replies().data?.filter(
      (r) => r.parsed.replyOrRoot?.id === props.state.targetEventID,
    ),
  );

  return (
    <div class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] divide-y">
      <Show
        when={props.isTempColumn}
        fallback={<ColumnHeader title={t("column.thread.title")} />}
      >
        <TempColumnHeader title={t("column.thread.title")} />
      </Show>
      <div class="children-b-b-1 h-full overflow-y-auto">
        <Show when={targetEvent().data}>
          <Event
            // biome-ignore lint/style/noNonNullAssertion: Show when targetEvent is loaded
            event={targetEvent().data!}
            collapseReplies={false}
            showReplies
            showReactions
            showActions
            defaultExpanded
          />
        </Show>
        <For each={directReplies()}>
          {(reply) => <Event event={reply} small />}
        </For>
        <div class="h-50%" />
      </div>
    </div>
  );
};

export default Thread;
