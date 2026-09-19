import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

export type RelayListEntry = {
  url: RelayUrl;
  read: boolean;
  write: boolean;
};

/**
 * NIP-65 の kind:10002 を解釈する。マーカー無しは read/write 両方、未知の
 * マーカーもマーカー無し扱い —— エントリごと捨てると害が大きい。
 */
export const parseRelayList = (event: NostrEvent): RelayListEntry[] => {
  const byUrl = new Map<RelayUrl, RelayListEntry>();

  for (const tag of event.tags) {
    if (!Array.isArray(tag)) continue;
    if (tag[0] !== "r") continue;
    const raw = tag[1];
    if (typeof raw !== "string") continue;
    const url = normalizeRelayUrl(raw);
    if (!url) continue;

    const marker = tag[2];
    const read = marker !== "write";
    const write = marker !== "read";

    const existing = byUrl.get(url);
    if (existing) {
      existing.read ||= read;
      existing.write ||= write;
      continue;
    }
    byUrl.set(url, { url, read, write });
  }

  return [...byUrl.values()];
};
