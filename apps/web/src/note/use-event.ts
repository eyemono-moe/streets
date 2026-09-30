import type { EventLookup } from "@streets/core/read/lookups";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { useReadLayer } from "../read-layer";

/** 取得中と見つからなかったを分けて返す。両者を同じ文言で出さないため。 */
export const useEvent = (
  ref: Accessor<{ id: string; relay?: RelayUrl }>,
): Accessor<EventLookup> => {
  const { lookups } = useReadLayer();
  const [lookup, setLookup] = createSignal<EventLookup>({ phase: "loading" });

  createEffect(() => {
    const { id, relay } = ref();
    onCleanup(lookups.watchEvent(id, relay, setLookup));
  });

  return lookup;
};
