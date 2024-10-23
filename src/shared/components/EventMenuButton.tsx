import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { neventEncode, nprofileEncode, npubEncode } from "nostr-tools/nip19";
import type { Component } from "solid-js";
import { useI18n } from "../../i18n";
import type { ParsedEventPacket } from "../libs/parser";
import { useDialog } from "../libs/useDialog";
import CopyablePre from "./CopyablePre";

const EventMenuButton: Component<{
  event: ParsedEventPacket;
  userName: string;
}> = (props) => {
  const t = useI18n();

  const { Dialog: DebugDialog, open: openDebugDialog } = useDialog();

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger class="c-secondary hover:c-accent-5 data-[expanded]:c-accent-5 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-accent/25 data-[expanded]:bg-accent/25">
          <div class="i-material-symbols:more-horiz aspect-square h-4 w-auto" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="b-1 transform-origin-[--kb-menu-content-transform-origin] rounded-2 bg-primary p-1 shadow-lg shadow-ui/25 outline-none">
            <DropdownMenu.Item
              // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
              class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-alpha-hover"
            >
              <div class="i-material-symbols:volume-off-rounded aspect-square h-0.75lh w-auto" />
              {t("event.muteUser", { name: props.userName })}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
              class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-alpha-hover"
            >
              <div class="aspect-square h-0.75lh w-auto i-material-symbols:list-alt-add-outline-rounded" />
              {t("event.addUserToList", { name: props.userName })}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
              class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-alpha-hover"
              onSelect={openDebugDialog}
            >
              <div class="i-material-symbols:bug-report-outline-rounded aspect-square h-0.75lh w-auto" />
              {t("event.viewEventData")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
      <DebugDialog>
        <div class="max-w-200 space-y-4">
          <div>
            <div>Event Data</div>
            <CopyablePre content={JSON.stringify(props.event.raw, null, 2)} />
          </div>
          <div>
            <div>Author pubkey</div>
            <ul class="my-1 list-disc pl-5">
              <li>
                hex:
                <code class="break-anywhere rounded-2 bg-secondary px-1 py-0.5">
                  {props.event.raw.pubkey}
                </code>
              </li>
              <li>
                npub:
                <code class="break-anywhere rounded-2 bg-secondary px-1 py-0.5">
                  {npubEncode(props.event.raw.pubkey)}
                </code>
              </li>
              <li>
                nprofile:
                <code class="break-anywhere rounded-2 bg-secondary px-1 py-0.5">
                  {nprofileEncode({
                    pubkey: props.event.raw.pubkey,
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
                <code class="break-anywhere rounded-2 bg-secondary px-1 py-0.5">
                  {props.event.raw.id}
                </code>
              </li>
              <li>
                nevent:
                <code class="break-anywhere rounded-2 bg-secondary px-1 py-0.5">
                  {neventEncode({
                    id: props.event.raw.id,
                    kind: props.event.raw.kind,
                    author: props.event.raw.pubkey,
                    relays: [props.event.from],
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

export default EventMenuButton;
