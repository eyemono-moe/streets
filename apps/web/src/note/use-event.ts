import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { useReadLayer } from "../read-layer";

export type EventLookup =
  | { phase: "loading" }
  | { phase: "found"; event: NostrEvent }
  | { phase: "missing" };

/** 取得中と見つからなかったを分けて返す。両者を同じ文言で出さないため。 */
export const useEvent = (
  ref: Accessor<{ id: string; relay?: RelayUrl }>,
): Accessor<EventLookup> => {
  const { store, events } = useReadLayer();
  const [lookup, setLookup] = createSignal<EventLookup>({ phase: "loading" });

  createEffect(() => {
    const { id, relay } = ref();
    const load = () => {
      const event = store.get(id);
      if (event) setLookup({ phase: "found", event });
      return event !== undefined;
    };

    setLookup({ phase: "loading" });
    if (load()) return;

    events.request(id, relay);
    const unsubscribe = events.subscribe(() => {
      if (load()) {
        unsubscribe();
        return;
      }
      // 通知は無関係なバッチの完了でも来る。自分の id のバッチが片付いたときだけ missing にする。
      if (events.isUnresolved(id)) setLookup({ phase: "missing" });
    });
    onCleanup(unsubscribe);
  });

  return lookup;
};
