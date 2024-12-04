import type { WindowNostr } from "nostr-tools/nip07";

// TODO: me contextでinitNostrLoginが実行された後にのみ使用可能にする
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
