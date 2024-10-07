import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Match, Show, Switch } from "solid-js";
import { readablePubkey } from "../../../libs/format";
import { useProfile } from "../../../libs/rxQuery";
import { useOpenUserColumn } from "../../Column/libs/useOpenColumn";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";

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
  const reposterProfile = useProfile(() => props.pubkey);
  const openUserColumn = useOpenUserColumn();

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
          <HoverCard.Trigger
            class="hover:(underline) break-anywhere cursor-pointer appearance-none bg-transparent font-bold"
            as="button"
            onClick={() => {
              openUserColumn(props.pubkey);
            }}
          >
            <Show
              when={reposterProfile().data}
              fallback={`@${readablePubkey(props.pubkey)}`}
            >
              <span>{reposterProfile().data?.parsed.display_name}</span>
              <span class="text-zinc-5">
                {`@${reposterProfile().data?.parsed.name}`}
              </span>
            </Show>
          </HoverCard.Trigger>
          <span>がリアクション</span>
        </div>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </div>
  );
};

export default ReactionUserName;
