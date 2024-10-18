import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Show, mergeProps } from "solid-js";
import { hex2bech32 } from "../../../shared/libs/format";
import { useProfile } from "../../../shared/libs/query";
import { useOpenUserColumn } from "../../Column/libs/useOpenColumn";
import ProfileHoverContent from "./ProfileHoverContent";

const EmbedUser: Component<{
  pubkey: string;
  relay?: string;
  class?: string;
}> = (props) => {
  const defaultProps = mergeProps({ class: "text-link font-700" }, props);

  const profile = useProfile(() => props.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <HoverCard>
      <HoverCard.Trigger
        class={`${defaultProps.class} hover:(underline) cursor-pointer cursor-pointer appearance-none bg-transparent`}
        onClick={() => {
          openUserColumn(props.pubkey);
        }}
      >
        <Show
          when={profile().data}
          fallback={`@${hex2bech32(props.pubkey, "npub").slice(0, 12)}`}
        >
          {`@${profile().data?.parsed.display_name || profile().data?.parsed.name || hex2bech32(props.pubkey, "npub").slice(0, 12)}`}
        </Show>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <ProfileHoverContent pubkey={props.pubkey} />
      </HoverCard.Portal>
    </HoverCard>
  );
};

export default EmbedUser;
