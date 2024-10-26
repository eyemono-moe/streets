import { createSignal } from "solid-js";

const [localeSignal, setLocale] = createSignal(navigator.language);

window.addEventListener("languagechange", () => {
  setLocale(navigator.language);
});

export const locale = localeSignal;
