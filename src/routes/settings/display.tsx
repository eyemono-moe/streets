import type { Component } from "solid-js";
import { useDeck } from "../../features/Column/context/deck";
import BasicLayout from "../../features/Settings/components/BasicLayout";
import { useI18n } from "../../i18n";

const display: Component = () => {
  const t = useI18n();

  const [deckState, { setAccentColor, setUIColor }] = useDeck();

  return (
    <BasicLayout title={t("settings.display.title")} backTo="/settings">
      <div class="space-y-4">
        <div class="flex flex-col gap-2">
          <h4 class="flex items-center gap-1 font-500 text-h3">
            {t("settings.display.color")}
          </h4>
          <label class="grid grid-cols-[minmax(0,1fr)_auto] items-center">
            {t("settings.display.accentColor")}
            <input
              type="color"
              class="rounded bg-secondary"
              value={deckState.display.theme.accent}
              onInput={(e) => setAccentColor(e.currentTarget.value)}
            />
          </label>
          <label class="grid grid-cols-[minmax(0,1fr)_auto] items-center">
            {t("settings.display.uiColor")}
            <input
              type="color"
              class="rounded bg-secondary"
              value={deckState.display.theme.ui}
              onInput={(e) => setUIColor(e.currentTarget.value)}
            />
          </label>
        </div>
      </div>
    </BasicLayout>
  );
};

export default display;
