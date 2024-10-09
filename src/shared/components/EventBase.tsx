import { HoverCard } from "@kobalte/core/hover-card";
import { Popover } from "@kobalte/core/popover";
import { type ParentComponent, Show, createMemo } from "solid-js";
import { useOpenUserColumn } from "../../features/Column/libs/useOpenColumn";
import ReactionButtons from "../../features/Event/Reaction/components/ReactionButtons";
import Avatar from "../../features/User/components/Avatar";
import ProfileHoverContent from "../../features/User/components/ProfileHoverContent";
import { dateHuman, dateTimeHuman } from "../libs/format";
import { showLoginModal } from "../libs/nostrLogin";
import { useProfile, useRepostsOfEvent, useSendReaction } from "../libs/query";
import { isLogged, useMyPubkey } from "../libs/useMyPubkey";
import type { Emoji } from "./EmojiPicker";
import EmojiPicker from "./EmojiPicker";

// TODO: Text.tsxと共通化

const EventBase: ParentComponent<{
  eventId: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  showActions?: boolean;
  small?: boolean;
  showReactions?: boolean;
}> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const openUserColumn = useOpenUserColumn();

  const myPubkey = useMyPubkey();
  const reposts = useRepostsOfEvent(() => props.eventId);
  const isReposted = createMemo(() =>
    reposts().data?.some((r) => r.parsed.pubkey === myPubkey()),
  );

  // TODO: Reactionsとの共通化
  const { sendReaction } = useSendReaction();
  const handleReaction = async (e: Emoji) => {
    if (!isLogged()) {
      showLoginModal();
      return;
    }

    if (!e.native && !e.src) {
      console.error("emoji src is not found");
      return;
    }

    await sendReaction({
      targetEventId: props.eventId,
      targetEventPubkey: props.pubkey,
      content:
        e.native !== undefined
          ? {
              type: "text",
              content: e.native,
            }
          : {
              type: "emoji",
              name: e.name,
              url: e.src,
            },
      kind: props.kind,
    });
  };

  return (
    <div
      classList={{
        "text-4": !props.small,
        "text-3.5": props.small,
      }}
    >
      <div
        class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1"
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
        </div>
        <div class="grid-area-[name] grid grid-cols-[minmax(0,1fr)_auto]">
          <HoverCard>
            <HoverCard.Trigger
              class="w-fit max-w-full cursor-pointer appearance-none truncate bg-transparent hover:underline"
              as="button"
              onClick={() => {
                openUserColumn(props.pubkey);
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
            <HoverCard.Portal>
              <ProfileHoverContent pubkey={props.pubkey} />
            </HoverCard.Portal>
          </HoverCard>
          <span
            class="text-3.5 text-zinc-5"
            title={dateHuman(new Date(props.createdAt * 1000))}
          >
            {dateTimeHuman(new Date(props.createdAt * 1000))}
          </span>
        </div>
        <div class="grid-area-[content] flex flex-col gap-1">
          {props.children}
          <Show when={props.showReactions}>
            <ReactionButtons
              eventId={props.eventId}
              eventPubkey={props.pubkey}
              eventKind={props.kind}
            />
          </Show>
          <Show when={props.showActions}>
            <div class="c-zinc-5 flex w-full max-w-100 items-center justify-between">
              <button
                class="hover:c-purple-8 data-[expanded]:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50 data-[expanded]:bg-purple-3/50"
                type="button"
              >
                <div class="i-material-symbols:mode-comment-outline-rounded aspect-square h-4 w-auto" />
              </button>
              <button
                class="hover:c-green-5 data-[expanded]:c-green-5 flex inline-flex appearance-none items-center items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-green-2/50 data-[expanded]:bg-green-3/50"
                classList={{
                  "c-green-5": isReposted(),
                }}
                type="button"
              >
                <div class="i-material-symbols:repeat-rounded aspect-square h-4 w-auto" />
                <Show when={reposts().data?.length}>
                  <span class="lh-4 text-3">{reposts().data?.length}</span>
                </Show>
              </button>
              <Popover>
                <Popover.Trigger class="hover:c-purple-8 data-[expanded]:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-2/50 data-[expanded]:bg-purple-3/50">
                  <div class="i-material-symbols:add-rounded aspect-square h-4 w-auto" />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content class="transform-origin-[var(--kb-popover-content-transform-origin)] z-50 outline-none">
                    <EmojiPicker
                      onSelect={(v) => {
                        handleReaction(v);
                      }}
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover>
              <button
                class="hover:c-purple-8 data-[expanded]:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50 data-[expanded]:bg-purple-3/50"
                type="button"
              >
                <div class="i-material-symbols:bookmark-outline-rounded aspect-square h-4 w-auto" />
              </button>
              <button
                class="hover:c-purple-8 data-[expanded]:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50 data-[expanded]:bg-purple-3/50"
                type="button"
              >
                <div class="i-material-symbols:more-horiz aspect-square h-4 w-auto" />
              </button>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default EventBase;
