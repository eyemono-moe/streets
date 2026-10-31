import { describe, expect, it } from "vite-plus/test";
import { signingWaitMessage } from "./signer-wait";

describe("signingWaitMessage", () => {
  it("よく使う操作を分かる名前で示す", () => {
    expect(signingWaitMessage(1)).toEqual({ key: "signer.wait.post" });
    expect(signingWaitMessage(7)).toEqual({
      key: "signer.wait.reaction",
    });
    expect(signingWaitMessage(10_000)).toEqual({ key: "signer.wait.mute" });
  });

  it("知らない種類は番号を見せずに汎用の説明にする", () => {
    expect(signingWaitMessage(123_456)).toEqual({
      key: "signer.wait.unknown",
    });
  });
});
