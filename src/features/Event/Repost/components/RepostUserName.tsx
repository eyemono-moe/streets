import { HoverCard } from "@kobalte/core/hover-card";
import type { Component } from "solid-js";
import { useI18n } from "../../../../i18n";
import EmbedUser from "../../../User/components/EmbedUser";
import ProfileHoverContent from "../../../User/components/ProfileHoverContent";

const RepostUserName: Component<{
  pubkey: string;
}> = (props) => {
  const t = useI18n();

  return (
    <div class="pb-2 text-3 text-zinc-5">
      <HoverCard>
        <div class="flex items-center gap-1">
          <div class="i-material-symbols:repeat-rounded c-green aspect-square h-auto w-4" />
          <EmbedUser
            pubkey={props.pubkey}
            class="truncate font-700 text-zinc-5"
          />
          <span class="shrink-0">{t("repost.repostedBy")}</span>
        </div>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </div>
  );
};

export default RepostUserName;
