import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Show, mergeProps } from "solid-js";
import { readablePubkey } from "../../../libs/format";
import { useProfile } from "../../../libs/rxQuery";
import { useOpenUserColumn } from "../../Column/libs/useOpenColumn";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";

const EmbedUser: Component<{
  pubkey: string;
  relay?: string;
  class?: string;
}> = (props) => {
  const defaultProps = mergeProps({ class: "c-blue-5 font-700" }, props);

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
          fallback={`@${readablePubkey(props.pubkey)}`}
        >
          {`@${profile().data?.parsed.display_name || profile().data?.parsed.name || readablePubkey(props.pubkey)}`}
        </Show>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <ProfileHoverContent pubkey={props.pubkey} />
      </HoverCard.Portal>
    </HoverCard>
  );
};

export default EmbedUser;
