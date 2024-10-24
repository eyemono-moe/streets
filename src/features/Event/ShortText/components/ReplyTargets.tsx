import { type Component, Show, createSignal } from "solid-js";
import { useI18n } from "../../../../i18n";
import type { ShortTextNote } from "../../../../shared/libs/parser/1_shortTextNote";
import { useEventByID } from "../../../../shared/libs/query";
import Text from "./Text";

// TODO: replyDepthを見てるの効率悪いかも

const ReplyTargets: Component<{
  id: string;
  defaultCollapsed?: boolean;
  replyDepth: number;
}> = (props) => {
  const t = useI18n();
  const event = useEventByID<ShortTextNote>(() => props.id);

  const [collapsed, setCollapsed] = createSignal(props.defaultCollapsed);

  return (
    // TODO: fallback
    <>
      <Show
        when={!collapsed() || props.replyDepth === 0}
        fallback={
          <div class="relative">
            <div class="b-l-2 b-dashed pointer-events-none absolute ml-[calc(1.25rem-1px)] h-full" />
            <button
              type="button"
              class="c-secondary w-full appearance-none bg-transparent py-1 pl-8 text-start text-caption"
              onClick={() => setCollapsed(false)}
            >
              {t("loadMoreReply")}
            </button>
          </div>
        }
      >
        <Show when={event().data} keyed>
          {(e) => (
            <Text
              event={e}
              small
              hasChild
              showReply={!collapsed()}
              replyDepth={props.replyDepth + 1}
            />
          )}
        </Show>
      </Show>
    </>
  );
};

export default ReplyTargets;
