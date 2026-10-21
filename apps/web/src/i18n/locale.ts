import * as i18n from "@solid-primitives/i18n";
import type { Message } from "@streets/core/i18n/message";
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
// 半分だけ英語の画面を出さない。設定で English を選んだときだけ英語にする。
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

type Dictionary = i18n.Flatten<typeof ja>;

/** `<キー>.one` と `<キー>.other` を両方持つキー。 */
type PluralKey = {
  [K in keyof Dictionary]: K extends `${infer P}.other`
    ? `${P}.one` extends keyof Dictionary
      ? P
      : never
    : never;
}[keyof Dictionary];

/**
 * 数で形が変わる文言を引く。`count` は `{{ count }}` にも入る。日本語は形が変わらない
 * が、キーをそろえるため `one` と `other` の両方を書く。
 */
export const plural = (
  key: PluralKey,
  count: number,
  args: Record<string, string | number> = {},
): string => {
  const form =
    new Intl.PluralRules(locale()).select(count) === "one" ? "one" : "other";
  // キーの型は `one` と `other` の両方があることまでで、組み立てたキーは型が追えない。
  const translate = t as (key: string, args: Record<string, unknown>) => string;
  return translate([key, form].join("."), { ...args, count });
};

/**
 * core が返した文言を引く。core のキーは `core` の辞書にある（`dictionaries.ts` が
 * キーの抜けを型で落とす）。
 */
export const message = (
  text: Message,
  args: Record<string, string | number> = {},
): string => {
  const merged = { ...text.args, ...args };
  // キーの一覧は core が持ち、辞書の型とは `dictionaries.ts` で突き合わせている。
  if (text.count !== undefined) {
    return plural(`core.${text.key}` as PluralKey, text.count, merged);
  }
  const translate = t as (key: string, args: Record<string, unknown>) => string;
  return translate(`core.${text.key}`, merged);
};

/**
 * 文の中に部品（名前のリンクなど）を挟むとき、挟む位置の前と後ろの文を返す。
 * 語順が言語で違うので、前後を別のキーに分けずに、1 つの文の `{{ slot }}` で分ける。
 */
export const messageAround = (
  text: Message,
  slot: string,
): [before: string, after: string] => {
  const marker = "\u0000";
  const [before = "", after = ""] = message(text, { [slot]: marker }).split(
    marker,
  );
  return [before, after];
};
