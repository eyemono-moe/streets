import { kinds } from "nostr-tools";
import { type Component, Match, Switch } from "solid-js";
import Reaction from "../../features/Event/Reaction/components/Reaction";
import Repost from "../../features/Event/Repost/components/Repost";
import Text from "../../features/Event/ShortText/components/Text";
import type { ParsedEventPacket } from "../libs/parser";
import type { ShortTextNote } from "../libs/parser/1_shortTextNote";
import type { Repost as TRepost } from "../libs/parser/6_repost";
import type { Reaction as TReaction } from "../libs/parser/7_reaction";

const Event: Component<{
  event: ParsedEventPacket;
}> = (props) => {
  return (
    <Switch
      fallback={
        <div class="p-2">
          <pre>{JSON.stringify(props.event.parsed, null, 2)}</pre>
        </div>
      }
    >
      <Match
        when={
          props.event.parsed.kind === kinds.ShortTextNote &&
          (props.event as ParsedEventPacket<ShortTextNote>)
        }
        keyed
      >
        {(event) => (
          <div class="p-2">
            <Text
              id={event.parsed.id}
              showActions
              showReply
              showReactions
              showEmbeddings
            />
          </div>
        )}
      </Match>
      <Match
        when={
          props.event.parsed.kind === kinds.Repost &&
          (props.event as ParsedEventPacket<TRepost>)
        }
        keyed
      >
        {(event) => <Repost repost={event.parsed} />}
      </Match>
      <Match
        when={
          props.event.parsed.kind === kinds.Reaction &&
          (props.event as ParsedEventPacket<TReaction>)
        }
        keyed
      >
        {(event) => <Reaction reaction={event} />}
      </Match>
    </Switch>
  );
};

export default Event;
