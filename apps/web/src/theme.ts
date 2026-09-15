/**
 * テーマ色の元になる 2 色。Penpot の `Primitives/*` の `accent.original` と `ui.original`。
 * 50〜950 の段は uno.config.ts がこの 2 色から作る。
 */
export const PALETTES = {
  purple: { accent: "#8440BD", ui: "#302170" },
  cyan: { accent: "#39A1BA", ui: "#0C4853" },
  lime: { accent: "#99D83E", ui: "#122202" },
  orange: { accent: "#D76D34", ui: "#210502" },
  pink: { accent: "#B93E9F", ui: "#410F52" },
} as const;

export type PaletteName = keyof typeof PALETTES;

export type ColorScheme = "system" | "light" | "dark";

export const applyPalette = (name: PaletteName) => {
  const palette = PALETTES[name];
  const root = document.documentElement.style;
  root.setProperty("--theme-accent-color", palette.accent);
  root.setProperty("--theme-ui-color", palette.ui);
};

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
