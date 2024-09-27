import { kinds } from "nostr-tools";
import {
  createFilterQuery,
  createInfiniteFilterQuery,
  createLatestFilterQuery,
} from "../../libs/query";
import {
  parseFollowList,
  parseShortTextNote,
  parseTextNoteOrRepost,
} from "./event";

// TODO: filter/search
// TODO: authorsではなくfilterを指定させる?

// 現在以降の最新のShortTextNoteを取得する
export const useQueryLatestTextOrRepost = (
  authors: () => string[] | undefined,
) => {
  return createFilterQuery(
    () => ({
      kinds: [kinds.ShortTextNote, kinds.Repost],
      authors: authors(),
      since: Math.floor(Date.now() / 1000),
    }),
    () => ["shortTextNote", authors()],
    parseTextNoteOrRepost,
    () => {
      const a = authors();
      return !!a && a.length > 0;
    },
  );
};

export const useQueryInfiniteTextOrRepost = (
  authors: () => string[] | undefined,
) => {
  return createInfiniteFilterQuery(
    () => ({
      kinds: [kinds.ShortTextNote, kinds.Repost],
      authors: authors(),
    }),
    () => ["infiniteShortTextNote", authors()],
    parseTextNoteOrRepost,
    () => {
      const a = authors();
      return !!a && a.length > 0;
    },
  );
};

export const useQueryShortTextById = (id: () => string | undefined) => {
  return createLatestFilterQuery(
    () => ({
      kinds: [kinds.ShortTextNote],
      ids: [id() ?? ""],
    }),
    () => ["shortTextNote", id()],
    parseShortTextNote,
    () => !!id(),
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
