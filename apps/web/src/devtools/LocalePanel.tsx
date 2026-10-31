import type { LocalePreference } from "@streets/core/settings/locale-setting";
import { type Component, For } from "solid-js";
import { locale, localePreference, setLocalePreference } from "../i18n/locale";

const CHOICES: LocalePreference[] = ["auto", "ja", "en"];

/** 画面の言語を切り替え、ブラウザに合わせたときに何が選ばれたかを見る。 */
const LocalePanel: Component = () => (
  <section class="flex flex-col gap-2">
    <h2 class="font-bold">Language</h2>
    <div class="flex gap-2">
      <For each={CHOICES}>
        {(choice) => (
          <label class="flex items-center gap-1">
            <input
              type="radio"
              name="streets-locale"
              checked={localePreference() === choice}
              onChange={() => setLocalePreference(choice)}
            />
            {choice}
          </label>
        )}
      </For>
    </div>
    <p class="opacity-70">in use: {locale()}</p>
  </section>
);

export default LocalePanel;
