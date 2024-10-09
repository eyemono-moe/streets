import { HoverCard } from "@kobalte/core/hover-card";
import { type Component, Show } from "solid-js";
import { useProfile, useRepostsOfEvent } from "../../../../shared/libs/query";
import { useOpenUserColumn } from "../../../Column/libs/useOpenColumn";
import Avatar from "../../../User/components/Avatar";
import ProfileHoverContent from "../../../User/components/ProfileHoverContent";

const PlaceholderText: Component<{
  id: string;
  pubkey?: string;
  showActions?: boolean;
  showReply?: boolean;
  small?: boolean;
  isReplyTarget?: boolean;
}> = (props) => {
  const openUserColumn = useOpenUserColumn();
  const profile = useProfile(() => props.pubkey);
  const reposts = useRepostsOfEvent(() => props.id);

  return (
    <div
      classList={{
        "text-4": !props.small,
        "text-3.5": props.small,
      }}
    >
      <HoverCard>
        <div
          class="grid grid-cols-[auto_minmax(0,1fr)] grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1"
          style={{
            "grid-template-areas": `
      "avatar name"
      "avatar content"
      `,
          }}
        >
          <div class="grid-area-[avatar] grid grid-rows-[auto_minmax(0,1fr)]">
            <div
              class="sticky top-2"
              classList={{
                "w-10": !props.small,
                "w-6": props.small,
              }}
            >
              <Avatar pubkey={props.pubkey} />
            </div>
            <Show when={props.isReplyTarget}>
              <div class="b-l-2 ml-[calc(0.75rem-1px)]" />
            </Show>
          </div>
          <div class="grid-area-[name] grid grid-cols-[minmax(0,1fr)_auto]">
            <div class="truncate">
              <HoverCard.Trigger
                class="cursor-pointer appearance-none bg-transparent hover:underline"
                as="button"
                onClick={() => {
                  if (props.pubkey) {
                    openUserColumn(props.pubkey);
                  }
                }}
              >
                <Show when={profile().data} fallback={props.pubkey}>
                  <span class="font-500">
                    {profile().data?.parsed.display_name}
                  </span>
                  <span class="text-3.5 text-zinc-5">
                    @{profile().data?.parsed.name}
                  </span>
                </Show>
              </HoverCard.Trigger>
            </div>
          </div>
          <div class="grid-area-[content] flex flex-col gap-2">
            <div>
              <div class="break-anywhere text-3.5 text-zinc-5">
                Loading... {props.id}
              </div>
            </div>
            <Show when={props.showActions}>
              <div class="c-zinc-5 flex w-full max-w-100 items-center justify-between">
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:mode-comment-outline-rounded aspect-square h-4 w-auto" />
                </button>
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:repeat-rounded aspect-square h-4 w-auto" />
                  <span>{reposts().data?.length || ""}</span>
                </button>
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:add-rounded aspect-square h-4 w-auto" />
                </button>
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:bookmark-outline-rounded aspect-square h-4 w-auto" />
                </button>
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:more-horiz aspect-square h-4 w-auto" />
                </button>
              </div>
            </Show>
          </div>
        </div>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </div>
  );
};

export default PlaceholderText;
