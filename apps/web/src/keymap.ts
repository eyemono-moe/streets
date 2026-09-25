import {
  DEFAULT_KEYMAP,
  KEYMAP_STORAGE_KEY,
  type Keymap,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  type ShortcutAction,
  loadKeymap,
  saveKeymap,
} from "@streets/core/settings/keymap";
import { formatForDisplay, validateHotkey } from "@tanstack/solid-hotkeys";
import { createSignal } from "solid-js";

/**
 * キーボードの位置（`[KeyN]`）に対して、その端末で実際に刻印されている文字を
 * 教えてくれる表。Chromium 系だけが持っていて、無ければ位置の名前から作った
 * 既定の文字（`[KeyN]` なら N）が出る。
 */
const [layoutMap, setLayoutMap] = createSignal<{
  get(code: string): string | undefined;
}>();

const keyboard:
  | { getLayoutMap?: () => Promise<Map<string, string>> }
  | undefined = (
  navigator as {
    keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
  }
).keyboard;
keyboard
  ?.getLayoutMap?.()
  .then(setLayoutMap)
  .catch(() => {});

const read = (): Keymap => {
  try {
    const stored = loadKeymap(localStorage.getItem(KEYMAP_STORAGE_KEY));
    // 外から入ってきた文字列なので、渡す前に読めるかを確かめる。読めないキーを
    // そのまま登録すると、その場で例外になって画面ごと止まる。
    for (const action of SHORTCUT_ACTIONS) {
      const hotkey = stored[action];
      if (hotkey !== "" && !validateHotkey(hotkey).valid) {
        stored[action] = DEFAULT_KEYMAP[action];
      }
    }
    return stored;
  } catch {
    return { ...DEFAULT_KEYMAP };
  }
};

const [keymap, setValue] = createSignal(read());

/** いまのショートカットキーの割り当て（この端末の設定）。 */
export { keymap };

export const setShortcut = (action: ShortcutAction, hotkey: string) => {
  const next: Keymap = { ...keymap(), [action]: hotkey };
  setValue(next);
  try {
    localStorage.setItem(KEYMAP_STORAGE_KEY, saveKeymap(next));
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};

/** キーの見た目（`[KeyN]` → `N`）。刻印が分かる端末では、その文字で出す。 */
export const displayHotkey = (hotkey: string): string =>
  hotkey === ""
    ? ""
    : (formatForDisplay(hotkey, {
        layoutMap: layoutMap(),
        useSymbols: { modifiers: true, keys: true },
      }) as string);

/** ボタンの説明。「ノートを書く N」のように、名前とキーを並べる。 */
export const shortcutTitle = (action: ShortcutAction): string => {
  const key = displayHotkey(keymap()[action]);
  return key === ""
    ? SHORTCUT_LABELS[action]
    : `${SHORTCUT_LABELS[action]} ${key}`;
};

/** `aria-keyshortcuts` の修飾キーの名前は決まっている（Ctrl や ⌘ では通じない）。 */
const ARIA_MODIFIERS: Record<string, string> = {
  Ctrl: "Control",
  Cmd: "Meta",
  Command: "Meta",
  Win: "Meta",
  Super: "Meta",
  Opt: "Alt",
  Option: "Alt",
};

/** `aria-keyshortcuts` に出す形。読み上げのための決まった書き方で作る。 */
export const ariaKeyShortcuts = (
  action: ShortcutAction,
): string | undefined => {
  const hotkey = keymap()[action];
  if (hotkey === "") return undefined;
  const parts = formatForDisplay(hotkey, {
    layoutMap: layoutMap(),
    useSymbols: false,
    parts: true,
  }) as string[];
  return parts.map((part) => ARIA_MODIFIERS[part] ?? part).join("+");
};
