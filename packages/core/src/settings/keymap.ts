/**
 * ショートカットキーの割り当て。何をするか（action）と、どのキーで呼ぶか
 * （hotkey）を分けて持つ —— 使う人がキーだけを差し替えられるようにするため。
 *
 * キーの文字列は TanStack Hotkeys の表記をそのまま保存する。`[KeyN]` のような
 * 角括弧付きはキーボード上の位置を指す（配列を変えても同じ位置で呼べる）。
 * 空文字はそのショートカットを使わないという意味。
 */

/** 端末ごとの設定。キーボードの配列は、その端末に付いているものだから。 */
export const KEYMAP_STORAGE_KEY = "streets.v1.keymap";

export const SHORTCUT_ACTIONS = ["compose", "search", "add-column"] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export type Keymap = Record<ShortcutAction, string>;

/** 設定の画面と、ボタンの説明に出す名前。 */
export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  compose: "ノートを書く",
  search: "探す",
  "add-column": "カラムを追加",
};

export const DEFAULT_KEYMAP: Keymap = {
  compose: "[KeyN]",
  search: "[KeyS]",
  "add-column": "[KeyC]",
};

const isAction = (value: string): value is ShortcutAction =>
  (SHORTCUT_ACTIONS as readonly string[]).includes(value);

/** 未保存・読めない値は既定に戻す。1 つ壊れていても、ほかの割り当ては残す。 */
export const loadKeymap = (raw: string | null): Keymap => {
  const stored: Record<string, unknown> = (() => {
    if (raw === null) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  })();

  const keymap = { ...DEFAULT_KEYMAP };
  for (const [action, hotkey] of Object.entries(stored)) {
    if (!isAction(action)) continue;
    if (typeof hotkey !== "string") continue;
    keymap[action] = hotkey;
  }
  return keymap;
};

/** 既定のままのものは書かない。既定を変えたとき、変えていない人へ届くように。 */
export const saveKeymap = (keymap: Keymap): string => {
  const changed = Object.fromEntries(
    SHORTCUT_ACTIONS.filter(
      (action) => keymap[action] !== DEFAULT_KEYMAP[action],
    ).map((action) => [action, keymap[action]]),
  );
  return JSON.stringify(changed);
};

/** 同じキーを既に使っている別の action。無ければ undefined。 */
export const conflictingAction = (
  keymap: Keymap,
  action: ShortcutAction,
  hotkey: string,
): ShortcutAction | undefined =>
  hotkey === ""
    ? undefined
    : SHORTCUT_ACTIONS.find(
        (other) => other !== action && keymap[other] === hotkey,
      );
