/**
 * 書き込みの進み具合を出すか。端末ごとの設定 —— 通知の量の好みは、使う画面の
 * 広さで変わる。
 */
export const WRITE_PROGRESS_STORAGE_KEY = "streets.v1.showWriteProgress";

/** 未保存・読めない値は出す。 */
export const loadWriteProgress = (raw: string | null): boolean => raw !== "off";

export const saveWriteProgress = (on: boolean): string => (on ? "on" : "off");
