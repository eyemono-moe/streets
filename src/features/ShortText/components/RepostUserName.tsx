import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Show } from "solid-js";
import { useI18n } from "../../../i18n";
import { readablePubkey } from "../../../libs/format";
import { useProfile } from "../../../libs/rxQuery";
import { useOpenUserColumn } from "../../Column/libs/useOpenColumn";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";

const RepostUserName: Component<{
  pubkey: string;
}> = (props) => {
  const t = useI18n();

  const reposterProfile = useProfile(() => props.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <div class="pb-2 text-3 text-zinc-5">
      <HoverCard>
        <div class="flex items-center gap-1">
          <div class="i-material-symbols:repeat-rounded c-green aspect-square h-auto w-4" />
          <HoverCard.Trigger
            class="hover:(underline) break-anywhere cursor-pointer appearance-none truncate bg-transparent font-bold"
            as="button"
            onClick={() => {
              openUserColumn(props.pubkey);
            }}
          >
            <Show
              when={reposterProfile().data}
              fallback={`@${readablePubkey(props.pubkey)}`}
            >
              <span>{reposterProfile().data?.parsed.display_name}</span>
              <span class="text-zinc-5">
                {`@${reposterProfile().data?.parsed.name}`}
              </span>
            </Show>
          </HoverCard.Trigger>
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
