import {
  COLUMN_DIGITS_STORAGE_KEY,
  loadColumnDigits,
  saveColumnDigits,
} from "@streets/core/settings/column-digits-setting";
import { createSignal } from "solid-js";

const read = (): boolean => {
  try {
    return loadColumnDigits(localStorage.getItem(COLUMN_DIGITS_STORAGE_KEY));
  } catch {
    // ストレージが使えない環境でも、既定のまま使う。
    return true;
  }
};

const [columnDigits, setValue] = createSignal(read());

/** 数字キーでカラムを見せるか（この端末の設定）。 */
export { columnDigits };

export const setColumnDigits = (on: boolean) => {
  setValue(on);
  try {
    localStorage.setItem(COLUMN_DIGITS_STORAGE_KEY, saveColumnDigits(on));
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};
