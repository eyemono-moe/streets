import { describe, expect, it } from "vitest";
import { scrubText, scrubUrl } from "./scrub";

describe("scrubText", () => {
  it("秘密鍵を落とす", () => {
    expect(
      scrubText(
        "失敗: nsec184zyk5jevpnkuatusw9frxyl56kmfw7ze8gd0hh9anel5qsfzqtsj8hxq2",
      ),
    ).toBe("失敗: [nsec]");
  });

  it("公開鍵とイベントの参照を落とす", () => {
    expect(
      scrubText(
        "npub1aykfss88dpn4l2rtullagc9vfq6e7qe9708dpxp73funmdp22rqqlqwm58 の note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
      ),
    ).toBe("[npub] の [note]");
  });

  it("16 進数 64 桁も落とす", () => {
    expect(scrubText(`id=${"a".repeat(64)} です`)).toBe("id=[id] です");
  });

  it("関係のない文字は変えない", () => {
    expect(scrubText("カラムを開けませんでした（kind:30078）")).toBe(
      "カラムを開けませんでした（kind:30078）",
    );
  });

  it("短い 16 進数は落とさない", () => {
    expect(scrubText("色は #8440bd です")).toBe("色は #8440bd です");
  });
});

describe("scrubUrl", () => {
  it("経路に入った参照を落とす", () => {
    expect(
      scrubUrl(
        "https://streets.eyemono.moe/npub1aykfss88dpn4l2rtullagc9vfq6e7qe9708dpxp73funmdp22rqqlqwm58",
      ),
    ).toBe("https://streets.eyemono.moe/[npub]");
  });

  it("問い合わせ文字列と断片は丸ごと落とす", () => {
    expect(scrubUrl("https://streets.eyemono.moe/?relays=ws://x#y")).toBe(
      "https://streets.eyemono.moe/",
    );
  });

  it("URL として読めないものは、文として落とす", () => {
    expect(scrubUrl(`/notes/${"b".repeat(64)}`)).toBe("/notes/[id]");
  });
});
