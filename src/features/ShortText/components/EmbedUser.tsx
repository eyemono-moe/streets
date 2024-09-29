import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Show } from "solid-js";
import { readablePubkey } from "../../../libs/format";
import { useOpenUserColumn } from "../../Column/libs/useOpenUserColumn";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import { useQueryProfile } from "../../Profile/query";

const EmbedUser: Component<{ pubkey: string }> = (props) => {
  const profile = useQueryProfile(() => props.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <HoverCard>
      <HoverCard.Trigger
        class="hover:(underline) c-blue-5 break-anywhere cursor-pointer appearance-none bg-transparent font-bold"
        as="button"
        onClick={() => {
          openUserColumn(props.pubkey);
        }}
      >
        <Show when={profile.data} fallback={`@${readablePubkey(props.pubkey)}`}>
          {`@${profile.data?.display_name}`}
        </Show>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <ProfileHoverContent pubkey={props.pubkey} />
      </HoverCard.Portal>
    </HoverCard>
  );
};

export default EmbedUser;
