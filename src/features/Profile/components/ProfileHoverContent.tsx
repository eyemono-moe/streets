import { HoverCard } from "@kobalte/core/hover-card";
import type { Component } from "solid-js";
import Profile from "./Profile";

const ProfileHoverContent: Component<{
  pubkey?: string;
}> = (props) => {
  return (
    <HoverCard.Content class="max-w-[min(calc(100vw-32px),520px)] max-h-[min(calc(100vh-32px),520px)] shadow-xl transform-origin-[--kb-hovercard-content-transform-origin] rounded-2 overflow-auto b-1 b-zinc-2">
      <HoverCard.Arrow />
      <div class="bg-white">
        <Profile pubkey={props.pubkey} />
      </div>
    </HoverCard.Content>
  );
};

export default ProfileHoverContent;
