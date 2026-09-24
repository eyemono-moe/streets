import { describe, expect, it } from "vite-plus/test";
import { loadDefaultReaction, saveDefaultReaction } from "./default-reaction";

describe("いいねボタンで送るリアクション", () => {
  it("保存していなければハート", () => {
    expect(loadDefaultReaction(null)).toEqual({ type: "like" });
  });

  it("Unicode の絵文字もカスタム絵文字も読み戻せる", () => {
    const text = { type: "text", content: "🔥" } as const;
    const emoji = {
      type: "emoji",
      shortcode: "wave",
      url: "https://example.com/wave.png",
    } as const;
    expect(loadDefaultReaction(saveDefaultReaction(text))).toEqual(text);
    expect(loadDefaultReaction(saveDefaultReaction(emoji))).toEqual(emoji);
  });

  it("読めない値はハートに戻す", () => {
    expect(loadDefaultReaction("{")).toEqual({ type: "like" });
    expect(loadDefaultReaction('{"type":"text","content":""}')).toEqual({
      type: "like",
    });
    expect(
      loadDefaultReaction('{"type":"emoji","shortcode":"wave","url":"x"}'),
    ).toEqual({
      type: "like",
    });
  });
});
