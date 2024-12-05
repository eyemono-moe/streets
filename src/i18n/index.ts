import * as i18n from "@solid-primitives/i18n";
import { createResource } from "solid-js";
import { locale } from "../shared/libs/useLocale";
import type ja from "./locales/ja.json";

type RawDictionary = typeof ja;
type Dictionary = i18n.Flatten<RawDictionary>;

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

const [dict] = createResource(locale, fetchDictionary);

export const useI18n = () => i18n.translator(dict, i18n.resolveTemplate);

export type Translator = ReturnType<typeof useI18n>;
