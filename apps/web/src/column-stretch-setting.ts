import {
  COLUMN_STRETCH_STORAGE_KEY,
  loadColumnStretch,
  saveColumnStretch,
} from "@streets/core/settings/column-stretch-setting";
import { createSignal } from "solid-js";

const read = (): boolean => {
  try {
    return loadColumnStretch(localStorage.getItem(COLUMN_STRETCH_STORAGE_KEY));
  } catch {
    // ストレージが使えない環境でも、既定のまま使う。
    return false;
  }
};

const [columnStretch, setValue] = createSignal(read());

/** カラムを画面の幅いっぱいに広げるか（この端末の設定）。 */
export { columnStretch };

export const setColumnStretch = (on: boolean) => {
  setValue(on);
  try {
    localStorage.setItem(COLUMN_STRETCH_STORAGE_KEY, saveColumnStretch(on));
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};
