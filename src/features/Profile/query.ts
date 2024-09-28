import { kinds } from "nostr-tools";
import {
  createLatestByPubkeyQuery,
  createLatestFilterQuery,
} from "../../libs/query";
import { parseProfile } from "./event";

// TODO: https://tanstack.com/query/latest/docs/framework/react/reference/useQueries を使う
export const useQueryProfiles = (pubkey: () => string[] | undefined) => {
  return createLatestByPubkeyQuery(() => {
    const p = pubkey();
    const enable = !!p && p.length > 0;
    return {
      filter: {
        kinds: [kinds.Metadata],
        authors: pubkey(),
      },
      keys: ["profile", pubkey()],
      parser: parseProfile,
      enable,
    };
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
