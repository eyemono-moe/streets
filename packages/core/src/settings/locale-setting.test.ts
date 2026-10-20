import { describe, expect, test } from "vite-plus/test";
import { loadLocalePreference, resolveLocale } from "./locale-setting";

describe("loadLocalePreference", () => {
  test("保存した言語を読む", () => {
    expect(loadLocalePreference("ja")).toBe("ja");
    expect(loadLocalePreference("en")).toBe("en");
  });

  test("未保存・読めない値はブラウザに従う", () => {
    expect(loadLocalePreference(null)).toBe("auto");
    expect(loadLocalePreference("fr")).toBe("auto");
  });
});

describe("resolveLocale", () => {
  test("選んだ言語はブラウザの言語より優先する", () => {
    expect(resolveLocale("ja", ["en-US"])).toBe("ja");
    expect(resolveLocale("en", ["ja-JP"])).toBe("en");
  });

  test("ブラウザが好む順に、最初に対応している言語を選ぶ", () => {
    expect(resolveLocale("auto", ["fr-FR", "ja-JP", "en-US"])).toBe("ja");
    expect(resolveLocale("auto", ["EN-gb", "ja"])).toBe("en");
  });

  test("対応している言語が無ければ英語にする", () => {
    expect(resolveLocale("auto", ["fr-FR", "de"])).toBe("en");
    expect(resolveLocale("auto", [])).toBe("en");
  });
});
