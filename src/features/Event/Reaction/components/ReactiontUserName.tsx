import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Match, Switch } from "solid-js";
import { useI18n } from "../../../../i18n";
import type { Reaction } from "../../../../shared/libs/parser/7_reaction";
import EmbedUser from "../../../User/components/EmbedUser";
import ProfileHoverContent from "../../../User/components/ProfileHoverContent";

const ReactionUserName: Component<{
  reaction: Reaction;
}> = (props) => {
  const t = useI18n();

  return (
    <div class="pb-2 text-3 text-zinc-5">
      <HoverCard>
        <div class="flex h-5 items-center gap-1">
          <Switch>
            <Match
              when={
                props.reaction.content.type === "emoji" &&
                props.reaction.content
              }
              keyed
            >
              {(emoji) => (
                <img
                  src={emoji.url}
                  class="inline-block h-full w-auto"
                  alt={emoji.name}
                  title={emoji.name}
                />
              )}
            </Match>
            <Match
              when={
                props.reaction.content.type === "text" && props.reaction.content
              }
              keyed
            >
              {(textReaction) => (
                <span class="h-5 truncate leading-5">
                  {textReaction.content}
                </span>
              )}
            </Match>
            <Match when={props.reaction.content.type === "like"}>
              <div class="i-material-symbols:favorite-rounded c-purple aspect-square h-5 w-auto" />
            </Match>
          </Switch>
          <EmbedUser
            pubkey={props.reaction.pubkey}
            class="truncate font-700 text-zinc-5"
          />
          <span class="shrink-0">{t("reaction.reactedBy")}</span>
        </div>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.reaction.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </div>
  );
};

export default ReactionUserName;
