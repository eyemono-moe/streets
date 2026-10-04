import {
  COLUMN_TAB_MEMORY_STORAGE_KEY,
  type ColumnTabMemory,
  loadColumnTabMemory,
  recalledColumnTab,
  rememberColumnTab,
  saveColumnTabMemory,
} from "@streets/core/settings/column-tab-memory";
import type { TabMemory } from "./ui/ColumnTabs";

const read = (): ColumnTabMemory => {
  try {
    return loadColumnTabMemory(
      localStorage.getItem(COLUMN_TAB_MEMORY_STORAGE_KEY),
    );
  } catch {
    // ストレージが使えない環境では、何も覚えていないとして開く。
    return [];
  }
};

let memory: ColumnTabMemory | undefined;

/** そのカラムで開いていたタブを、この端末に覚える。 */
export const columnTabMemory = (column: string): TabMemory => ({
  recall: (tabs) => recalledColumnTab((memory ??= read()), column, tabs),
  remember: (tabs, value) => {
    memory = rememberColumnTab((memory ??= read()), column, tabs, value);
    try {
      localStorage.setItem(
        COLUMN_TAB_MEMORY_STORAGE_KEY,
        saveColumnTabMemory(memory),
      );
    } catch {
      // 保存できなくても、いまの画面には当たっている。
    }
  },
});
