import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { HoverCard } from "@kobalte/core/hover-card";
import { neventEncode, nprofileEncode, npubEncode } from "nostr-tools/nip19";
import { type ParentComponent, Show, mergeProps } from "solid-js";
import { useOpenUserColumn } from "../../features/Column/libs/useOpenColumn";
import ReactionButtons from "../../features/Event/Reaction/components/ReactionButtons";
import Avatar from "../../features/User/components/Avatar";
import ProfileHoverContent from "../../features/User/components/ProfileHoverContent";
import { useI18n } from "../../i18n";
import { dateHuman, dateTimeHuman, hex2bech32 } from "../libs/format";
import type { ParsedEventPacket } from "../libs/parser";
import { useProfile } from "../libs/query";
import { useDialog } from "../libs/useDialog";
import CopyablePre from "./CopyablePre";
import EventActions from "./EventActions";

const EventBase: ParentComponent<{
  eventPacket: ParsedEventPacket;
  small?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
  hasParent?: boolean;
  hasChild?: boolean;
}> = (props) => {
  const t = useI18n();

  const mergedProps = mergeProps({ small: false }, props);

  const profile = useProfile(() => mergedProps.eventPacket.raw.pubkey);
  const userName = () =>
    `@${profile().data?.parsed.display_name || profile().data?.parsed.name || hex2bech32(props.eventPacket.raw.pubkey, "npub").slice(0, 12)}`;

  const openUserColumn = useOpenUserColumn();

  const { Dialog: DebugDialog, open: openDebugDialog } = useDialog();

  return (
    <>
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
          <div class="grid-area-[name] flex justify-between gap-2">
            <div class="flex w-full items-baseline gap-1 overflow-hidden">
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
                class="text-nowrap text-3.5 text-zinc-5"
                title={dateHuman(
                  new Date(mergedProps.eventPacket.raw.created_at * 1000),
                )}
              >
                {dateTimeHuman(
                  new Date(mergedProps.eventPacket.raw.created_at * 1000),
                )}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenu.Trigger class="c-zinc-5 hover:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50">
                <div class="i-material-symbols:more-horiz aspect-square h-4 w-auto" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content class="b-1 transform-origin-[--kb-menu-content-transform-origin] c-zinc-8 rounded-2 bg-white p-1 shadow outline-none">
                  <DropdownMenu.Item
                    // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
                    class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-zinc-2/50"
                  >
                    <div class="i-material-symbols:volume-off-rounded aspect-square h-0.75lh w-auto" />
                    {t("event.muteUser", { name: userName() })}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
                    class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-zinc-2/50"
                  >
                    <div class="aspect-square h-0.75lh w-auto i-material-symbols:list-alt-add-outline-rounded" />
                    {t("event.addUserToList", { name: userName() })}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
                    class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-zinc-2/50"
                    onSelect={openDebugDialog}
                  >
                    <div class="i-material-symbols:bug-report-outline-rounded aspect-square h-0.75lh w-auto" />
                    {t("event.viewEventData")}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
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
      <DebugDialog>
        <div class="max-w-200 space-y-4">
          <div>
            <div>Event Data</div>
            <CopyablePre
              content={JSON.stringify(mergedProps.eventPacket.raw, null, 2)}
            />
          </div>
          <div>
            <div>Author pubkey</div>
            <ul class="my-1 list-disc pl-5">
              <li>
                hex:
                <code class="break-anywhere rounded-2 bg-zinc-1 px-1 py-0.5">
                  {mergedProps.eventPacket.raw.pubkey}
                </code>
              </li>
              <li>
                npub:
                <code class="break-anywhere rounded-2 bg-zinc-1 px-1 py-0.5">
                  {npubEncode(mergedProps.eventPacket.raw.pubkey)}
                </code>
              </li>
              <li>
                nprofile:
                <code class="break-anywhere rounded-2 bg-zinc-1 px-1 py-0.5">
                  {nprofileEncode({
                    pubkey: mergedProps.eventPacket.raw.pubkey,
                  })}
                </code>
              </li>
            </ul>
          </div>
          <div>
            <div>Event ID</div>
            <ul class="my-1 list-disc pl-5">
              <li>
                hex:
                <code class="break-anywhere rounded-2 bg-zinc-1 px-1 py-0.5">
                  {mergedProps.eventPacket.raw.id}
                </code>
              </li>
              <li>
                nevent:
                <code class="break-anywhere rounded-2 bg-zinc-1 px-1 py-0.5">
                  {neventEncode({
                    id: mergedProps.eventPacket.raw.id,
                    kind: mergedProps.eventPacket.raw.kind,
                    author: mergedProps.eventPacket.raw.pubkey,
                    relays: [mergedProps.eventPacket.from],
                  })}
                </code>
              </li>
            </ul>
          </div>
        </div>
      </DebugDialog>
    </>
  );
};

export default EventBase;
