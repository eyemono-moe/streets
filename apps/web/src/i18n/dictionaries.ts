import settingsEn from "../settings/i18n/en.json";
import settingsJa from "../settings/i18n/ja.json";

/** 日本語の文言。キーの正。フォルダの名前を、そのフォルダの文言の頭に付ける。 */
export const ja = {
  settings: settingsJa,
};

export type Messages = typeof ja;

export const en: Messages = {
  settings: settingsEn,
};
