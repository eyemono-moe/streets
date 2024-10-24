import { kinds } from "nostr-tools";
import { type Component, Match, Switch } from "solid-js";
import Reaction from "../../features/Event/Reaction/components/Reaction";
import Repost from "../../features/Event/Repost/components/Repost";
import Text from "../../features/Event/ShortText/components/Text";
import { useI18n } from "../../i18n";
import type { ParsedEventPacket } from "../libs/parser";
import type { ShortTextNote } from "../libs/parser/1_shortTextNote";
import type { Repost as TRepost } from "../libs/parser/6_repost";
import type { Reaction as TReaction } from "../libs/parser/7_reaction";
import CopyablePre from "./CopyablePre";
import EventBase from "./EventBase";

const Event: Component<{
  event: ParsedEventPacket;
  small?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
  showReply?: boolean;
  hasChild?: boolean;
}> = (props) => {
  const t = useI18n();

  return (
    <Switch
      fallback={
        <EventBase
          eventPacket={props.event}
          small={props.small}
          showReactions={props.showReactions}
          showActions={props.showActions}
        >
          <div class="c-secondary flex items-center gap-0.5">
            <div class="i-material-symbols:error-circle-rounded aspect-square h-4 w-auto" />
            <span class="text-caption">{t("event.unknown")}</span>
          </div>
          <CopyablePre content={JSON.stringify(props.event.raw, null, 2)} />
        </EventBase>
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
          <div>
            <Text
              event={event}
              small={props.small}
              showReactions={props.showReactions}
              showActions={props.showActions}
              showEmbeddings={!props.small}
              hasChild={props.hasChild}
              showReply={props.showReply}
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
        {(event) => <Reaction reaction={event.parsed} />}
      </Match>
    </Switch>
  );
};

export default Event;
