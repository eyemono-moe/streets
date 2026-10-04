import { describe, expect, it } from "vite-plus/test";
import {
  type ColumnPartMemory,
  columnPartOpen,
  loadColumnPartMemory,
  saveColumnPartMemory,
  setColumnPartOpen,
} from "./column-part-memory";

describe("カラムのパーツの開閉", () => {
  it("未保存・壊れた値では開き、閉じた状態はカラムとパーツごとに復元する", () => {
    expect(loadColumnPartMemory(null)).toEqual([]);
    expect(loadColumnPartMemory("{")).toEqual([]);
    expect(loadColumnPartMemory('{"a":"b"}')).toEqual([]);
    let memory: ColumnPartMemory = [];
    memory = setColumnPartOpen(memory, "c1", "profile", false);
    const loaded = loadColumnPartMemory(saveColumnPartMemory(memory));
    expect(columnPartOpen(loaded, "c1", "profile")).toBe(false);
    expect(columnPartOpen(loaded, "c2", "profile")).toBe(true);
    expect(columnPartOpen(loaded, "c1", "another")).toBe(true);
    expect(setColumnPartOpen(loaded, "c1", "profile", true)).toEqual([]);
  });

  it("閉じたパーツを重複させず、古い記録から捨てる", () => {
    let memory: ColumnPartMemory = [];
    for (let index = 0; index < 250; index++) {
      memory = setColumnPartOpen(memory, `c${index}`, "profile", false);
    }
    memory = setColumnPartOpen(memory, "c100", "profile", false);
    expect(memory).toHaveLength(200);
    expect(columnPartOpen(memory, "c0", "profile")).toBe(true);
    expect(memory.at(-1)).toEqual(["c100", "profile"]);
  });
});
