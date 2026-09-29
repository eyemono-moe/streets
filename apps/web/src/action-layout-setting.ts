import {
  ACTION_LAYOUT_STORAGE_KEY,
  type ActionLayout,
  defaultActionLayout,
  loadActionLayout,
  saveActionLayout,
} from "@streets/core/settings/action-layout";
import { createSignal } from "solid-js";

const read = (): ActionLayout => {
  try {
    return loadActionLayout(localStorage.getItem(ACTION_LAYOUT_STORAGE_KEY));
  } catch {
    // ストレージが使えない環境でも、既定の並びで出す。
    return defaultActionLayout();
  }
};

const [actionLayout, setValue] = createSignal(read());

/** 投稿のアクション欄に出す操作と、メニューに入れる操作（この端末の設定）。 */
export { actionLayout };

export const setActionLayout = (layout: ActionLayout) => {
  setValue(layout);
  try {
    localStorage.setItem(ACTION_LAYOUT_STORAGE_KEY, saveActionLayout(layout));
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};
