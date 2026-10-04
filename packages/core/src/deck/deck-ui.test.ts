import { describe, expect, it } from "vite-plus/test";
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

  it("掴んだ位置から始まり、動かした先を覚え、離すと忘れる", () => {
    expect(
      run({ type: "deck/drag-start", id: "a", index: 2 }).dragging,
    ).toEqual({ id: "a", to: 2 });
    expect(
      run(
        { type: "deck/drag-start", id: "a", index: 2 },
        { type: "deck/drag-move", to: 0 },
      ).dragging,
    ).toEqual({ id: "a", to: 0 });
    expect(
      run(
        { type: "deck/drag-start", id: "a", index: 2 },
        { type: "deck/drag-end" },
      ).dragging,
    ).toBeUndefined();
  });

  it("掴んでいないときに動かしても何も起きない", () => {
    expect(run({ type: "deck/drag-move", to: 1 }).dragging).toBeUndefined();
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
      { type: "deck/drag-start", id: "b", index: 1 },
      { type: "deck/column-removed", id: "a" },
    );
    expect(state).toMatchObject({
      settingsFor: undefined,
      dragging: { id: "b", to: 1 },
    });
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

  it("パレットで選んだ項目を渡し、閉じると忘れる", () => {
    const opened = run({
      type: "deck/open-settings",
      setting: "display.theme",
    });
    expect(opened.settingsTarget).toBe("display.theme");
    expect(
      deckUiTransition(opened, { type: "deck/close-settings" }).settingsTarget,
    ).toBeUndefined();
  });
});

describe("コマンドパレット", () => {
  it("カラムの対象選択画面を直接開き、通常の入口では一覧へ戻す", () => {
    const first = run({
      type: "deck/open-column-picker",
      picker: "follow-sets",
    });
    expect(first).toMatchObject({
      panel: "add-column",
      columnPickerRequest: { picker: "follow-sets", sequence: 1 },
    });
    const next = deckUiTransition(first, {
      type: "deck/open-column-picker",
      picker: "follow-sets",
    });
    expect(next.columnPickerRequest?.sequence).toBe(2);
    expect(
      deckUiTransition(next, { type: "deck/open-panel", panel: "add-column" })
        .columnPickerRequest,
    ).toBeUndefined();
  });
  it("検索パネルを開くたびに入力を渡す", () => {
    const first = run({ type: "deck/open-search", query: "ねこ" });
    expect(first).toMatchObject({
      panel: "search",
      searchRequest: { query: "ねこ", sequence: 1 },
    });
    const next = deckUiTransition(first, {
      type: "deck/open-search",
      query: "ねこ",
    });
    expect(next.searchRequest?.sequence).toBe(2);
    expect(
      deckUiTransition(next, { type: "deck/open-panel", panel: "search" })
        .searchRequest,
    ).toBeUndefined();
  });
  it("開いて設定を選ぶと、パレットを閉じて項目を渡す", () => {
    const state = run(
      { type: "deck/open-palette" },
      { type: "deck/open-settings", setting: "display.theme" },
    );
    expect(state).toMatchObject({
      paletteOpen: false,
      settingsOpen: true,
      settingsTarget: "display.theme",
    });
  });

  it("閉じた状態で閉じても同じ状態を返す", () => {
    const state = emptyDeckUi();
    expect(deckUiTransition(state, { type: "deck/close-palette" })).toBe(state);
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
