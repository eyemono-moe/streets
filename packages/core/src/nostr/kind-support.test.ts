import { describe, expect, it } from "vite-plus/test";
import { kindLabel } from "./kind-support";

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
