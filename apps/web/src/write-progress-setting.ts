import {
  WRITE_PROGRESS_STORAGE_KEY,
  loadWriteProgress,
  saveWriteProgress,
} from "@streets/core/settings/write-progress-setting";
import { createSignal } from "solid-js";

const read = (): boolean => {
  try {
    return loadWriteProgress(localStorage.getItem(WRITE_PROGRESS_STORAGE_KEY));
  } catch {
    // ストレージが使えない環境でも、既定のまま出す。
    return true;
  }
};

const [showWriteProgress, setShow] = createSignal(read());

/** 書き込みの進み具合を出すか（この端末の設定）。 */
export { showWriteProgress };

export const setShowWriteProgress = (on: boolean) => {
  setShow(on);
  try {
    localStorage.setItem(WRITE_PROGRESS_STORAGE_KEY, saveWriteProgress(on));
  } catch {
    // 保存できなくても、今の画面には当たっている。
  }
};
