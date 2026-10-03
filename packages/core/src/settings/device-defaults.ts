import {
  type ActionLayout,
  defaultActionLayout,
  saveActionLayout,
} from "./action-layout";
import { type ColorScheme, loadColorScheme } from "./color-scheme";
import { loadColumnDigits } from "./column-digits-setting";
import {
  type ContentWarningMode,
  loadContentWarningMode,
} from "./content-warning-setting";
import { type DeckLayout, loadDeckLayout } from "./deck-layout-setting";
import { DEFAULT_KEYMAP, type Keymap, SHORTCUT_ACTIONS } from "./keymap";
import { loadWriteProgress } from "./write-progress-setting";

/**
 * 表示のページのうち、この端末に保存する設定。アクセントカラーはアカウントに
 * 保存するので含めない —— 「既定に戻す」で、ほかの端末の色まで変えないため。
 */
export type DisplayDeviceSettings = {
  deckLayout: DeckLayout;
  writeProgress: boolean;
  contentWarning: ContentWarningMode;
  actionLayout: ActionLayout;
  colorScheme: ColorScheme;
};

/** 何も保存していないときの値。読み込みの既定と同じものを使う。 */
export const defaultDisplaySettings = (): DisplayDeviceSettings => ({
  deckLayout: loadDeckLayout(null),
  writeProgress: loadWriteProgress(null),
  contentWarning: loadContentWarningMode(null),
  actionLayout: defaultActionLayout(),
  colorScheme: loadColorScheme(null),
});

export const isDefaultDisplay = (current: DisplayDeviceSettings): boolean => {
  const initial = defaultDisplaySettings();
  return (
    current.deckLayout === initial.deckLayout &&
    current.writeProgress === initial.writeProgress &&
    current.contentWarning === initial.contentWarning &&
    current.colorScheme === initial.colorScheme &&
    saveActionLayout(current.actionLayout) ===
      saveActionLayout(initial.actionLayout)
  );
};

export type KeyboardDeviceSettings = { keymap: Keymap; columnDigits: boolean };

export const defaultKeyboardSettings = (): KeyboardDeviceSettings => ({
  keymap: { ...DEFAULT_KEYMAP },
  columnDigits: loadColumnDigits(null),
});

export const isDefaultKeyboard = (current: KeyboardDeviceSettings): boolean => {
  const initial = defaultKeyboardSettings();
  return (
    current.columnDigits === initial.columnDigits &&
    SHORTCUT_ACTIONS.every(
      (action) => current.keymap[action] === initial.keymap[action],
    )
  );
};
