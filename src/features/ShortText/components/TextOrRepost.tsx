import { kinds } from "nostr-tools";
import { type Component, Match, Switch } from "solid-js";
import type { ParsedEventPacket } from "../../../libs/parser";
import type { ShortTextNote } from "../../../libs/parser/1_shortTextNote";
import type { Repost as TRepost } from "../../../libs/parser/6_repost";
import Repost from "./Repost";
import Text from "./Text";

const TextOrRepost: Component<{
  textOrRepost: ParsedEventPacket<ShortTextNote | TRepost>;
}> = (props) => {
  return (
    <Switch>
      <Match when={props.textOrRepost.parsed.kind === kinds.ShortTextNote}>
        <div class="p-2">
          <Text
            id={props.textOrRepost.raw.id}
            showActions
            showReply
            showReactions
          />
        </div>
      </Match>
      <Match when={props.textOrRepost.parsed.kind === kinds.Repost}>
        <Repost repost={props.textOrRepost.parsed as TRepost} />
      </Match>
    </Switch>
  );
};

export default TextOrRepost;
