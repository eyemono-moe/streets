import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import type { Component } from "solid-js";
import { useProfile } from "../../../shared/libs/query";
import { useOpenUserColumn } from "../../Column/libs/useOpenColumn";
import ProfileHoverContent from "./ProfileHoverContent";

const Avatar: Component<{
  pubkey?: string;
}> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <HoverCard>
      <HoverCard.Trigger
        class="sticky top-2 aspect-square h-auto w-full cursor-pointer appearance-none bg-transparent"
        as="button"
        onClick={() => {
          if (props.pubkey) {
            openUserColumn(props.pubkey);
          }
        }}
      >
        <Image
          class="inline-flex h-full w-full select-none items-center justify-center overflow-hidden rounded bg-secondary align-mid"
          fallbackDelay={500}
        >
          <Image.Img
            src={profile().data?.parsed.picture}
            alt={profile().data?.parsed.name}
            loading="lazy"
            class="h-full w-full object-cover blur"
          />
          <Image.Fallback class="flex h-full w-full items-center justify-center">
            {profile().data?.parsed.name?.slice(0, 2) ??
              props.pubkey?.slice(0, 2)}
          </Image.Fallback>
        </Image>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <ProfileHoverContent pubkey={props.pubkey} />
      </HoverCard.Portal>
    </HoverCard>
  );
};

export default Avatar;
