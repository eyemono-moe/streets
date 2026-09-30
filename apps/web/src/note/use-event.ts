import { parseEventAddress } from "@streets/core/nostr/address";
import type { EventRef } from "@streets/core/nostr/event-refs";
import type { EventLookup } from "@streets/core/read/lookups";
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { useReadLayer } from "../read-layer";

/**
 * 取得中と見つからなかったを分けて返す。両者を同じ文言で出さないため。
 * 住所で指すものは、その住所の最新版を返す。
 */
export const useEvent = (ref: Accessor<EventRef>): Accessor<EventLookup> => {
  const { lookups } = useReadLayer();
  const [lookup, setLookup] = createSignal<EventLookup>({ phase: "loading" });

  createEffect(() => {
    const target = ref();
    if (target.form === "id") {
      onCleanup(lookups.watchEvent(target.id, target.relay, setLookup));
      return;
    }
    const address = parseEventAddress(target.address);
    if (!address) {
      setLookup({ phase: "missing" });
      return;
    }
    onCleanup(lookups.watchAddress(address, setLookup));
  });

  return lookup;
};
