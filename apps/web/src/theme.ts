import type { DeckAppearance } from "@streets/core/deck/deck";
import {
  COLOR_SCHEME_STORAGE_KEY,
  type ColorScheme,
  loadColorScheme,
} from "@streets/core/settings/color-scheme";
import {
  loadUiContrast,
  UI_CONTRAST_FACTORS,
  UI_CONTRAST_STORAGE_KEY,
  type UiContrast,
} from "@streets/core/settings/ui-contrast";

export type { ColorScheme, UiContrast };

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

/**
 * ブラウザの枠やホーム画面から開いたときの時計の帯を、いまの背景（`bg-primary`）の色で塗る。
 * index.html の 2 つの theme-color は OS のダークモードで選ぶので、アプリで選んだテーマや
 * 既定でない色とずれる。ダークの背景は oklch で計算されるので、どの端末の theme-color でも
 * 読めるよう、canvas に塗って `#rrggbb` に直す。
 */
const syncThemeColor = () => {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return;
  const background = getComputedStyle(document.body).backgroundColor;
  context.fillStyle = background;
  // 読めない書き方の色は無視され、黒のまま塗ってしまう。そのときは index.html の色を残す。
  if (
    context.fillStyle === "#000000" &&
    !/^rgba?\(0, 0, 0[,)]/.test(background)
  )
    return;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const metas = document.head.querySelectorAll('meta[name="theme-color"]');
  for (const extra of [...metas].slice(1)) extra.remove();
  const meta =
    metas[0] ?? document.head.appendChild(document.createElement("meta"));
  meta.setAttribute("name", "theme-color");
  meta.removeAttribute("media");
  meta.setAttribute("content", hex);
};

export const applyColors = (colors: DeckAppearance) => {
  const root = document.documentElement.style;
  root.setProperty("--theme-accent-color", colors.accent);
  root.setProperty("--theme-ui-color", colors.ui);
  syncThemeColor();
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
    syncThemeColor();
    return () => {};
  }
  const query = matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    root.toggle("dark", query.matches);
    syncThemeColor();
  };
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

/** 端末に保存したコントラスト。 */
export const savedUiContrast = (): UiContrast => {
  try {
    return loadUiContrast(localStorage.getItem(UI_CONTRAST_STORAGE_KEY));
  } catch {
    return "normal";
  }
};

/** コントラストを当てる。背景色が変わるので theme-color も合わせ直す。 */
export const applyUiContrast = (contrast: UiContrast) => {
  document.documentElement.style.setProperty(
    "--ui-contrast",
    String(UI_CONTRAST_FACTORS[contrast]),
  );
  syncThemeColor();
};

/** コントラストを当てて、この端末に保存する。 */
export const setUiContrast = (contrast: UiContrast, save = true) => {
  applyUiContrast(contrast);
  if (!save) return;
  try {
    localStorage.setItem(UI_CONTRAST_STORAGE_KEY, contrast);
  } catch {
    // 保存できなくても、今の画面には当たっている。
  }
};

/**
 * 色を変えてから、アカウントへ保存するまでの待ち。続けて選んでいる間はまとめる ——
 * 1 回ごとに署名とリレーへの書き込みが走ると、選ぶ操作そのものが重くなる。
 */
export const APPEARANCE_SAVE_DELAY_MS = 800;
