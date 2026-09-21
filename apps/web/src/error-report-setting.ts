import {
  ERROR_REPORT_STORAGE_KEY,
  loadErrorReport,
  saveErrorReport,
} from "@streets/core/settings/error-report-setting";
import { createSignal } from "solid-js";

const read = (): boolean => {
  try {
    return loadErrorReport(localStorage.getItem(ERROR_REPORT_STORAGE_KEY));
  } catch {
    // ストレージが使えない環境でも、既定のまま送る。
    return true;
  }
};

const [errorReport, setValue] = createSignal(read());

/** 不具合の報告を送るか（この端末の設定）。 */
export { errorReport };

export const setErrorReport = (on: boolean) => {
  setValue(on);
  try {
    localStorage.setItem(ERROR_REPORT_STORAGE_KEY, saveErrorReport(on));
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};
