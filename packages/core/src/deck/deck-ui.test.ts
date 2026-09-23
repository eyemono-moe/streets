import { describe, expect, it } from "vitest";
import {
  type DeckUiEvent,
  type DeckUiState,
  deckUiTransition,
  emptyDeckUi,
} from "./deck-ui";

const run = (...events: DeckUiEvent[]): DeckUiState =>
  events.reduce(deckUiTransition, emptyDeckUi());

describe("deckUiTransition", () => {
  it("パネルを開いて閉じる", () => {
    expect(run({ type: "deck/open-panel", panel: "compose" }).panel).toBe(
      "compose",
    );
    expect(
      run(
        { type: "deck/open-panel", panel: "compose" },
        { type: "deck/close-panel" },
      ).panel,
    ).toBeUndefined();
  });

  it("同じパネルのボタンをもう一度押すと閉じる", () => {
    // 捕まえる変異: 開くだけにする（押しても閉じず、開いたままになる）
    expect(
      run(
        { type: "deck/toggle-panel", panel: "compose" },
        { type: "deck/toggle-panel", panel: "compose" },
      ).panel,
    ).toBeUndefined();
  });

  it("別のパネルのボタンを押すと、そちらへ移る", () => {
    // 捕まえる変異: 開いている間は何もしない（別のボタンが効かなくなる）
    expect(
      run(
        { type: "deck/toggle-panel", panel: "compose" },
        { type: "deck/toggle-panel", panel: "search" },
      ).panel,
    ).toBe("search");
  });

  it("別のパネルを開くと、開いていたパネルと入れ替わる", () => {
    const state = run(
      { type: "deck/open-panel", panel: "compose" },
      { type: "deck/open-panel", panel: "add-column" },
    );
    expect(state.panel).toBe("add-column");
  });

  it("タブを選ぶとパネルは閉じる", () => {
    const state = run(
      { type: "deck/open-panel", panel: "add-column" },
      { type: "deck/select-column", id: "a" },
    );
    expect(state).toMatchObject({ active: "a", panel: undefined });
  });

  it("設定は同じカラムで押すと閉じ、別のカラムで押すとそちらへ移る", () => {
    expect(
      run(
        { type: "deck/toggle-settings", id: "a" },
        { type: "deck/toggle-settings", id: "a" },
      ).settingsFor,
    ).toBeUndefined();
    expect(
      run(
        { type: "deck/toggle-settings", id: "a" },
        { type: "deck/toggle-settings", id: "b" },
      ).settingsFor,
    ).toBe("b");
  });

  it("掴んで離すと、掴んでいた状態を忘れる", () => {
    expect(run({ type: "deck/drag-start", id: "a" }).dragging).toBe("a");
    expect(
      run({ type: "deck/drag-start", id: "a" }, { type: "deck/drag-end" })
        .dragging,
    ).toBeUndefined();
  });

  it("カラムを足したら、足したカラムを選んでパネルを閉じる", () => {
    const state = run(
      { type: "deck/open-panel", panel: "add-column" },
      { type: "deck/column-added", id: "new" },
    );
    expect(state).toMatchObject({ active: "new", panel: undefined });
  });

  it("消したカラムの設定と掴みだけを外す", () => {
    const state = run(
      { type: "deck/toggle-settings", id: "a" },
      { type: "deck/drag-start", id: "b" },
      { type: "deck/column-removed", id: "a" },
    );
    expect(state).toMatchObject({ settingsFor: undefined, dragging: "b" });
  });

  it("消したのが別のカラムなら、設定は開いたまま", () => {
    const state = run(
      { type: "deck/toggle-settings", id: "a" },
      { type: "deck/column-removed", id: "b" },
    );
    expect(state.settingsFor).toBe("a");
  });

  it("一時カラムがあれば、それを選ぶ", () => {
    const state = run(
      { type: "deck/select-column", id: "a" },
      { type: "deck/columns-changed", ids: ["a", "b"], temp: "temp" },
    );
    expect(state.active).toBe("temp");
  });

  it("選んでいたカラムが消えたら、先頭を選ぶ", () => {
    const state = run(
      { type: "deck/select-column", id: "gone" },
      { type: "deck/columns-changed", ids: ["a", "b"] },
    );
    expect(state.active).toBe("a");
  });

  it("選んでいたカラムが残っていれば、選んだまま", () => {
    const before = run({ type: "deck/select-column", id: "b" });
    expect(
      deckUiTransition(before, {
        type: "deck/columns-changed",
        ids: ["a", "b"],
      }),
    ).toBe(before);
  });

  it("カラムが 1 本も無ければ、何も選ばない", () => {
    const state = run(
      { type: "deck/select-column", id: "gone" },
      { type: "deck/columns-changed", ids: [] },
    );
    expect(state.active).toBeUndefined();
  });

  it("初期状態は呼ぶたびに別のオブジェクトになる", () => {
    expect(emptyDeckUi()).not.toBe(emptyDeckUi());
  });
});

describe("設定のダイアログ", () => {
  it("開くとパネルは閉じ、閉じると元に戻る", () => {
    const opened = run(
      { type: "deck/open-panel", panel: "compose" },
      { type: "deck/open-settings" },
    );
    expect(opened).toMatchObject({ settingsOpen: true, panel: undefined });
    expect(
      deckUiTransition(opened, { type: "deck/close-settings" }).settingsOpen,
    ).toBe(false);
  });

  it("開いていないときに閉じても、状態は変わらない", () => {
    const state = emptyDeckUi();
    expect(deckUiTransition(state, { type: "deck/close-settings" })).toBe(
      state,
    );
  });
});

describe("Streets について", () => {
  it("開くと、設定とパネルは閉じる", () => {
    const state = deckUiTransition(
      { ...emptyDeckUi(), settingsOpen: true, panel: "compose" },
      { type: "deck/open-about" },
    );
    expect(state.aboutOpen).toBe(true);
    expect(state.settingsOpen).toBe(false);
    expect(state.panel).toBeUndefined();
  });

  it("開いていなければ、閉じても何も変わらない", () => {
    const closed = emptyDeckUi();
    expect(deckUiTransition(closed, { type: "deck/close-about" })).toBe(closed);
  });

  it("設定を開くと、Streets について は閉じる", () => {
    const state = deckUiTransition(
      { ...emptyDeckUi(), aboutOpen: true },
      { type: "deck/open-settings" },
    );
    expect(state.settingsOpen).toBe(true);
    expect(state.aboutOpen).toBe(false);
  });
});
