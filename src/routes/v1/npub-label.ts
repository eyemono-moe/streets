import { encodeBech32 } from "../../core/nostr/nip19";

/**
 * 名前が無いときに人物を指す文字列。`encodeBech32` は 64 桁 hex 以外で
 * 投げるが、pubkey は NIP-10 の `e` タグ 5 番目の要素など**リレー由来の
 * 任意文字列**から来ることがある —— 投げさせるとカラム全体が落ちる
 * (`<For>` の周りに ErrorBoundary が無い) ので、hex として読めない値は
 * 短縮 hex のまま出す。
 */
export const npubLabel = (pubkey: string): string => {
  try {
    return encodeBech32("npub", pubkey).slice(0, 12);
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
};
