import { kinds } from "nostr-tools";
import { createLatestFilterQuery } from "../../libs/query";
import { parseProfile } from "./event";

export const useQueryProfile = (
  pubkey: () => string | undefined,
  relay?: () => string | undefined,
) => {
  return createLatestFilterQuery(() => {
    const p = pubkey();
    const enable = !!p && p.length > 0;
    return {
      filters: [
        {
          kinds: [kinds.Metadata],
          authors: [pubkey() ?? ""],
        },
      ],
      keys: ["profile", pubkey()],
      parser: parseProfile,
      enable,
      relay: relay?.(),
    };
  });
};
