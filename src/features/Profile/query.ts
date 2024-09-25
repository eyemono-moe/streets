import { kinds } from "nostr-tools";
import { createLatestFilterQuery } from "../../libs/query";
import { parseProfile } from "./event";

export const useQueryProfile = (pubkey: () => string | undefined) => {
  return createLatestFilterQuery(
    () => ({
      kinds: [kinds.Metadata],
      authors: [pubkey() ?? ""],
    }),
    () => ["profile", pubkey()],
    parseProfile,
    () => !!pubkey(),
  );
};
