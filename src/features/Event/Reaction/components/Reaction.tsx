import { type Component, Show } from "solid-js";
import Event from "../../../../shared/components/Event";
import type { Reaction as TReaction } from "../../../../shared/libs/parser/7_reaction";
import { useEventByID } from "../../../../shared/libs/query";
import ReactionUserName from "./ReactiontUserName";

const Reaction: Component<{
  reaction: TReaction;
}> = (props) => {
  const event = useEventByID(() => props.reaction.targetEvent.id);

  return (
    <div class="space-y-1">
      <ReactionUserName reaction={props.reaction} />
      {/* TODO: fallback */}
      <Show when={event().data} keyed>
        {(e) => <Event event={e} showReactions showActions />}
      </Show>
    </div>
  );
};

export default Reaction;
