import type { FontId } from "./glyph-shard";

export type HexColor = `#${string}`;

/** 色・縁取り・フォントの組み合わせ。並べ方は含まない。 */
export type Style = {
  color: HexColor;
  /** `auto` は文字色から決める。`null` は縁取りなし。 */
  outline: "auto" | HexColor | null;
  outlineWidth: number;
  font: FontId;
};

export type Preset = {
  id: string;
  label: string;
  color: HexColor;
  outlineWidth: number;
  font: FontId;
};

/** プリセットの縁取りは、どれも文字色から自動で決める。 */
export const PRESETS: readonly Preset[] = [
  {
    id: "pop",
    label: "ポップ",
    color: "#ffd43b",
    outlineWidth: 7,
    font: "rounded",
  },
  {
    id: "clear",
    label: "くっきり",
    color: "#ffffff",
    outlineWidth: 7,
    font: "gothic",
  },
  { id: "sumi", label: "墨", color: "#222226", outlineWidth: 5, font: "serif" },
  {
    id: "yuru",
    label: "ゆる",
    color: "#ff8fb8",
    outlineWidth: 6,
    font: "rounded",
  },
  {
    id: "alert",
    label: "警告",
    color: "#e5383b",
    outlineWidth: 6,
    font: "gothic",
  },
  {
    id: "neon",
    label: "ネオン",
    color: "#3ee0f0",
    outlineWidth: 7,
    font: "rounded",
  },
];

/** ピッカーの下端に出す 3 つ。水色の丸ゴシック・赤のゴシック・黒の明朝。 */
export const PICKER_PRESET_IDS = ["neon", "alert", "sumi"] as const;

export const presetById = (id: string): Preset | undefined =>
  PRESETS.find((preset) => preset.id === id);

export const styleOfPreset = (preset: Preset): Style => ({
  color: preset.color,
  outline: "auto",
  outlineWidth: preset.outlineWidth,
  font: preset.font,
});

export const sameStyle = (a: Style, b: Style): boolean =>
  a.color === b.color &&
  a.outline === b.outline &&
  a.outlineWidth === b.outlineWidth &&
  a.font === b.font;

const channels = (hex: HexColor) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** WCAG の相対輝度。 */
const luminance = (hex: HexColor) => {
  const [r = 0, g = 0, b = 0] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * 文字色から、明るい背景と暗い背景のどちらでも読める縁取りの色を選ぶ。明るい文字には暗い縁、
 * 暗い文字には白い縁。境目の 0.35 は、桃色（ゆる）に暗い縁が付く高さにしてある ——
 * 白い縁は明るい背景で消える。
 */
export const autoOutline = (color: HexColor): HexColor =>
  luminance(color) > 0.35 ? "#1b1b1f" : "#ffffff";

export const resolveOutline = (style: Style): HexColor | null =>
  style.outline === "auto" ? autoOutline(style.color) : style.outline;
