import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Show } from "solid-js";
import { readablePubkey } from "../../../libs/format";
import { useOpenUserColumn } from "../../Column/libs/useOpenUserColumn";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import { useQueryProfile } from "../../Profile/query";

const RepostUserName: Component<{
  pubkey: string;
}> = (props) => {
  const reposterProfile = useQueryProfile(() => props.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <div class="pb-2 text-3 text-zinc-5">
      <HoverCard>
        <div class="flex items-center gap-1">
          <div class="i-material-symbols:repeat-rounded c-green aspect-square h-auto w-4" />
          <HoverCard.Trigger
            class="hover:(underline) break-anywhere cursor-pointer appearance-none bg-transparent font-bold"
            as="button"
            onClick={() => {
              openUserColumn(props.pubkey);
            }}
          >
            <Show
              when={reposterProfile.data}
              fallback={`@${readablePubkey(props.pubkey)}`}
            >
              <span>{reposterProfile.data?.display_name}</span>
              <span class="text-3.5 text-zinc-5">
                {`@${reposterProfile.data?.name}`}
              </span>
            </Show>
          </HoverCard.Trigger>
          <span>がリポスト</span>
        </div>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </div>
  );
};

export default RepostUserName;
