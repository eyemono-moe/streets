import type { RelayListEntry } from "../../read/relay-list";
import { type Mutation, replaceTags } from "./draft";

const RELAY_LIST_KIND = 10002;

/**
 * NIP-65 の kind:10002。read/write 両方ならマーカーを付けない（NIP-65 は
 * マーカー無しを「両方」と定める）。false/false のエントリは意味を持たないため落とす。
 */
export const setRelayList =
  (entries: readonly RelayListEntry[]): Mutation =>
  (current) =>
    replaceTags(current, RELAY_LIST_KIND, "r", () =>
      entries.flatMap((entry) => {
        if (entry.read && entry.write) return [["r", entry.url]];
        if (entry.read) return [["r", entry.url, "read"]];
        if (entry.write) return [["r", entry.url, "write"]];
        return [];
      }),
    );
