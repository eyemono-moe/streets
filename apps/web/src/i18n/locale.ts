import * as i18n from "@solid-primitives/i18n";
import {
  LOCALE_STORAGE_KEY,
  type Locale,
  type LocalePreference,
  loadLocalePreference,
  resolveLocale,
} from "@streets/core/settings/locale-setting";
import { createSignal } from "solid-js";
import { en, ja } from "./dictionaries";

const read = (): LocalePreference => {
  try {
    return loadLocalePreference(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return loadLocalePreference(null);
  }
};

const [preference, setPreference] = createSignal(read());

/** 画面の言語の設定（この端末の設定）。 */
export { preference as localePreference };

export const setLocalePreference = (value: LocalePreference) => {
  setPreference(value);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, value);
  } catch {
    // 保存できなくても、今の画面には当てる。
  }
};

// 英語の文言が揃うまでは、ブラウザの言語に従わず日本語にする。英語のブラウザで
// 半分だけ英語の画面を出さない。英語を選んだときだけ英語にする。
const followsBrowser = false;

export const locale = (): Locale =>
  resolveLocale(preference(), followsBrowser ? navigator.languages : ["ja"]);

// 切り替えのたびに平らにし直さないよう、起動時に両方作っておく。
const dictionaries: Record<Locale, i18n.Flatten<typeof ja>> = {
  ja: i18n.flatten(ja),
  en: i18n.flatten(en),
};

/**
 * 文言を引く。`{{ name }}` は引数で埋める。言語を切り替えると、読んだところが描き直される。
 */
export const t = i18n.translator(
  () => dictionaries[locale()],
  i18n.resolveTemplate,
);
