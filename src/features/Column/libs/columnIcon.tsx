import type { ColumnState } from "./deckSchema";

export const columnIcon = (type: ColumnState["content"]["type"]) => {
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
    case "timeline":
      return "i-material-symbols:home-outline-rounded";
    case "followees":
      return "i-material-symbols:person-check-outline-rounded";
    case "followers":
      return "i-material-symbols:group-outline-rounded";
    default: {
      const _unreachable: never = type;
      throw new Error(`Unknown column type: ${_unreachable}`);
    }
  }
};
