import {
  TIME_FORMAT_STORAGE_KEY,
  type TimeFormat,
  loadTimeFormat,
} from "@streets/core/settings/time-format-setting";
import { createSignal } from "solid-js";

const read = (): TimeFormat => {
  try {
    return loadTimeFormat(localStorage.getItem(TIME_FORMAT_STORAGE_KEY));
  } catch {
    return loadTimeFormat(null);
  }
};

const [timeFormat, setFormat] = createSignal(read());

/** 投稿の時刻の見せ方（この端末の設定）。 */
export { timeFormat };

export const setTimeFormat = (format: TimeFormat) => {
  setFormat(format);
  try {
    localStorage.setItem(TIME_FORMAT_STORAGE_KEY, format);
  } catch {
    // 保存できなくても、今の画面には当てる。
  }
};
