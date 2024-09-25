import { kinds } from "nostr-tools";
import { createFilterQuery } from "../../libs/query";
import { parseFollowList, parseShortTextNote } from "./event";

// TODO: filter/search
export const useQueryShortText = (authors: () => string[] | undefined) => {
  return createFilterQuery(
    () => ({
      kinds: [kinds.ShortTextNote],
      authors: authors(),
      limit: 10,
    }),
    () => ["shortTextNote", authors()],
    parseShortTextNote,
    () => {
      const a = authors();
      return !!a && a.length > 0;
    },
  );
};

export const useQueryFollowList = (user: () => string | undefined) => {
  return createFilterQuery(
    () => ({
      kinds: [kinds.Contacts],
      authors: [user() ?? ""],
    }),
    () => ["follow", user()],
    parseFollowList,
    () => !!user(),
  );
};
