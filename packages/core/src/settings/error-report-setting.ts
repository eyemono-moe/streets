/**
 * 不具合の報告（エラーの記録の送信）を行うか。端末ごとの設定 —— 送るかどうかは
 * 使う人が決められるようにする。
 */
export const ERROR_REPORT_STORAGE_KEY = "streets.v1.errorReport";

/** 未保存・読めない値は送る（既定は有効）。 */
export const loadErrorReport = (raw: string | null): boolean => raw !== "off";

export const saveErrorReport = (on: boolean): string => (on ? "on" : "off");
