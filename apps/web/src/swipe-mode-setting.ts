import {
  SWIPE_MODE_STORAGE_KEY,
  type SwipeMode,
  loadSwipeMode,
} from "@streets/core/settings/swipe-mode-setting";
import { createSignal } from "solid-js";

const read = (): SwipeMode => {
  try {
    return loadSwipeMode(localStorage.getItem(SWIPE_MODE_STORAGE_KEY));
  } catch {
    // ストレージが使えない環境でも、既定のまま使う。
    return "loop";
  }
};

const [swipeMode, setValue] = createSignal(read());

/** 1 列ずつのときに左右へ払うと何が起きるか（この端末の設定）。 */
export { swipeMode };

export const setSwipeMode = (mode: SwipeMode) => {
  setValue(mode);
  try {
    localStorage.setItem(SWIPE_MODE_STORAGE_KEY, mode);
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};
