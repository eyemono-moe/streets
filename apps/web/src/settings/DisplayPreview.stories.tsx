import {
  type BackgroundScheme,
  backgroundBrightnessRange,
  backgroundLift,
  formatBackgroundBrightness,
} from "@streets/core/settings/background-brightness";
import {
  formatUiContrast,
  UI_CONTRAST_MAX,
  UI_CONTRAST_MIN,
} from "@streets/core/settings/ui-contrast";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { messageOrText } from "../i18n/locale";
import DisplayPreview from "./DisplayPreview";

const meta = {
  title: "Settings/DisplayPreview",
  component: DisplayPreview,
} satisfies Meta<typeof DisplayPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

const CONTRASTS = [UI_CONTRAST_MIN, 1, UI_CONTRAST_MAX];

/**
 * コントラストの両端と標準を並べる。`--ui-contrast` は要素ごとに効くので、同じ画面で見比べられる。
 * ライト・ダークはツールバーの「カラーモード」で切り替える。
 */
export const Contrast: Story = {
  render: () => (
    <div class="grid gap-4 bg-primary p-4 md:grid-cols-3">
      <For each={CONTRASTS}>
        {(factor) => (
          <div
            class="c-primary flex flex-col gap-2 bg-primary"
            style={{ "--ui-contrast": factor }}
          >
            <p class="text-body font-bold">
              {messageOrText(formatUiContrast(factor))}
            </p>
            <DisplayPreview />
            {/* 投稿の外の段。薄い面と区切り線が、背景と見分けられるかを見る。 */}
            <div class="flex flex-col gap-1 rounded-2 border border-primary p-2">
              <div class="rounded-1 bg-ui-50 p-2 text-body dark:bg-ui-900">
                ui-50 / ui-900
              </div>
              <div class="rounded-1 bg-ui-100 p-2 text-body dark:bg-ui-800">
                ui-100 / ui-800
              </div>
              <div class="rounded-1 bg-ui-200 p-2 text-body dark:bg-ui-700">
                ui-200 / ui-700
              </div>
              <p class="text-body c-status-off">補助の文字（status-off）</p>
            </div>
          </div>
        )}
      </For>
    </div>
  ),
};

/**
 * 背景の明るさの標準・中ほど・端を並べる。テーマはストーリーで固定する。
 * `--ui-lift` は html で受け直した値が継がれるので、見本ごとに `--ui-lift` を直に置く。
 */
const backgroundStory = (scheme: BackgroundScheme): Story => {
  const { min, max } = backgroundBrightnessRange(scheme);
  const edge = scheme === "dark" ? max : min;
  return {
    globals: { colorScheme: scheme },
    render: () => (
      <div class="grid gap-4 md:grid-cols-3">
        <For each={[0, edge / 2, edge]}>
          {(value) => (
            <div
              class="c-primary flex flex-col gap-2 bg-primary p-4"
              style={{ "--ui-lift": backgroundLift(value) }}
            >
              <p class="text-body font-bold">
                {messageOrText(formatBackgroundBrightness(value))}
              </p>
              <DisplayPreview />
              <div class="flex flex-col gap-1 rounded-2 border border-primary p-2">
                <div class="rounded-1 bg-secondary p-2 text-body">
                  bg-secondary
                </div>
                <div class="rounded-1 bg-tertiary p-2 text-body">
                  bg-tertiary
                </div>
                <p class="text-body c-secondary">c-secondary</p>
              </div>
            </div>
          )}
        </For>
      </div>
    ),
  };
};

export const BackgroundLight = backgroundStory("light");
export const BackgroundDark = backgroundStory("dark");
