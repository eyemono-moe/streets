import { describe, expect, it } from "vite-plus/test";
import { findKinds, kindLabel } from "./kind-support";

describe("kindLabel", () => {
  it("一覧にある kind は、その呼び名を返す", () => {
    expect(kindLabel(1)).toBe("投稿");
    expect(kindLabel(30_023)).toBe("長文記事");
  });

  it("一覧に無い kind を投稿と呼ばない", () => {
    // 捕まえる変異: 既定を「投稿」にして、知らない kind が投稿に見える
    expect(kindLabel(99_999)).toBe("イベント");
  });
});

describe("findKinds", () => {
  const kinds = (query: string) => findKinds(query).map((entry) => entry.kind);

  it("何も打っていなければ、画面で描ける kind だけを出す", () => {
    expect(kinds("")).toContain(1);
    expect(kinds("")).not.toContain(3);
  });

  it("数字は番号の頭で引き、同じ番号を先に出す", () => {
    expect(kinds("1").slice(0, 3)).toEqual([1, 16, 1018]);
    expect(kinds("30023")).toEqual([30_023]);
  });

  it("呼び名で引くときは、内部で使う kind も出す", () => {
    expect(kinds("フォロー")).toContain(3);
  });

  it("呼び名の頭で合うものを、途中で合うものより先に出す", () => {
    const found = kinds("リポスト");
    expect(found.indexOf(6)).toBeLessThan(found.indexOf(16));
  });

  it("カタカナの呼び名をひらがなでも引ける", () => {
    expect(kinds("りぽすと")).toContain(6);
  });
});
