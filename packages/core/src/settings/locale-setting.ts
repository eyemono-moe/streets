/** 画面の言語。端末ごとの設定。 */
export type Locale = "ja" | "en";

/** `auto` はブラウザの言語に従う。 */
export type LocalePreference = "auto" | Locale;

export const LOCALE_STORAGE_KEY = "streets.v1.locale";

/** 未保存・読めない値は、ブラウザの言語に従う。 */
export const loadLocalePreference = (raw: string | null): LocalePreference =>
  raw === "ja" || raw === "en" ? raw : "auto";

/**
 * 使う言語を決める。`auto` なら、ブラウザが好む順に見て、最初に対応している言語を
 * 選ぶ。どれにも対応していなければ英語にする。
 */
export const resolveLocale = (
  preference: LocalePreference,
  languages: readonly string[],
): Locale => {
  if (preference !== "auto") return preference;
  for (const language of languages) {
    const primary = language.toLowerCase().split("-")[0];
    if (primary === "ja" || primary === "en") return primary;
  }
  return "en";
};
