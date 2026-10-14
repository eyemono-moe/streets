import {
  DEFAULT_READ_REDUNDANCY,
  READ_REDUNDANCY_STORAGE_KEY,
  type ReadRedundancy,
  loadReadRedundancy,
  saveReadRedundancy,
} from "@streets/core/settings/read-redundancy-setting";
import { createSignal } from "solid-js";

const read = (): ReadRedundancy => {
  try {
    return loadReadRedundancy(
      localStorage.getItem(READ_REDUNDANCY_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_READ_REDUNDANCY;
  }
};

const [readRedundancy, setValue] = createSignal(read());

/** 1 人あたりに読むリレーの数（この端末の設定）。 */
export { readRedundancy };

export const setReadRedundancy = (value: ReadRedundancy) => {
  setValue(value);
  try {
    localStorage.setItem(
      READ_REDUNDANCY_STORAGE_KEY,
      saveReadRedundancy(value),
    );
  } catch {
    // 保存できなくても、今の画面には当たっている。
  }
};
