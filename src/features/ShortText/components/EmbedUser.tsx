import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Show } from "solid-js";
import { readablePubkey } from "../../../libs/format";
import { useProfile } from "../../../libs/rxQuery";
import { useOpenUserColumn } from "../../Column/libs/useOpenColumn";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";

const EmbedUser: Component<{ pubkey: string; relay?: string }> = (props) => {
  const profile = useProfile(() => props.pubkey);
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
        <Show
          when={profile().data}
          fallback={`@${readablePubkey(props.pubkey)}`}
        >
          {`@${profile().data?.parsed.display_name}`}
        </Show>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <ProfileHoverContent pubkey={props.pubkey} />
      </HoverCard.Portal>
    </HoverCard>
  );
};

export default EmbedUser;
