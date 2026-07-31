import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

export type RelayListEntry = {
  url: RelayUrl;
  read: boolean;
  write: boolean;
};

/**
 * NIP-65 の kind:10002 を解釈する。
 * r タグの値が URL、任意の 3 番目の要素が "read" / "write" マーカー。
 * マーカーが無い場合は read と write の両方 (NIP-65)。
 * 未知のマーカーはマーカー無しと同じ扱いにする — エントリごと捨てると
 * そのリレーが見えなくなり、取りこぼしのほうが害が大きい。
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
