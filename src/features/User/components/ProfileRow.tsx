import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { type ParentComponent, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { hex2bech32 } from "../../../shared/libs/format";
import { useProfile } from "../../../shared/libs/query";
import FollowButton from "./FollowButton";
import ProfileHoverContent from "./ProfileHoverContent";

const ProfileRow: ParentComponent<{
  pubkey?: string;
  showFollowButton?: boolean;
  onClick?: () => void;
}> = (props) => {
  const profile = useProfile(() => props.pubkey);

  return (
    <Dynamic
      component={props.onClick ? "button" : "div"}
      class="flex w-full items-center gap-1 overflow-hidden bg-white p-1"
      classList={{
        "hover:bg-zinc-1 focus:bg-zinc-1 focus:outline-none": !!props.onClick,
      }}
      type={props.onClick ? "button" : undefined}
      onClick={props.onClick}
    >
      <HoverCard>
        <HoverCard.Trigger as="div" class="focus:outline-none">
          <Image
            class="inline-flex aspect-square h-8 w-auto shrink-0 select-none items-center justify-center overflow-hidden rounded align-mid"
            fallbackDelay={0}
          >
            <Image.Img
              src={profile().data?.parsed.picture}
              alt={profile().data?.parsed.name}
              class="h-full w-full object-cover"
              loading="lazy"
            />
            <Image.Fallback class="flex h-full w-full items-center justify-center bg-zinc-2">
              {profile().data?.parsed.name.slice(0, 2) ??
                props.pubkey?.slice(0, 2)}
            </Image.Fallback>
          </Image>
        </HoverCard.Trigger>
        <HoverCard.Trigger
          as="span"
          class="truncate hover:underline focus:outline-none"
        >
          <span class="font-500">{profile().data?.parsed.display_name}</span>
          <span class="text-3.5 text-zinc-5">
            @
            {profile().data?.parsed.name ??
              (props.pubkey ? hex2bech32(props.pubkey, "npub") : "")}
          </span>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
      <Show when={props.showFollowButton}>
        <div class="ml-auto shrink-0 text-3">
          <FollowButton pubkey={props.pubkey} />
        </div>
      </Show>
      <Show when={props.children}>
        <div class="ml-auto shrink-0">{props.children}</div>
      </Show>
    </Dynamic>
  );
};

export default ProfileRow;
