import type { Component } from "solid-js";
import type { ParsedEventPacket } from "../../../../shared/libs/parser";
import type { Reaction as TReaction } from "../../../../shared/libs/parser/7_reaction";
import Text from "../../ShortText/components/Text";
import ReactionUserName from "./ReactiontUserName";

const Reaction: Component<{
  reaction: ParsedEventPacket<TReaction>;
}> = (props) => {
  return (
    <div class="p-2">
      <ReactionUserName reaction={props.reaction.parsed} />
      <Text
        id={props.reaction.parsed.targetEvent.id}
        showActions
        showReactions
        showEmbeddings
      />
    </div>
  );
};

export default Reaction;
