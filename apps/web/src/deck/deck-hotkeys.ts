import type { ColumnDef } from "@streets/core/deck/deck";
import type { DeckPanel } from "@streets/core/deck/deck-ui";
import {
  type Keymap,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  type ShortcutAction,
} from "@streets/core/settings/keymap";
import { type Hotkey, createHotkeys } from "@tanstack/solid-hotkeys";

const PANEL_OF: Record<ShortcutAction, DeckPanel> = {
  compose: "compose",
  search: "search",
  "add-column": "add-column",
};

/**
 * ダイアログを開いている間は、その中で押したことにする。ダイアログは画面の
 * 外側に描かれるので要素では絞り込めず、いま触っている場所で見分ける。
 */
/** 1〜9 の数字キー。番号は並び順（1 番目が左端）。 */
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const inDialog = () =>
  document.activeElement?.closest('[role="dialog"]') != null;

/**
 * デッキのショートカットキー。割り当ては設定から変えられるので、いまの
 * 割り当てを受け取って登録し直す。
 *
 * 入力欄で打っている間・IME で変換している間・押しっぱなしの連打は
 * TanStack Hotkeys が落とすので、ここでは見ない。
 */
export const createDeckHotkeys = (options: {
  keymap: () => Keymap;
  columns: () => readonly ColumnDef[];
  /** デッキを触れる状態か（設定のダイアログを開いている間は奪わない）。 */
  enabled: () => boolean;
  /** パネルを開いているか。開いている間は数字キーを奪わない。 */
  panelOpen: () => boolean;
  togglePanel: (panel: DeckPanel) => void;
  focusColumn: (id: string) => void;
}) => {
  createHotkeys(() => [
    ...SHORTCUT_ACTIONS.filter((action) => options.keymap()[action] !== "").map(
      (action) => ({
        // 保存した文字列。読み込むときに validateHotkey で確かめている。
        hotkey: options.keymap()[action] as Hotkey,
        callback: () => {
          if (inDialog()) return;
          options.togglePanel(PANEL_OF[action]);
        },
        options: {
          enabled: options.enabled(),
          // 押しっぱなしでパネルが開いたり閉じたりしないように、1 回で止める。
          requireReset: true,
          meta: { name: SHORTCUT_LABELS[action], group: "デッキ" },
        },
      }),
    ),
    // 1〜9 でその番号のカラムを見せる（v0 と同じ）。こちらは変えられない ——
    // 9 個を設定に並べても選べないため。
    ...DIGITS.map((digit, index) => ({
      hotkey: digit,
      callback: () => {
        if (inDialog()) return;
        const column = options.columns()[index];
        if (column) options.focusColumn(column.id);
      },
      options: {
        // パネルを開いている間は、パネルの中を触っているので奪わない。
        enabled: options.enabled() && !options.panelOpen(),
        meta: { name: `${index + 1} 番目のカラムへ`, group: "デッキ" },
      },
    })),
  ]);
};
