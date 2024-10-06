import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import type { Component } from "solid-js";
import { hex2bech32 } from "../../../libs/bech32";
import { useProfile } from "../../../libs/rxQuery";
import { useOpenUserColumn } from "../../Column/libs/useOpenColumn";
import ProfileHoverContent from "./ProfileHoverContent";

const ProfileRow: Component<{
  pubkey?: string;
}> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <button
      class="flex w-full items-center gap-1 overflow-hidden bg-white p-1 hover:bg-zinc-1 focus:bg-zinc-1 focus:outline-none"
      type="button"
      onClick={() => {
        if (props.pubkey) openUserColumn(props.pubkey);
      }}
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
              (props.pubkey ? hex2bech32(props.pubkey) : "")}
          </span>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </button>
  );
};

export default ProfileRow;
