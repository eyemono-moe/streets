import type { ReactionInput } from "@streets/core/nostr/reaction";
import {
  DEFAULT_REACTION_STORAGE_KEY,
  loadDefaultReaction,
} from "@streets/core/settings/default-reaction";
import { createSignal } from "solid-js";

const readLegacy = (): ReactionInput => {
  try {
    return loadDefaultReaction(
      localStorage.getItem(DEFAULT_REACTION_STORAGE_KEY),
    );
  } catch {
    // ストレージが使えない環境でも、既定のまま送る。
    return { type: "like" };
  }
};

// 端末に保存していたころの値。アカウントに保存し直すまでは、こちらを送り続ける
// —— 切り替えた途端にハートへ戻ると、選んだ絵文字が消えたように見える。
const legacy = readLegacy();

const [defaultReaction, setValue] = createSignal(legacy);

/** いいねボタンで送るリアクション（アカウントの設定）。 */
export { defaultReaction };

/** アカウントに保存された値を当てる。デッキの値が変わるたびに呼ぶ。 */
export const applyDefaultReaction = (saved: ReactionInput | undefined) => {
  setValue(saved ?? legacy);
};
