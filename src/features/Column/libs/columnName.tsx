import type { ColumnState } from "../context/deck";

export const columnIcon = (type: ColumnState["type"]) => {
  switch (type) {
    case "search":
      return "i-material-symbols:search-rounded";
    case "bookmarks":
      return "i-material-symbols:bookmark-outline";
    case "notifications":
      return "i-material-symbols:notifications-outline";
    case "reactions":
      return "i-material-symbols:favorite-outline";
    case "user":
      return "i-material-symbols:person-outline";
    case "follow":
      return "i-material-symbols:directions-run-rounded";
    case "followings":
      return "i-material-symbols:person-check-outline-rounded";
    case "followers":
      return "i-material-symbols:person-check-outline-rounded";
    default: {
      const _unreachable: never = type;
      throw new Error(`Unknown column type: ${_unreachable}`);
    }
  }
};

export const columnName = (type: ColumnState["type"]) => {
  switch (type) {
    case "search":
      return "検索";
    case "bookmarks":
      return "ブックマーク";
    case "notifications":
      return "通知";
    case "reactions":
      return "リアクション";
    case "user":
      return "ユーザー";
    case "follow":
      return "フォロー";
    case "followings":
      return "フォロー中";
    case "followers":
      return "フォロワー";
    default: {
      const _unreachable: never = type;
      throw new Error(`Unknown column type: ${_unreachable}`);
    }
  }
};
