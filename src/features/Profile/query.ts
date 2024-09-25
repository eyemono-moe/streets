import { kinds } from "nostr-tools";
import { createFilterQuery } from "../../libs/query";
import { parseProfile } from "./event";

export const useQueryProfile = (pubkey: () => string | undefined) => {
  return createFilterQuery(
    () => ({
      kinds: [kinds.Metadata],
      authors: [pubkey() ?? ""],
    }),
    () => ["profile", pubkey()],
    parseProfile,
    () => !!pubkey(),
  );
};
