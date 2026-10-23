import appEn from "../app/i18n/en.json";
import appJa from "../app/i18n/ja.json";
import settingsEn from "../settings/i18n/en.json";
import settingsJa from "../settings/i18n/ja.json";
import statusEn from "../status/i18n/en.json";
import statusJa from "../status/i18n/ja.json";
import tourEn from "../tour/i18n/en.json";
import tourJa from "../tour/i18n/ja.json";
import writeQueueEn from "../write-queue/i18n/en.json";
import writeQueueJa from "../write-queue/i18n/ja.json";

/** 日本語の文言。キーの正。フォルダの名前を、そのフォルダの文言の頭に付ける。 */
export const ja = {
  app: appJa,
  settings: settingsJa,
  status: statusJa,
  tour: tourJa,
  "write-queue": writeQueueJa,
};

export type Messages = typeof ja;

export const en: Messages = {
  app: appEn,
  settings: settingsEn,
  status: statusEn,
  tour: tourEn,
  "write-queue": writeQueueEn,
};
