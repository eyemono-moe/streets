import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Show } from "solid-js";
import Profile from "../../Profile/components/Profile";
import { useQueryProfile } from "../../Profile/query";

const EmbedUser: Component<{ pubkey: string }> = (props) => {
  const profile = useQueryProfile(() => props.pubkey);

  return (
    <HoverCard>
      <HoverCard.Trigger class="cursor-pointer hover:(underline) c-blue-5 font-bold">
        <Show when={profile.data} fallback={props.pubkey}>
          @{profile.data?.display_name}
        </Show>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content class="max-w-[min(calc(100vw-32px),520px)] max-h-[min(calc(100vh-32px),520px)] shadow-xl transform-origin-[--kb-hovercard-content-transform-origin] rounded-2 overflow-auto">
          <HoverCard.Arrow />
          <div class="bg-white">
            <Profile pubkey={props.pubkey} />
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard>
  );
};

export default EmbedUser;
