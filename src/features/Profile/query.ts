import { kinds } from "nostr-tools";
import {
  createLatestByPubkeyQuery,
  createLatestFilterQuery,
} from "../../libs/query";
import { parseProfile } from "./event";

export const useQueryProfiles = (pubkey: () => string[] | undefined) => {
  return createLatestByPubkeyQuery(
    () => ({
      kinds: [kinds.Metadata],
      authors: pubkey(),
    }),
    () => ["profile", pubkey()],
    parseProfile,
    () => {
      const p = pubkey();
      return !!p && p.length > 0;
    },
  );
};
export const useQueryProfile = (pubkey: () => string | undefined) => {
  return createLatestFilterQuery(
    () => ({
      kinds: [kinds.Metadata],
      authors: [pubkey() ?? ""],
    }),
    () => ["profile", pubkey()],
    parseProfile,
    () => {
      const p = pubkey();
      return !!p && p.length > 0;
    },
  );
};
