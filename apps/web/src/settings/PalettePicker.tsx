import { RadioGroup } from "@ark-ui/solid/radio-group";
import { type Component, For } from "solid-js";
import { t } from "../i18n/locale";
import { PALETTES, type PaletteName } from "../theme";

/** 色の組み合わせ（アクセントと、文字と背景の色味）を 1 つ選ぶ。 */
const PalettePicker: Component<{
  /** 無ければどれも選ばない（色を自分で選んだとき）。 */
  value: PaletteName | undefined;
  onChange: (palette: (typeof PALETTES)[PaletteName]) => void;
}> = (props) => (
  <RadioGroup.Root
    orientation="horizontal"
    class="flex flex-wrap gap-2"
    value={props.value ?? ""}
    onValueChange={(details) => {
      const palette = PALETTES[details.value as PaletteName];
      if (palette) props.onChange(palette);
    }}
  >
    <RadioGroup.Label class="sr-only">
      {t("settings.palettes.label")}
    </RadioGroup.Label>
    <For each={Object.entries(PALETTES)}>
      {([name, palette]) => (
        <RadioGroup.Item
          value={name}
          class="group grid size-12 cursor-pointer place-items-center rounded-full border border-primary transition-colors data-[state=checked]:border-2 data-[state=checked]:border-ui-9 dark:data-[state=checked]:border-ui-1"
        >
          {/*
            左がアクセント、右が文字と背景の色味。境目は斜めにする（v0 と同じ）。
            斜めにすると角が欠けるので、中身を丸より広げてはみ出させる。
          */}
          <span class="h-8 w-8 overflow-hidden rounded-full">
            <span class="-ml-[20%] -skew-x-12 flex h-full w-[140%]">
              <span
                class="h-full w-1/2"
                style={{ background: palette.accent }}
              />
              <span class="h-full w-1/2" style={{ background: palette.ui }} />
            </span>
          </span>
          <RadioGroup.ItemText class="sr-only">
            {t(`settings.palettes.${name as PaletteName}`)}
          </RadioGroup.ItemText>
          <RadioGroup.ItemHiddenInput />
        </RadioGroup.Item>
      )}
    </For>
  </RadioGroup.Root>
);

export default PalettePicker;
