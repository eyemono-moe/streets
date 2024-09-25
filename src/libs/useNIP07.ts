import { createQuery } from "@tanstack/solid-query";
import type { WindowNostr } from "nostr-tools/nip07";

export const useNIP07 = () => {
  if (window.nostr) {
    return window.nostr;
  }
  throw new Error("NIP-07 implementation not found");
};

export const useQueryPubKey = () =>
  createQuery(() => ({
    queryKey: ["pubKey"],
    queryFn: () => useNIP07().getPublicKey(),
  }));

export const useQueryRelays = () =>
  createQuery(() => ({
    queryKey: ["relays"],
    queryFn: () => useNIP07().getRelays(),
  }));

declare global {
  interface Window {
    nostr?: WindowNostr;
  }
}
