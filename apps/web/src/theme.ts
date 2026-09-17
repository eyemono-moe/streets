import type { DeckAppearance } from "@streets/core/deck/deck";
import {
  COLOR_SCHEME_STORAGE_KEY,
  type ColorScheme,
  loadColorScheme,
} from "@streets/core/settings/color-scheme";

export type { ColorScheme };

/**
 * テーマ色の元になる 2 色。Penpot の `Primitives/*` の `accent.original` と `ui.original`。
 * 50〜950 の段は uno.config.ts がこの 2 色から作る。
 */
export const PALETTES = {
  purple: { accent: "#8440BD", ui: "#302170", label: "紫" },
  cyan: { accent: "#39A1BA", ui: "#0C4853", label: "シアン" },
  lime: { accent: "#99D83E", ui: "#122202", label: "ライム" },
  orange: { accent: "#D76D34", ui: "#210502", label: "オレンジ" },
  pink: { accent: "#B93E9F", ui: "#410F52", label: "ピンク" },
} as const;

export type PaletteName = keyof typeof PALETTES;

/** 色を選んでいないとき。index.html の既定と揃える。 */
export const DEFAULT_APPEARANCE: DeckAppearance = {
  accent: PALETTES.purple.accent,
  ui: PALETTES.purple.ui,
};

/** 今の 2 色がプリセットのどれか。自分で選んだ色なら undefined。 */
export const paletteOf = (colors: DeckAppearance): PaletteName | undefined =>
  (Object.keys(PALETTES) as PaletteName[]).find(
    (name) =>
      PALETTES[name].accent.toLowerCase() === colors.accent.toLowerCase() &&
      PALETTES[name].ui.toLowerCase() === colors.ui.toLowerCase(),
  );

export const applyColors = (colors: DeckAppearance) => {
  const root = document.documentElement.style;
  root.setProperty("--theme-accent-color", colors.accent);
  root.setProperty("--theme-ui-color", colors.ui);
};

export const applyPalette = (name: PaletteName) => applyColors(PALETTES[name]);

/**
 * `.dark` を `<html>` に付け外しする。`system` の間は OS の切り替えにも追従する。
 * 戻り値で追従を止める。
 */
export const applyColorScheme = (scheme: ColorScheme): (() => void) => {
  const root = document.documentElement.classList;
  if (scheme !== "system") {
    root.toggle("dark", scheme === "dark");
    return () => {};
  }
  const query = matchMedia("(prefers-color-scheme: dark)");
  const sync = () => root.toggle("dark", query.matches);
  sync();
  query.addEventListener("change", sync);
  return () => query.removeEventListener("change", sync);
};

let stopFollowingOs = () => {};

/** 端末に保存したカラーテーマ。 */
export const savedColorScheme = (): ColorScheme => {
  try {
    return loadColorScheme(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY));
  } catch {
    // ストレージが使えない環境（プライベートブラウズなど）では OS に合わせる。
    return "system";
  }
};

/** カラーテーマを当てて、この端末に保存する。 */
export const setColorScheme = (scheme: ColorScheme, save = true) => {
  stopFollowingOs();
  stopFollowingOs = applyColorScheme(scheme);
  if (!save) return;
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
  } catch {
    // 保存できなくても、今の画面には当たっている。
  }
};
