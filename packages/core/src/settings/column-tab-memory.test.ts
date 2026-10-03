import { describe, expect, it } from "vite-plus/test";
import {
  type ColumnTabMemory,
  loadColumnTabMemory,
  recalledColumnTab,
  rememberColumnTab,
  saveColumnTabMemory,
} from "./column-tab-memory";

describe("カラムで開いていたタブ", () => {
  it("保存していない・読めない値は何も覚えていない", () => {
    expect(loadColumnTabMemory(null)).toEqual([]);
    expect(loadColumnTabMemory("{")).toEqual([]);
    expect(loadColumnTabMemory('{"a":"b"}')).toEqual([]);
  });

  it("カラムとタブの並びごとに覚え、保存した値は読み戻せる", () => {
    let memory: ColumnTabMemory = [];
    memory = rememberColumnTab(memory, "c1", "この人の表示", "media");
    memory = rememberColumnTab(memory, "c2", "この人の表示", "reactions");
    const loaded = loadColumnTabMemory(saveColumnTabMemory(memory));
    expect(recalledColumnTab(loaded, "c1", "この人の表示")).toBe("media");
    expect(recalledColumnTab(loaded, "c2", "この人の表示")).toBe("reactions");
    expect(recalledColumnTab(loaded, "c1", "別のタブ")).toBeUndefined();
  });

  it("同じタブの並びは上書きする", () => {
    let memory: ColumnTabMemory = [];
    memory = rememberColumnTab(memory, "c1", "t", "media");
    memory = rememberColumnTab(memory, "c1", "t", "posts");
    expect(memory).toEqual([["c1", "t", "posts"]]);
  });

  it("増えすぎたら、長く触っていないものから捨てる", () => {
    let memory: ColumnTabMemory = [];
    for (let index = 0; index < 250; index++) {
      memory = rememberColumnTab(memory, `c${index}`, "t", "media");
    }
    memory = rememberColumnTab(memory, "c100", "t", "posts");
    expect(memory).toHaveLength(200);
    expect(recalledColumnTab(memory, "c0", "t")).toBeUndefined();
    expect(recalledColumnTab(memory, "c249", "t")).toBe("media");
    expect(memory.at(-1)).toEqual(["c100", "t", "posts"]);
  });
});
