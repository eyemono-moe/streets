import type { WindowNostr } from "nostr-tools/nip07";

export const useNIP07 = () => {
  if (window.nostr) {
    return window.nostr;
  }
  throw new Error("NIP-07 implementation not found");
};

declare global {
  interface Window {
    nostr?: WindowNostr;
  }
}
