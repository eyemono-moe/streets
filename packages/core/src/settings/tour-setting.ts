/**
 * 使い方の案内（ツアー）を、この端末で見たか。端末ごと —— 案内は画面の形
 * （広い・狭い）に合わせて指す場所が変わるので、端末ごとに一度見せる。
 */
export const TOUR_STORAGE_KEY = "streets.v1.tourSeen";

/** 未保存・読めない値は、まだ見ていない。 */
export const loadTourSeen = (raw: string | null): boolean => raw === "seen";

export const saveTourSeen = (): string => "seen";
