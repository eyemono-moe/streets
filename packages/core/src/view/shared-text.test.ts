import { describe, expect, it } from "vite-plus/test";
import { sharedText } from "./shared-text";

describe("sharedText", () => {
  it("ページを共有したときは、題と URL を 2 行にする", () => {
    expect(
      sharedText({ title: "記事の題", url: "https://example.com/a" }),
    ).toBe("記事の題\nhttps://example.com/a");
  });

  it("URL が text に入って届いたときも、題を前に付ける", () => {
    expect(
      sharedText({ title: "記事の題", text: "https://example.com/a" }),
    ).toBe("記事の題\nhttps://example.com/a");
  });

  it("text に入っている URL を url から重ねて足さない", () => {
    expect(
      sharedText({
        text: "これ読んで https://example.com/a",
        url: "https://example.com/a",
      }),
    ).toBe("これ読んで https://example.com/a");
  });

  it("選んだ文を共有したときは、題を付けずに文と URL を並べる", () => {
    expect(
      sharedText({
        title: "記事の題",
        text: "選んだ一文",
        url: "https://example.com/a",
      }),
    ).toBe("選んだ一文\nhttps://example.com/a");
  });

  it("題が text に含まれていれば重ねない", () => {
    expect(
      sharedText({ title: "記事の題", text: "記事の題 https://example.com/a" }),
    ).toBe("記事の題 https://example.com/a");
  });

  it("前後の空白だけの欄は無いものとして扱う", () => {
    expect(sharedText({ title: "  ", text: "\n本文\n", url: "" })).toBe("本文");
  });

  it("何も届かなければ空にする（画像だけの共有）", () => {
    expect(sharedText({})).toBe("");
  });
});
