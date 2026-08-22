import { type Mutation, addTagValue, removeTagValue } from "./draft";

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
  return addTagValue(BOOKMARK_KIND, name, value);
};

export const removeBookmark = (target: BookmarkTarget): Mutation => {
  const { name, value } = tagOf(target);
  return removeTagValue(BOOKMARK_KIND, name, value);
};
