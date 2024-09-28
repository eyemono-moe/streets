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
  return createFilterQuery(() => {
    const a = authors();
    const enable = !!a && a.length > 0;
    return {
      filter: {
        kinds: [kinds.ShortTextNote, kinds.Repost],
        authors: authors(),
        since: Math.floor(Date.now() / 1000),
      },
      keys: [
        "shortTextNote",
        {
          authors: authors(),
        },
      ],
      parser: parseTextNoteOrRepost,
      enable,
      closeOnEOS: false,
    };
  });
};

export const useQueryInfiniteTextOrRepost = (
  authors: () => string[] | undefined,
) => {
  return createInfiniteFilterQuery(() => {
    const a = authors();
    const enable = !!a && a.length > 0;
    return {
      filter: {
        kinds: [kinds.ShortTextNote, kinds.Repost],
        authors: authors(),
      },
      keys: ["infiniteShortTextNote", { authors: authors() }],
      parser: parseTextNoteOrRepost,
      enable,
    };
  });
};

export const useQueryShortTextById = (id: () => string | undefined) => {
  return createLatestFilterQuery(() => ({
    filter: {
      kinds: [kinds.ShortTextNote],
      ids: [id() ?? ""],
    },
    keys: ["shortTextNote", { id: id() }],
    parser: parseShortTextNote,
    enable: !!id(),
  }));
};

export const useQueryFollowList = (user: () => string | undefined) => {
  return createLatestFilterQuery(() => ({
    filter: {
      kinds: [kinds.Contacts],
      authors: [user() ?? ""],
    },
    keys: ["follow", user()],
    parser: parseFollowList,
    enable: !!user(),
  }));
};
