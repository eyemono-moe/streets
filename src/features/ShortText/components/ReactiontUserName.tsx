import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Match, Switch, createMemo } from "solid-js";
import { useI18n } from "../../../i18n";
import type { Reaction } from "../../../libs/parser/7_reaction";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import EmbedUser from "./EmbedUser";

const ReactionUserName: Component<{
  reaction: Reaction;
}> = (props) => {
  const t = useI18n();

  const reaction = createMemo<{
    isLike?: {
      type: "like";
    };
    isCustomEmoji?: {
      type: "emoji";
      value: string;
      src: string;
    };
    isText?: {
      type: "string";
      value: string;
    };
  }>(() => {
    if (
      props.reaction.emoji &&
      `:${props.reaction.emoji.name}:` === props.reaction.content
    ) {
      return {
        isCustomEmoji: {
          type: "emoji",
          value: props.reaction.content,
          src: props.reaction.emoji.url,
        },
      };
    }
    if (props.reaction.content === "+") {
      return {
        isLike: {
          type: "like",
        },
      };
    }
    return {
      isText: {
        type: "string",
        value: props.reaction.content,
      },
    };
  });

  return (
    <div class="pb-2 text-3 text-zinc-5">
      <HoverCard>
        <div class="flex h-5 items-center gap-1">
          <Switch>
            <Match when={reaction().isCustomEmoji} keyed>
              {(emoji) => (
                <img
                  src={emoji.src}
                  class="inline-block h-full w-auto"
                  alt={emoji.value}
                  title={emoji.value}
                />
              )}
            </Match>
            <Match when={reaction().isText} keyed>
              {(textReaction) => (
                <span class="h-5 truncate leading-5">{textReaction.value}</span>
              )}
            </Match>
            <Match when={reaction().isLike}>
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
