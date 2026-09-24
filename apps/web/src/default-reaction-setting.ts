import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import {
  DEFAULT_REACTION_STORAGE_KEY,
  loadDefaultReaction,
  saveDefaultReaction,
} from "@streets/core/settings/default-reaction";
import { createSignal } from "solid-js";

const read = (): ReactionInput => {
  try {
    return loadDefaultReaction(
      localStorage.getItem(DEFAULT_REACTION_STORAGE_KEY),
    );
  } catch {
    // ストレージが使えない環境でも、既定のまま送る。
    return { type: "like" };
  }
};

const [defaultReaction, setValue] = createSignal(read());

/** いいねボタンで送るリアクション（この端末の設定）。 */
export { defaultReaction };

export const setDefaultReaction = (input: ReactionInput) => {
  setValue(input);
  try {
    localStorage.setItem(
      DEFAULT_REACTION_STORAGE_KEY,
      saveDefaultReaction(input),
    );
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};
