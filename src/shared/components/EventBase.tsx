import { HoverCard } from "@kobalte/core/hover-card";
import { type ParentComponent, Show, mergeProps } from "solid-js";
import { useOpenUserColumn } from "../../features/Column/libs/useOpenColumn";
import ReactionButtons from "../../features/Event/Reaction/components/ReactionButtons";
import Avatar from "../../features/User/components/Avatar";
import ProfileHoverContent from "../../features/User/components/ProfileHoverContent";
import { dateHuman, dateTimeHuman } from "../libs/format";
import type { ParsedEventPacket } from "../libs/parser";
import { useProfile } from "../libs/query";
import EventActions from "./EventActions";

const EventBase: ParentComponent<{
  eventPacket: ParsedEventPacket;
  small?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
  hasParent?: boolean;
  hasChild?: boolean;
}> = (props) => {
  const mergedProps = mergeProps({ small: false }, props);

  const profile = useProfile(() => mergedProps.eventPacket.raw.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <div
      classList={{
        "text-4": !mergedProps.small,
        "text-3.5": mergedProps.small,
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
        <div class="grid-area-[avatar] relative grid grid-rows-[auto_minmax(0,1fr)]">
          <Show when={mergedProps.hasParent}>
            <div
              class="b-l-2 absolute ml-[calc(0.75rem-1px)]"
              classList={{
                "h-10": !mergedProps.small,
                "h-6": mergedProps.small,
              }}
            />
          </Show>
          <div
            class="sticky top-0"
            classList={{
              "w-10": !mergedProps.small,
              "w-6": mergedProps.small,
            }}
          >
            <Avatar pubkey={mergedProps.eventPacket.raw.pubkey} />
          </div>
          <Show when={mergedProps.hasChild}>
            <div class="b-l-2 ml-[calc(0.75rem-1px)]" />
          </Show>
        </div>
        <div class="grid-area-[name] grid grid-cols-[minmax(0,1fr)_auto]">
          {/* TODO: EmbedUserを使う */}
          <HoverCard>
            <HoverCard.Trigger
              class="w-fit max-w-full cursor-pointer appearance-none truncate bg-transparent hover:underline"
              as="button"
              onClick={() => {
                openUserColumn(mergedProps.eventPacket.raw.pubkey);
              }}
            >
              <Show
                when={profile().data}
                fallback={mergedProps.eventPacket.raw.pubkey}
              >
                <span class="font-500">
                  {profile().data?.parsed.display_name}
                </span>
                <span class="text-3.5 text-zinc-5">
                  @{profile().data?.parsed.name}
                </span>
              </Show>
            </HoverCard.Trigger>
            <HoverCard.Portal>
              <ProfileHoverContent
                pubkey={mergedProps.eventPacket.raw.pubkey}
              />
            </HoverCard.Portal>
          </HoverCard>
          <span
            class="text-3.5 text-zinc-5"
            title={dateHuman(
              new Date(mergedProps.eventPacket.raw.created_at * 1000),
            )}
          >
            {dateTimeHuman(
              new Date(mergedProps.eventPacket.raw.created_at * 1000),
            )}
          </span>
        </div>
        <div class="grid-area-[content] flex flex-col gap-1">
          {mergedProps.children}
          <Show when={mergedProps.showReactions}>
            <ReactionButtons
              eventId={mergedProps.eventPacket.raw.id}
              eventPubkey={mergedProps.eventPacket.raw.pubkey}
              eventKind={mergedProps.eventPacket.raw.kind}
            />
          </Show>
          <Show when={mergedProps.showActions}>
            <EventActions event={mergedProps.eventPacket} />
          </Show>
        </div>
      </div>
    </div>
  );
};

export default EventBase;
