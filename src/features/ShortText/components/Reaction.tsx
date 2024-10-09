import type { Component } from "solid-js";
import type { ParsedEventPacket } from "../../../libs/parser";
import type { Reaction as TReaction } from "../../../libs/parser/7_reaction";
import ReactionUserName from "./ReactiontUserName";
import Text from "./Text";

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
