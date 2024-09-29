import { type Filter, kinds } from "nostr-tools";
import {
  createFilterQuery,
  createInfiniteFilterQuery,
  createLatestFilterQuery,
} from "../../libs/query";
import {
  parseFollowList,
  parseReaction,
  parseRepost,
  parseShortTextNote,
  parseTextNoteOrRepost,
} from "./event";

// TODO: filter/search
// TODO: authorsではなくfilterを指定させる?

// 現在以降の最新のShortTextNoteを取得する
export const useQueryLatestTextOrRepost = (
  filter: () => Omit<Filter, "kinds" | "since"> | undefined,
) => {
  return createFilterQuery(() => {
    return {
      filter: {
        kinds: [kinds.ShortTextNote, kinds.Repost],
        since: Math.floor(Date.now() / 1000),
        ...filter(),
      },
      keys: [
        "shortTextNote",
        {
          ...filter(),
        },
      ],
      parser: parseTextNoteOrRepost,
      enable: !!filter(),
      closeOnEOS: false,
    };
  });
};

export const useQueryInfiniteTextOrRepost = (
  filter: () => Omit<Filter, "kinds"> | undefined,
) => {
  return createInfiniteFilterQuery(() => {
    return {
      filter: {
        kinds: [kinds.ShortTextNote, kinds.Repost],
        ...filter(),
      },
      keys: ["infiniteShortTextNote", { ...filter() }],
      parser: parseTextNoteOrRepost,
      enable: !!filter(),
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
    immediate: true,
  }));
};

export const useQueryReactions = (targetEventId: () => string | undefined) => {
  return createFilterQuery(() => ({
    filter: {
      kinds: [kinds.Reaction],
      "#e": [targetEventId() ?? ""],
    },
    keys: [
      "reactions",
      {
        eventId: targetEventId(),
      },
    ],
    parser: parseReaction,
    enable: !!targetEventId(),
  }));
};

export const useQueryReposts = (targetEventId: () => string | undefined) => {
  return createFilterQuery(() => ({
    filter: {
      kinds: [kinds.Repost],
      "#e": [targetEventId() ?? ""],
    },
    keys: [
      "reposts",
      {
        eventId: targetEventId(),
      },
    ],
    parser: parseRepost,
    enable: !!targetEventId(),
  }));
};
