import { type Component, Show } from "solid-js";
import { useI18n } from "../../../../i18n";
import Event from "../../../../shared/components/Event";
import { useEventByID } from "../../../../shared/libs/query";
import type { ColumnContent } from "../../libs/deckSchema";
import ColumnHeader from "../ColumnHeader";

const Thread: Component<{
  state: ColumnContent<"thread">;
  showHeader?: boolean;
}> = (props) => {
  const t = useI18n();

  const targetEvent = useEventByID(() => props.state.targetEventID);

  return (
    <div class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] divide-y">
      <Show when={props.showHeader}>
        <ColumnHeader title={t("column.thread.title")} />
      </Show>
      <div class="h-full overflow-y-auto">
        <Show when={targetEvent().data}>
          <Event
            // biome-ignore lint/style/noNonNullAssertion: Show when targetEvent is loaded
            event={targetEvent().data!}
            showReply
            showReactions
            showActions
          />
        </Show>
      </div>
    </div>
  );
};

export default Thread;
