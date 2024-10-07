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
      <ReactionUserName
        pubkey={props.reaction.raw.pubkey}
        reaction={
          props.reaction.parsed.emoji
            ? {
                type: "emoji",
                src: props.reaction.parsed.emoji.url,
                value: props.reaction.parsed.emoji.name,
              }
            : { type: "string", value: props.reaction.parsed.content }
        }
      />
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
