import { kinds } from "nostr-tools";
import { createFilterQuery, createInfiniteFilterQuery } from "../../libs/query";
import { parseFollowList, parseShortTextNote } from "./event";

// TODO: filter/search

// 現在以降の最新のShortTextNoteを取得する
export const useQueryLatestShortText = (
  authors: () => string[] | undefined,
) => {
  return createFilterQuery(
    () => ({
      kinds: [kinds.ShortTextNote],
      authors: authors(),
      since: Math.floor(Date.now() / 1000),
    }),
    () => ["shortTextNote", authors()],
    parseShortTextNote,
    () => {
      const a = authors();
      return !!a && a.length > 0;
    },
  );
};

export const useQueryInfiniteShortText = (
  authors: () => string[] | undefined,
) => {
  return createInfiniteFilterQuery(
    () => ({
      kinds: [kinds.ShortTextNote],
      authors: authors(),
      limit: 10,
    }),
    () => ["infiniteShortTextNote", authors()],
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
