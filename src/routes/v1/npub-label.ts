import { encodeBech32 } from "../../core/nostr/nip19";

/**
 * 名前が無いときの表示用文字列。pubkey はリレー由来の任意文字列のことも
 * あり、`encodeBech32` が投げると ErrorBoundary が無くカラムごと落ちる。
 */
export const npubLabel = (pubkey: string): string => {
  try {
    return encodeBech32("npub", pubkey).slice(0, 12);
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
};
