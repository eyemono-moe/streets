import { describe, expect, it } from "vitest";
import type { ColumnDef, Deck } from "../../core/deck/deck";
import {
  addColumnTo,
  moveColumnIn,
  removeColumnFrom,
  renameColumnIn,
} from "./deck-mutations";

const column = (id: string, title = id): ColumnDef => ({
  id,
  title,
  source: { kind: "literal", filters: [{ kinds: [1] }] },
});

const deck = (...ids: string[]): Deck => ({
  version: 2,
  columns: ids.map((id) => column(id)),
});

describe("addColumnTo", () => {
  it("末尾に追加する", () => {
    // 捕まえる変異: 先頭へ追加する (追加したカラムが右端に出る前提が崩れる)
    const next = addColumnTo(deck("a", "b"), column("c"));
    expect(next.columns.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("removeColumnFrom", () => {
  it("id が一致するカラムだけを消す", () => {
    // 捕まえる変異: 等号を取り違えて一致しないほうを残す (全消し/無消しも)
    const next = removeColumnFrom(deck("a", "b", "c"), "b");
    expect(next.columns.map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("moveColumnIn", () => {
  it("direction 方向の隣と入れ替える", () => {
    // 捕まえる変異: from/to を入れ替えて逆方向に動かす
    const next = moveColumnIn(deck("a", "b", "c"), "a", 1);
    expect(next.columns.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("左端では同じ参照を返す (書き込みを起こさない)", () => {
    // 捕まえる変異: 端で clamp して入れ替える (新しいオブジェクトを返すと
    // 呼び出し側の参照比較が誤判定し、無駄な書き込みが起きる)
    const current = deck("a", "b", "c");
    expect(moveColumnIn(current, "a", -1)).toBe(current);
  });

  it("右端では同じ参照を返す", () => {
    // 捕まえる変異: 右端の判定 (`to >= columns.length`) が抜けている
    const current = deck("a", "b", "c");
    expect(moveColumnIn(current, "c", 1)).toBe(current);
  });
});

describe("renameColumnIn", () => {
  it("前後の空白を trim してタイトルを更新する", () => {
    // 捕まえる変異: trim しない (保存されるタイトルに空白が残る)
    const next = renameColumnIn(deck("a"), "a", "  new title  ");
    expect(next.columns[0]?.title).toBe("new title");
  });

  it("空タイトルは同じ参照を返して拒否する", () => {
    // 捕まえる変異: 空文字チェックを落とす (次のリロードでデッキ全体が
    // 既定に戻る)
    const current = deck("a");
    expect(renameColumnIn(current, "a", "   ")).toBe(current);
  });

  it("trim 後に元のタイトルと同じなら同じ参照を返す (最終レビュー Minor 2)", () => {
    // 捕まえる変異: trim 後の一致判定を落とす (blur するだけで新しい
    // カラムオブジェクトができ、`<For>` が remount してしまう)
    const current = deck("a");
    expect(renameColumnIn(current, "a", "  a  ")).toBe(current);
  });
});
