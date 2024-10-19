import { type Component, Show } from "solid-js";
import Event from "../../../../shared/components/Event";
import type { Repost as TRepost } from "../../../../shared/libs/parser/6_repost";
import { useEventByID } from "../../../../shared/libs/query";
import RepostUserName from "./RepostUserName";

const Repost: Component<{
  repost: TRepost;
}> = (props) => {
  const event = useEventByID(() => props.repost.targetEventID);

  return (
    <div class="space-y-1">
      <RepostUserName pubkey={props.repost.pubkey} />
      {/* TODO: fallback */}
      <Show when={event().data} keyed>
        {(e) => <Event event={e} showReactions showActions />}
      </Show>
    </div>
  );
};

export default Repost;
