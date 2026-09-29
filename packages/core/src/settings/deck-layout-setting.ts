/**
 * カラムを横に並べるか、1 列ずつ見せるか。端末ごとの設定 —— 同じ幅でも、
 * タブレットでは 1 列、小さい窓の PC では横に並べたい、のように端末で変わるから。
 */
export type DeckLayout = "auto" | "single" | "multi";

export const DECK_LAYOUT_STORAGE_KEY = "streets.v1.deckLayout";

/**
 * 「画面幅に合わせる」で横に並べ始める幅（CSS px）。縦持ちのスマホはいちばん広い
 * 機種でも 440px 前後なので、それより余裕をもって上に置き、狭い窓の PC は並べる。
 * サイドバーと M 幅のカラム 1 本（約 440px）が収まる幅でもある。
 */
export const MULTI_COLUMN_MIN_WIDTH = 540;

/** 未保存・読めない値は、画面幅に合わせる。 */
export const loadDeckLayout = (raw: string | null): DeckLayout =>
  raw === "single" || raw === "multi" ? raw : "auto";

/** カラムを横に並べるか。`wide` は画面が `MULTI_COLUMN_MIN_WIDTH` 以上か。 */
export const showsMultiColumn = (layout: DeckLayout, wide: boolean): boolean =>
  layout === "auto" ? wide : layout === "multi";
