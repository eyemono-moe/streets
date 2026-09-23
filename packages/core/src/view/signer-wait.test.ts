import { describe, expect, it } from "vitest";
import { signingWaitMessage } from "./signer-wait";

describe("signingWaitMessage", () => {
  it("よく使う操作を分かる名前で示す", () => {
    expect(signingWaitMessage(1)).toBe("投稿の署名を待っています");
    expect(signingWaitMessage(7)).toBe("リアクションの署名を待っています");
    expect(signingWaitMessage(10_000)).toBe("ミュートの署名を待っています");
  });

  it("知らない種類は番号を見せずに汎用の説明にする", () => {
    expect(signingWaitMessage(123_456)).toBe("操作の署名を待っています");
  });
});
