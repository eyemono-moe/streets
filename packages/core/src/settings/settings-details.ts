/**
 * 設定のページの「詳しく」を開いているか。端末ごとの設定で、ページごとに
 * 別に覚える（リレーは開いて使い、表示は閉じておく、ができるように）。
 */
export const settingsDetailsStorageKey = (page: string): string =>
  `streets.v1.settingsDetails.${page}`;

/** 既定は閉じる。`"true"` 以外はすべて閉じているとして扱う。 */
export const loadSettingsDetailsOpen = (raw: string | null): boolean =>
  raw === "true";

export const saveSettingsDetailsOpen = (open: boolean): string => String(open);
