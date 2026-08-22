import type { RelayListEntry } from "../../read/relay-list";
import { type Mutation, replaceTags } from "./draft";

const RELAY_LIST_KIND = 10002;

/**
 * NIP-65 の kind:10002。read と write の両方ならマーカーを付けない ——
 * NIP-65 はマーカー無しを「両方」と定めており、`read` と `write` の
 * 2 本に分けると他クライアントの表示で 2 本のリレーに見える。
 *
 * read も write も false のエントリは落とす。意味を持たない。
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
