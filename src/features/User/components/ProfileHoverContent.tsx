import { HoverCard } from "@kobalte/core/hover-card";
import type { Component } from "solid-js";
import Profile from "./Profile";

const ProfileHoverContent: Component<{
  pubkey?: string;
}> = (props) => {
  return (
    <HoverCard.Content
      class="transform-origin-[--kb-hovercard-content-transform-origin] b-1 b-zinc-2 max-h-[min(calc(100vh-32px),360px)] min-h-0 max-w-[min(calc(100vw-32px),360px)] animate-duration-100 animate-fade-out overflow-hidden rounded-2 bg-white shadow-xl data-[expanded]:animate-duration-100 data-[expanded]:animate-fade-in"
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      <Profile pubkey={props.pubkey} small />
    </HoverCard.Content>
  );
};

export default ProfileHoverContent;
