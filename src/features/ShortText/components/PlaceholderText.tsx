import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { type Component, Show } from "solid-js";
import { useProfile, useRepostsOfEvent } from "../../../libs/rxQuery";
import { useOpenUserColumn } from "../../Column/libs/useOpenUserColumn";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import Reactions from "./Reactions";

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
          class="grid grid-cols-[auto_1fr] grid-cols-[auto_1fr] gap-x-2 gap-y-1"
          style={{
            "grid-template-areas": `
      "avatar name"
      "avatar content"
      `,
          }}
        >
          <div class="grid-area-[avatar] grid grid-rows-[auto_1fr]">
            <HoverCard.Trigger
              class="cursor-pointer appearance-none bg-transparent"
              as="button"
              onClick={() => {
                if (props.pubkey) {
                  openUserColumn(props.pubkey);
                }
              }}
            >
              <Image
                class="inline-flex aspect-square h-auto select-none items-center justify-center overflow-hidden rounded bg-zinc-2 align-mid"
                classList={{
                  "w-10": !props.small,
                  "w-6": props.small,
                }}
                fallbackDelay={500}
              >
                <Image.Img
                  src={profile().data?.parsed.picture}
                  alt={profile().data?.parsed.name}
                  loading="lazy"
                  class="h-full w-full object-cover"
                />
                <Image.Fallback class="flex h-full w-full items-center justify-center">
                  {profile().data?.parsed.name?.slice(0, 2) ??
                    props.pubkey?.slice(0, 2)}
                </Image.Fallback>
              </Image>
            </HoverCard.Trigger>
            <Show when={props.isReplyTarget}>
              <div class="b-l-2 ml-[calc(0.75rem-1px)]" />
            </Show>
          </div>
          <div class="grid-area-[name] grid grid-cols-[1fr_auto]">
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
                <Show
                  when={profile().data}
                  fallback={props.pubkey ?? "loading..."}
                >
                  <span>{profile().data?.parsed.display_name}</span>
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
            <Reactions eventId={props.id} />
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
