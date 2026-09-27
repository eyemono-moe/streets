import { describe, expect, test } from "vite-plus/test";
import { summarizeHeapSnapshot } from "./heap-summary";

/** Chrome が書き出す形の小さなスナップショット。フィールドの並びは実物と同じ。 */
const snapshot = (
  nodes: Array<
    [type: number, name: number, size: number, edges: number, detached: number]
  >,
  edges: Array<[type: number, name: number, to: number]>,
  strings: string[],
) =>
  Buffer.from(
    `{"snapshot":{"meta":{"node_fields":["type","name","id","self_size","edge_count","trace_node_id","detachedness"],` +
      `"node_types":[["hidden","array","string","object","code","closure","regexp","number","native"],"string","number","number","number","number","number"],` +
      `"edge_fields":["type","name_or_index","to_node"],` +
      `"edge_types":[["context","element","property","internal","hidden","shortcut","weak"],"string_or_number","node"]},` +
      `"node_count":${nodes.length},"edge_count":${edges.length}},\n` +
      `"nodes":[${nodes.map(([type, name, size, count, detached], id) => [type, name, id * 2 + 1, size, count, 0, detached].join(",")).join(",\n")}],\n` +
      `"edges":[${edges.flat().join(",")}],\n` +
      `"trace_function_infos":[],"samples":[],"locations":[],\n` +
      `"strings":[${strings.map((text) => JSON.stringify(text)).join(",\n")}]}`,
  );

const OBJECT = 3;
const STRING = 2;
const NATIVE = 8;
const PROPERTY = 2;

describe("summarizeHeapSnapshot", () => {
  test("種類と名前ごとに合計し、大きい順に並べる", () => {
    const summary = summarizeHeapSnapshot(
      snapshot(
        [
          [OBJECT, 0, 100, 0, 0],
          [OBJECT, 0, 50, 0, 0],
          [OBJECT, 1, 300, 0, 0],
          [STRING, 2, 40, 0, 0],
          [STRING, 3, 60, 0, 0],
        ],
        [],
        ["Map", "Array", "aaa", 'b"c'],
      ),
    );
    expect(summary.totalSize).toBe(550);
    expect(summary.top).toEqual([
      { type: "object", name: "Array", count: 1, size: 300 },
      { type: "object", name: "Map", count: 2, size: 150 },
      // 文字列は中身で分けない。
      { type: "string", name: "", count: 2, size: 100 },
    ]);
    expect(summary.byType[0]).toEqual({
      type: "object",
      name: "",
      count: 3,
      size: 450,
    });
  });

  test("id・pubkey・sig を持つオブジェクトをイベントとして数える", () => {
    const summary = summarizeHeapSnapshot(
      snapshot(
        [
          [OBJECT, 0, 10, 3, 0],
          [OBJECT, 0, 10, 2, 0],
          [STRING, 4, 8, 0, 0],
        ],
        [
          [PROPERTY, 1, 14],
          [PROPERTY, 2, 14],
          [PROPERTY, 3, 14],
          [PROPERTY, 1, 14],
          [PROPERTY, 2, 14],
        ],
        ["Object", "id", "pubkey", "sig", "x"],
      ),
    );
    expect(summary.nostrEvents).toBe(1);
  });

  test("ページから外れた DOM のノードを数える", () => {
    const summary = summarizeHeapSnapshot(
      snapshot(
        [
          [NATIVE, 0, 10, 0, 1],
          [NATIVE, 1, 10, 0, 2],
        ],
        [],
        ["HTMLDivElement", "Detached HTMLDivElement"],
      ),
    );
    expect(summary.detachedNodes).toBe(1);
  });
});
