import {
  formatUiContrast,
  UI_CONTRAST_MAX,
  UI_CONTRAST_MIN,
} from "@streets/core/settings/ui-contrast";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
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
            <p class="text-body font-bold">{formatUiContrast(factor)}</p>
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
