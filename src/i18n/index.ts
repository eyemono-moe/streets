import * as i18n from "@solid-primitives/i18n";
import { createResource, createSignal } from "solid-js";
import type ja from "./locales/ja.json";

export type RawDictionary = typeof ja;
export type Dictionary = i18n.Flatten<RawDictionary>;

const fetchDictionary = async (locale: string): Promise<Dictionary> => {
  try {
    let _locale = locale;
    if (locale === "en-US") {
      _locale = "en";
    }
    const dict = (await import(`./locales/${_locale}.json`)).default;
    return i18n.flatten<Dictionary>(dict);
  } catch (e) {
    console.warn(`Failed to load dictionary for locale: ${locale}`);
    const dict = (await import("./locales/ja.json")).default;
    return i18n.flatten(dict);
  }
};

const [locale, setLocale] = createSignal(navigator.language);

window.addEventListener("languagechange", () => {
  setLocale(navigator.language);
});

const [dict] = createResource(locale, fetchDictionary);

export const useI18n = () => i18n.translator(dict, i18n.resolveTemplate);
