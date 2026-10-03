import { describe, expect, it } from "vite-plus/test";
import {
  sameActionLayout,
  type ActionArrangeEvent,
  type ActionArrangeState,
  type ActionLayout,
  actionArrangeTransition,
  arrangedLayout,
  defaultActionLayout,
  loadActionLayout,
  menuActionsOf,
  saveActionLayout,
  slotsOf,
} from "./action-layout";

const run = (
  events: ActionArrangeEvent[],
  layout: ActionLayout = defaultActionLayout(),
): ActionArrangeState =>
  events.reduce(actionArrangeTransition, { layout, dragging: undefined });

describe("アクション欄の並びの保存", () => {
  it("保存していなければ、今までと同じ 6 個を欄に出す", () => {
    expect(loadActionLayout(null)).toEqual(defaultActionLayout());
  });

  it("保存した並びを読み戻せる", () => {
    const layout: ActionLayout = {
      bar: ["like", "reply", "copy-link"],
      menu: ["repost", "react", "zap", "bookmark", "activity", "details"],
    };
    const loaded = loadActionLayout(saveActionLayout(layout));
    expect(loaded.bar).toEqual(layout.bar);
    // 保存に無い操作は、メニューの最後に入る。
    expect(loaded.menu).toEqual([
      ...layout.menu,
      "pin",
      "mute-event",
      "broadcast",
    ]);
  });

  it("知らない操作・重なり・7 個目以降を直す", () => {
    const loaded = loadActionLayout(
      JSON.stringify({
        bar: [
          "reply",
          "reply",
          "unknown",
          "repost",
          "like",
          "react",
          "zap",
          "bookmark",
          "details",
        ],
        menu: ["activity"],
      }),
    );
    expect(loaded.bar).toEqual([
      "reply",
      "repost",
      "like",
      "react",
      "zap",
      "bookmark",
    ]);
    expect(loaded.menu).toEqual([
      "details",
      "activity",
      "pin",
      "copy-link",
      "mute-event",
      "broadcast",
    ]);
  });

  it("読めない値は既定の並びに戻す", () => {
    expect(loadActionLayout("{")).toEqual(defaultActionLayout());
    expect(loadActionLayout('{"bar":"reply"}')).toEqual(defaultActionLayout());
  });
});

describe("投稿のメニューに入れる操作", () => {
  it("アクション欄を出す投稿では、欄に無いものを入れる", () => {
    expect(menuActionsOf(defaultActionLayout(), true)).toEqual([
      "pin",
      "activity",
      "copy-link",
      "details",
      "mute-event",
      "broadcast",
    ]);
  });

  it("欄を出さない投稿では、中身によらない操作だけを、欄に選んだものも含めて入れる", () => {
    const layout: ActionLayout = {
      bar: ["reply", "copy-link"],
      menu: [
        "repost",
        "like",
        "react",
        "zap",
        "bookmark",
        "activity",
        "details",
        "mute-event",
      ],
    };
    expect(menuActionsOf(layout, false)).toEqual([
      "copy-link",
      "activity",
      "details",
      "mute-event",
    ]);
  });
});

describe("アクション欄の並べ替え", () => {
  it("掴んで離すと、その位置で確定する", () => {
    const state = run([
      { type: "action-layout/drag-start", id: "bookmark", index: 5 },
      { type: "action-layout/drag-move", to: 0 },
      { type: "action-layout/drop" },
    ]);
    expect(state.dragging).toBeUndefined();
    expect(state.layout.bar).toEqual([
      "bookmark",
      "reply",
      "repost",
      "like",
      "react",
      "zap",
    ]);
  });

  it("やめたら並びを変えない", () => {
    const state = run([
      { type: "action-layout/drag-start", id: "bookmark", index: 5 },
      { type: "action-layout/drag-move", to: 0 },
      { type: "action-layout/drag-end" },
    ]);
    expect(state.layout).toEqual(defaultActionLayout());
  });

  it("欄を境目の後ろへ動かすと、メニューに入る", () => {
    const state = run([
      { type: "action-layout/drag-start", id: "zap", index: 4 },
      { type: "action-layout/drag-move", to: 8 },
      { type: "action-layout/drop" },
    ]);
    expect(state.layout.bar).toEqual([
      "reply",
      "repost",
      "like",
      "react",
      "bookmark",
    ]);
    expect(state.layout.menu).toEqual([
      "pin",
      "activity",
      "zap",
      "copy-link",
      "details",
      "mute-event",
      "broadcast",
    ]);
  });

  it("欄がいっぱいのところへ入れると、掴んでいないものの最後がメニューへ押し出される", () => {
    const dragging = run([
      { type: "action-layout/drag-start", id: "copy-link", index: 9 },
      { type: "action-layout/drag-move", to: 1 },
    ]);
    const shown = arrangedLayout(dragging);
    expect(shown.bar).toEqual([
      "reply",
      "copy-link",
      "repost",
      "like",
      "react",
      "zap",
    ]);
    expect(shown.menu[0]).toBe("bookmark");
    // 見せている並びと、離した後の並びが同じ。
    const dropped = actionArrangeTransition(dragging, {
      type: "action-layout/drop",
    });
    expect(dropped.layout).toEqual(shown);
  });

  it("欄の最後へ入れても、入れたものは押し出さない", () => {
    const state = run([
      { type: "action-layout/drag-start", id: "details", index: 10 },
      { type: "action-layout/drag-move", to: 6 },
      { type: "action-layout/drop" },
    ]);
    expect(state.layout.bar.at(-1)).toBe("details");
    expect(state.layout.bar).toHaveLength(6);
    expect(state.layout.menu[0]).toBe("bookmark");
  });

  it("キーで 1 つずらすと、境目を越えて欄とメニューを行き来する", () => {
    const down = run([
      { type: "action-layout/move", id: "bookmark", direction: 1 },
    ]);
    expect(down.layout.bar).not.toContain("bookmark");
    expect(down.layout.menu[0]).toBe("bookmark");

    // いっぱいの欄へ上げると、欄の最後と入れ替わる。
    const up = run([{ type: "action-layout/move", id: "pin", direction: -1 }]);
    expect(up.layout.bar.at(-1)).toBe("pin");
    expect(up.layout.menu[0]).toBe("bookmark");
  });

  it("端から外へはずらさない", () => {
    const state = run([
      { type: "action-layout/move", id: "reply", direction: -1 },
      { type: "action-layout/move", id: "broadcast", direction: 1 },
    ]);
    expect(state.layout).toEqual(defaultActionLayout());
  });

  it("欄の最後か、メニューの先頭へ移せる", () => {
    const toMenu = run([
      { type: "action-layout/place", id: "reply", to: "menu" },
    ]);
    expect(toMenu.layout.menu[0]).toBe("reply");
    const toBar = run(
      [{ type: "action-layout/place", id: "details", to: "bar" }],
      toMenu.layout,
    );
    expect(toBar.layout.bar).toEqual([
      "repost",
      "like",
      "react",
      "zap",
      "bookmark",
      "details",
    ]);
    expect(slotsOf(toBar.layout)).toHaveLength(13);
  });
});

describe("アクション欄の並びが同じか", () => {
  it("欄とメニューの並びがどちらも同じときだけ同じ", () => {
    const initial = defaultActionLayout();
    expect(sameActionLayout(initial, defaultActionLayout())).toBe(true);
    expect(
      sameActionLayout(initial, {
        bar: [...initial.bar].reverse(),
        menu: initial.menu,
      }),
    ).toBe(false);
    expect(
      sameActionLayout(initial, {
        bar: initial.bar.slice(1),
        menu: [initial.bar[0]!, ...initial.menu],
      }),
    ).toBe(false);
  });
});
