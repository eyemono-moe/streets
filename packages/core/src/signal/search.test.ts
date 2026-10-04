import { describe, expect, it } from "vite-plus/test";
import { searchEntries, type SearchEntry } from "./search";

const entries: SearchEntry[] = [
  {
    id: "width",
    title: "カラムの幅",
    section: "表示",
    keywords: ["column width"],
  },
  {
    id: "add",
    title: "カラムを追加",
    section: "操作",
    aliases: ["列を増やす"],
    shortcodes: ["add-column"],
  },
  { id: "media", title: "画像の表示", description: "写真を縮めます" },
];

describe("searchEntries", () => {
  it("完全一致を前方一致や説明の一致より先に置く", () => {
    const hits = searchEntries(entries, "カラムの幅");
    expect(hits[0]?.entry.id).toBe("width");
  });

  it("全角英字とカタカナの違いを吸収して検索する", () => {
    expect(searchEntries(entries, "ＣＯＬＵＭＮ width")[0]?.entry.id).toBe(
      "width",
    );
    expect(searchEntries(entries, "かラむ")[0]?.entry.id).toBe("width");
  });

  it("別名とショートコードからも見つける", () => {
    expect(searchEntries(entries, "列を増やす")[0]?.entry.id).toBe("add");
    expect(searchEntries(entries, "add-column")[0]?.entry.id).toBe("add");
  });

  it("複数語はすべて一致し、同点は登録順を保つ", () => {
    expect(searchEntries(entries, "カラム 画像")).toEqual([]);
    const tied = [
      { id: "a", title: "検索" },
      { id: "b", title: "検索" },
    ];
    expect(searchEntries(tied, "検索").map(({ entry }) => entry.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("短い語で曖昧一致を広げず、空入力では結果を返さない", () => {
    expect(searchEntries(entries, "かむ")).toEqual([]);
    expect(searchEntries(entries, "   ")).toEqual([]);
  });
});
