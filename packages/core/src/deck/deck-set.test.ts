import { describe, expect, it } from "vite-plus/test";
import type { ColumnDef, DeckSet } from "./deck";
import {
  activeDeck,
  addDeck,
  moveDeckTo,
  nextDeckName,
  removeDeck,
  renameDeck,
  updateDeckIn,
} from "./deck-set";

const column = (id: string): ColumnDef => ({
  id,
  title: id,
  source: { kind: "literal", filters: [{ kinds: [1] }] },
});

const setOf = (...ids: string[]): DeckSet => ({
  version: 3,
  decks: ids.map((id) => ({ id, name: id, columns: [column(`${id}-home`)] })),
});

const ids = (set: DeckSet) => set.decks.map((deck) => deck.id);

describe("activeDeck", () => {
  it("覚えていた id のデッキを開く", () => {
    expect(activeDeck(setOf("a", "b"), "b").id).toBe("b");
  });

  it("覚えていたデッキが無くなっていたら、先頭を開く", () => {
    // 捕まえる変異: 見つからないとき undefined を返す（別の端末で消したデッキを開いていた端末が空になる）
    expect(activeDeck(setOf("a", "b"), "gone").id).toBe("a");
    expect(activeDeck(setOf("a", "b"), undefined).id).toBe("a");
  });
});

describe("updateDeckIn", () => {
  it("指したデッキだけを差し替える", () => {
    const set = setOf("a", "b");
    const next = updateDeckIn(set, "b", (deck) => ({ ...deck, columns: [] }));
    expect(next.decks[0]).toBe(set.decks[0]);
    expect(next.decks[1]?.columns).toEqual([]);
  });

  it("変わらなければ同じ参照を返す", () => {
    // 捕まえる変異: 常に作り直す（押しただけで保存と署名の要求が走る）
    const set = setOf("a");
    expect(updateDeckIn(set, "a", (deck) => deck)).toBe(set);
    expect(
      updateDeckIn(set, "gone", () => ({ id: "x", name: "x", columns: [] })),
    ).toBe(set);
  });
});

describe("addDeck", () => {
  it("末尾に足す", () => {
    const next = addDeck(setOf("a"), { id: "b", name: " B ", columns: [] });
    expect(ids(next)).toEqual(["a", "b"]);
    expect(next.decks[1]?.name).toBe("B");
  });

  it("複製元とカラムの配列を共有しない", () => {
    const set = setOf("a");
    const source = set.decks[0]!;
    const next = addDeck(set, { id: "b", name: "B", columns: source.columns });
    expect(next.decks[1]?.columns).toEqual(source.columns);
    expect(next.decks[1]?.columns).not.toBe(source.columns);
  });

  it("名前が空、または id が重なるなら足さない", () => {
    const set = setOf("a");
    expect(addDeck(set, { id: "b", name: "  ", columns: [] })).toBe(set);
    expect(addDeck(set, { id: "a", name: "A", columns: [] })).toBe(set);
  });
});

describe("renameDeck", () => {
  it("前後の空白を落として名前を変える", () => {
    expect(renameDeck(setOf("a"), "a", " PC ").decks[0]?.name).toBe("PC");
  });

  it("空の名前や同じ名前なら変えない", () => {
    // 捕まえる変異: 空の名前を通す（loadDeckSet がそのデッキを捨て、次に開いたとき消える）
    const set = setOf("a");
    expect(renameDeck(set, "a", " ")).toBe(set);
    expect(renameDeck(set, "a", "a")).toBe(set);
  });
});

describe("removeDeck", () => {
  it("指したデッキを消す", () => {
    expect(ids(removeDeck(setOf("a", "b"), "a"))).toEqual(["b"]);
  });

  it("最後の 1 つは消さない", () => {
    // 捕まえる変異: 最後の 1 つも消す（開くデッキが無くなり、保存すると読めない形になる）
    const set = setOf("a");
    expect(removeDeck(set, "a")).toBe(set);
  });

  it("無い id なら変えない", () => {
    const set = setOf("a", "b");
    expect(removeDeck(set, "gone")).toBe(set);
  });
});

describe("moveDeckTo", () => {
  it("指した位置へ動かす", () => {
    expect(ids(moveDeckTo(setOf("a", "b", "c"), "a", 2))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("範囲の外や同じ位置なら変えない", () => {
    const set = setOf("a", "b");
    expect(moveDeckTo(set, "a", 0)).toBe(set);
    expect(moveDeckTo(set, "a", 2)).toBe(set);
    expect(moveDeckTo(set, "gone", 0)).toBe(set);
  });
});

describe("nextDeckName", () => {
  it("数の続きで、使われていない名前を返す", () => {
    expect(nextDeckName(setOf("a"))).toBe("デッキ 2");
    const set: DeckSet = {
      version: 3,
      decks: [
        { id: "a", name: "メイン", columns: [] },
        { id: "b", name: "デッキ 3", columns: [] },
      ],
    };
    expect(nextDeckName(set)).toBe("デッキ 4");
  });
});
