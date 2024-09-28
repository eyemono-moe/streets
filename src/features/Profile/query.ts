import { kinds } from "nostr-tools";
import {
  createLatestFilterQueries,
  createLatestFilterQuery,
} from "../../libs/query";
import { parseProfile } from "./event";

// TODO: https://tanstack.com/query/latest/docs/framework/react/reference/useQueries を使う
export const useQueryProfiles = (pubkey: () => string[] | undefined) => {
  const tmpPubkey = pubkey();
  if (!tmpPubkey) {
    return [];
  }
  return createLatestFilterQueries(() => {
    return tmpPubkey.map((p) => ({
      filter: {
        kinds: [kinds.Metadata],
        authors: [p],
      },
      keys: ["profile", p],
      parser: parseProfile,
      enable: true,
    }));
  });
};
export const useQueryProfile = (pubkey: () => string | undefined) => {
  return createLatestFilterQuery(() => {
    const p = pubkey();
    const enable = !!p && p.length > 0;
    return {
      filter: {
        kinds: [kinds.Metadata],
        authors: [pubkey() ?? ""],
      },
      keys: ["profile", pubkey()],
      parser: parseProfile,
      enable,
    };
  });
};
