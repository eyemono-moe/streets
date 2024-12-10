import { Collapsible } from "@kobalte/core/collapsible";
import {
  createScheduled,
  leadingAndTrailing,
  throttle,
} from "@solid-primitives/scheduled";
import { type Component, For, createEffect, createSignal } from "solid-js";
import { useDeck } from "../../features/Column/context/deck";
import BasicLayout from "../../features/Settings/components/BasicLayout";
import { useI18n } from "../../i18n";
import "../../assets/collapsible.css";
import { Switch } from "../../shared/components/UI/Switch";

const defaultColorSet: {
  accent: string;
  ui: string;
}[] = [
  {
    accent: "#8340bb",
    ui: "#302070",
  },
  {
    accent: "#40a2ba",
    ui: "#104651",
  },
  {
    accent: "#97d737",
    ui: "#122202",
  },
  {
    accent: "#d76f37",
    ui: "#220502",
  },
  {
    accent: "#ba40a0",
    ui: "#401051",
  },
];

const display: Component = () => {
  const t = useI18n();

  const [deckState, { setAccentColor, setUIColor, toggleShowLoading }] =
    useDeck();

  const [tmpAccentColor, setTmpAccentColor] = createSignal<string>(
    deckState.display.theme.accent,
  );
  const [tmpUIColor, setTmpUIColor] = createSignal<string>(
    deckState.display.theme.ui,
  );

  const accentScheduled = createScheduled((fn) =>
    leadingAndTrailing(throttle, fn, 200),
  );
  const uiScheduled = createScheduled((fn) =>
    leadingAndTrailing(throttle, fn, 200),
  );

  createEffect(() => {
    const accentColor = tmpAccentColor();
    if (accentScheduled()) {
      setAccentColor(accentColor);
    }
  });

  createEffect(() => {
    const uiColor = tmpUIColor();
    if (uiScheduled()) {
      setUIColor(uiColor);
    }
  });

  return (
    <BasicLayout title={t("settings.display.title")} backTo="/settings">
      <div class="space-y-4">
        <div class="flex flex-col gap-2">
          <h4 class="flex items-center gap-1 font-500 text-h3">
            {t("settings.display.color")}
          </h4>
          <div class="flex flex-wrap gap-2">
            <For each={defaultColorSet}>
              {(colorSet) => (
                <button
                  type="button"
                  class="b-2 appearance-none overflow-hidden rounded-full bg-transparent"
                  onClick={() => {
                    setAccentColor(colorSet.accent);
                    setUIColor(colorSet.ui);
                  }}
                >
                  <div class="flex skew-x--12">
                    <div
                      class="h-6 w-6"
                      style={{
                        "background-color": colorSet.accent,
                      }}
                    />
                    <div
                      class="h-6 w-6"
                      style={{
                        "background-color": colorSet.ui,
                      }}
                    />
                  </div>
                </button>
              )}
            </For>
          </div>
          <Collapsible>
            <Collapsible.Trigger class="group appearance-none bg-transparent">
              <h4 class="flex items-center gap-1 font-500">
                {t("settings.display.customColor")}
                <div class="i-material-symbols:expand-more-rounded aspect-square h-1lh w-auto transition-transform duration-100 group-data-[expanded]:rotate-180" />
              </h4>
            </Collapsible.Trigger>
            <Collapsible.Content class="animate-[slideUp] animate-duration-100 overflow-hidden data-[expanded]:animate-[slideDown] data-[expanded]:animate-duration-100">
              <label class="grid grid-cols-[minmax(0,1fr)_auto] items-center">
                {t("settings.display.accentColor")}
                <input
                  type="color"
                  class="rounded bg-secondary"
                  value={deckState.display.theme.accent}
                  onInput={(e) => setTmpAccentColor(e.currentTarget.value)}
                />
              </label>
              <label class="grid grid-cols-[minmax(0,1fr)_auto] items-center">
                {t("settings.display.uiColor")}
                <input
                  type="color"
                  class="rounded bg-secondary"
                  value={deckState.display.theme.ui}
                  onInput={(e) => setTmpUIColor(e.currentTarget.value)}
                />
              </label>
            </Collapsible.Content>
          </Collapsible>
        </div>
        <div class="flex flex-col gap-2">
          <h4 class="flex items-center gap-1 font-500 text-h3">
            {t("settings.display.loadingIndicator")}
          </h4>
          <Switch
            label={t("settings.display.showLoading")}
            checked={deckState.display.showLoading}
            onChange={toggleShowLoading}
          />
        </div>
      </div>
    </BasicLayout>
  );
};

export default display;
