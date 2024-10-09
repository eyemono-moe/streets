import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Match, Switch } from "solid-js";
import { useI18n } from "../../../i18n";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import EmbedUser from "./EmbedUser";

const ReactionUserName: Component<{
  pubkey: string;
  reaction:
    | {
        type: "string";
        value: string;
      }
    | {
        type: "emoji";
        value: string;
        src: string;
      };
}> = (props) => {
  const t = useI18n();

  return (
    <div class="pb-2 text-3 text-zinc-5">
      <HoverCard>
        <div class="flex h-5 items-center gap-1">
          <Switch
            fallback={
              <span class="h-5 truncate leading-5">{props.reaction.value}</span>
            }
          >
            <Match when={props.reaction.type === "emoji" && props.reaction}>
              {(emoji) => (
                <img
                  src={emoji().src}
                  class="inline-block h-full w-auto"
                  alt={emoji().value}
                />
              )}
            </Match>
            <Match
              when={
                props.reaction.type === "string" && props.reaction.value === "+"
              }
            >
              <div class="i-material-symbols:favorite-rounded c-pink aspect-square h-5 w-auto" />
            </Match>
          </Switch>
          <EmbedUser
            pubkey={props.pubkey}
            class="truncate font-700 text-zinc-5"
          />
          <span class="shrink-0">{t("reaction.reactedBy")}</span>
        </div>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </div>
  );
};

export default ReactionUserName;
