import { kinds } from "nostr-tools";
import { type Component, Match, Show, Switch, createSignal } from "solid-js";
import { useMute } from "../../context/mute";
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
import Button from "./UI/Button";

const Event: Component<{
  event: ParsedEventPacket;
  small?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
  collapseReplies?: boolean;
  showReplies?: boolean;
  hasChild?: boolean;
  defaultExpanded?: boolean;
}> = (props) => {
  const t = useI18n();

  const [, { isMuteTarget }] = useMute();
  const muteReason = () => isMuteTarget(props.event.raw).reason;
  const [showMuted, setShowMuted] = createSignal(false);

  return (
    <Show
      when={!isMuteTarget(props.event.raw).muted || showMuted()}
      fallback={
        <div class="c-secondary flex flex-col items-center justify-center gap-2 p-2">
          <span class="break-anywhere text-caption">
            <Switch>
              <Match when={muteReason() === "events"}>
                {t("event.mutedEvent")}
              </Match>
              <Match when={muteReason() === "hashtags"}>
                {t("event.mutedHashtag")}
              </Match>
              <Match when={muteReason() === "users"}>
                {t("event.mutedUser")}
              </Match>
              <Match when={muteReason() === "words"}>
                {t("event.mutedWord")}
              </Match>
            </Switch>
          </span>
          <Button
            variant="dangerBorder"
            onClick={() => {
              setShowMuted(true);
            }}
          >
            <div class="i-material-symbols:visibility-outline-rounded m--0.125lh aspect-square h-1.25lh w-auto" />
            {t("event.showMutedEvent")}
          </Button>
        </div>
      }
    >
      <Switch
        fallback={
          <EventBase
            eventPacket={props.event}
            small={props.small}
            showReactions={props.showReactions}
            showActions={props.showActions}
            defaultExpanded={props.defaultExpanded}
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
                collapseReplies={props.collapseReplies}
                showReplies={props.showReplies}
                defaultExpanded={props.defaultExpanded}
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
    </Show>
  );
};

export default Event;
