import type { Mutation } from "./draft";
import { addToList, removeFromList } from "./list";

const MUTE_KIND = 10000;

export type MuteTarget =
  | { type: "pubkey"; value: string }
  | { type: "hashtag"; value: string }
  | { type: "word"; value: string }
  | { type: "thread"; value: string };

/**
 * `word` だけ小文字化する —— NIP-51 が "lowercase strings" と定めており、
 * 大文字のまま入れると読む側の突き合わせが一致しない。
 */
const tagOf = (target: MuteTarget): { name: string; value: string } => {
  switch (target.type) {
    case "pubkey":
      return { name: "p", value: target.value };
    case "hashtag":
      return { name: "t", value: target.value };
    case "word":
      return { name: "word", value: target.value.toLowerCase() };
    case "thread":
      return { name: "e", value: target.value };
  }
};

export const addMute = (target: MuteTarget): Mutation => {
  const { name, value } = tagOf(target);
  return addToList(MUTE_KIND, name, value);
};

export const removeMute = (target: MuteTarget): Mutation => {
  const { name, value } = tagOf(target);
  return removeFromList(MUTE_KIND, name, value);
};
