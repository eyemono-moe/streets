import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Show } from "solid-js";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import { useQueryProfile } from "../../Profile/query";

const EmbedUser: Component<{ pubkey: string }> = (props) => {
  const profile = useQueryProfile(() => props.pubkey);

  return (
    <HoverCard>
      <HoverCard.Trigger class="hover:(underline) c-blue-5 cursor-pointer font-bold">
        <Show when={profile.data} fallback={`@${props.pubkey}`}>
          @{profile.data?.display_name}
        </Show>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <ProfileHoverContent pubkey={props.pubkey} />
      </HoverCard.Portal>
    </HoverCard>
  );
};

export default EmbedUser;
