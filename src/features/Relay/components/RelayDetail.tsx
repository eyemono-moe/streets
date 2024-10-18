import { Collapsible } from "@kobalte/core/collapsible";
import { type Component, Show } from "solid-js";
import EmbedUser from "../../User/components/EmbedUser";
import { useQueryNip11 } from "../query";
import ConnectionStatusIcon from "./ConnectionStatusIcon";
import "../../../assets/collapsible.css";

const RelayDetail: Component<{
  relay: string;
}> = (props) => {
  const nip11 = useQueryNip11(() => props.relay);

  return (
    <Collapsible class="b-1 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded p-1">
      <div class="flex items-center gap-1 truncate">
        <Show when={nip11.data?.icon} keyed>
          {(icon) => (
            <img
              src={icon}
              alt={nip11.data?.name}
              class="aspect-square h-1lh w-auto rounded-full"
            />
          )}
        </Show>
        <div class="truncate">{props.relay}</div>
      </div>
      <ConnectionStatusIcon relay={props.relay} />
      <Collapsible.Trigger class="parent appearance-none bg-transparent">
        <div class="i-material-symbols:expand-more-rounded aspect-square h-1lh w-auto parent-data-[expanded]:rotate-180 transition-transform duration-100" />
      </Collapsible.Trigger>
      <Collapsible.Content class="animate-[slideUp] animate-duration-100 overflow-hidden data-[expanded]:animate-[slideDown] data-[expanded]:animate-duration-100">
        <div>
          <div class="truncate font-500">{nip11.data?.name}</div>
          <div class="c-secondary line-clamp-3 text-ellipsis text-caption">
            {nip11.data?.description}
          </div>
          <Show when={nip11.data?.pubkey} keyed>
            {(pubkey) => (
              <div class="text-caption">
                admin: <EmbedUser pubkey={pubkey} />
              </div>
            )}
          </Show>
          <div class="text-caption">contact: {nip11.data?.contact}</div>
        </div>
      </Collapsible.Content>
    </Collapsible>
  );
};

export default RelayDetail;
