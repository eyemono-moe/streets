import type { Mutation } from "./draft";
import { addToList, removeFromList } from "./list";

const BOOKMARK_KIND = 10003;

export type BookmarkTarget =
  | { type: "note"; value: string }
  | { type: "article"; value: string };

const tagOf = (target: BookmarkTarget): { name: string; value: string } =>
  target.type === "note"
    ? { name: "e", value: target.value }
    : { name: "a", value: target.value };

export const addBookmark = (target: BookmarkTarget): Mutation => {
  const { name, value } = tagOf(target);
  return addToList(BOOKMARK_KIND, name, value);
};

export const removeBookmark = (target: BookmarkTarget): Mutation => {
  const { name, value } = tagOf(target);
  return removeFromList(BOOKMARK_KIND, name, value);
};
