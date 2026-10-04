import {
  COLUMN_PART_MEMORY_STORAGE_KEY,
  columnPartOpen as isOpen,
  loadColumnPartMemory,
  saveColumnPartMemory,
  setColumnPartOpen as update,
} from "@streets/core/settings/column-part-memory";
import { createSignal } from "solid-js";

const read = () => {
  try {
    return loadColumnPartMemory(
      localStorage.getItem(COLUMN_PART_MEMORY_STORAGE_KEY),
    );
  } catch {
    return [];
  }
};

const [memory, setMemory] = createSignal(read());

export const columnPartOpen = (column: string, part: string): boolean =>
  isOpen(memory(), column, part);

export const setColumnPartOpen = (
  column: string,
  part: string,
  open: boolean,
): void => {
  const next = update(memory(), column, part, open);
  setMemory(next);
  try {
    localStorage.setItem(
      COLUMN_PART_MEMORY_STORAGE_KEY,
      saveColumnPartMemory(next),
    );
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};
