import { describe, expect, it } from "vite-plus/test";
import { menuProgress, menuSwipeIntent, settleMenu } from "./menu-swipe";

const start = { x: 100, y: 300 };

describe("menuSwipeIntent", () => {
  it("少し動いただけでは決めない", () => {
    expect(menuSwipeIntent(start, { x: 106, y: 303 }, "right")).toBe("pending");
  });

  it("横に右へ払ったら、メニューを開く払い方とみなす", () => {
    expect(menuSwipeIntent(start, { x: 130, y: 305 }, "right")).toBe("menu");
  });

  it("縦のスクロールが少し横に流れても、メニューを開かない", () => {
    expect(menuSwipeIntent(start, { x: 115, y: 330 }, "right")).toBe("other");
  });

  it("左へ払ったのは、開く払い方ではない", () => {
    expect(menuSwipeIntent(start, { x: 70, y: 300 }, "right")).toBe("other");
  });

  it("閉じるときは、左へ払ったのをメニューの払い方とみなす", () => {
    expect(menuSwipeIntent(start, { x: 70, y: 300 }, "left")).toBe("menu");
    expect(menuSwipeIntent(start, { x: 130, y: 300 }, "left")).toBe("other");
  });
});

describe("menuProgress", () => {
  it("出ている幅の割合を 0〜1 に収める", () => {
    expect(menuProgress(150, 300)).toBe(0.5);
    expect(menuProgress(-20, 300)).toBe(0);
    expect(menuProgress(400, 300)).toBe(1);
  });

  it("幅が測れないときは、隠れているとみなす", () => {
    expect(menuProgress(10, 0)).toBe(0);
  });
});

describe("settleMenu", () => {
  it("ゆっくり離したら、半分を越えていれば開く", () => {
    expect(settleMenu(0.6, 0)).toBe(true);
    expect(settleMenu(0.4, 0)).toBe(false);
  });

  it("速く払ったら、出ている量によらず払った向きに決める", () => {
    expect(settleMenu(0.2, 1)).toBe(true);
    expect(settleMenu(0.9, -1)).toBe(false);
  });
});
