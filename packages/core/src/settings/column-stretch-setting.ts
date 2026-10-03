/**
 * 横に並べたカラムを、画面の幅いっぱいまで広げるか。端末ごとの設定 ——
 * 同じデッキでも、大きなモニターでは広げ、ノート PC では広げない、のように
 * 画面の大きさで変わるから。
 */
export const COLUMN_STRETCH_STORAGE_KEY = "streets.v1.columnStretch";

/** 未保存・読めない値は広げない（既定は今までどおりの固定幅）。 */
export const loadColumnStretch = (raw: string | null): boolean => raw === "on";

export const saveColumnStretch = (on: boolean): string => (on ? "on" : "off");
