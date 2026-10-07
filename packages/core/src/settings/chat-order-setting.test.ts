import { describe, expect, it } from "vite-plus/test";
import { loadChatOrder } from "./chat-order-setting";

describe("loadChatOrder", () => {
  it("保存した並び順を読む", () => {
    expect(loadChatOrder("newest-first")).toBe("newest-first");
    expect(loadChatOrder("newest-last")).toBe("newest-last");
  });

  it("未保存や読めない値は新しいものを下にする", () => {
    expect(loadChatOrder(null)).toBe("newest-last");
    expect(loadChatOrder("top")).toBe("newest-last");
  });
});
