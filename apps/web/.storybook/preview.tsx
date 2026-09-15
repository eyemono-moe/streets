import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";
import { type Preview, createDecorator } from "storybook-solidjs-vite";
import {
  type ColorScheme,
  PALETTES,
  type PaletteName,
  applyColorScheme,
  applyPalette,
} from "../src/theme";

let stopColorScheme = () => {};

const preview: Preview = {
  globalTypes: {
    palette: {
      description: "テーマ色",
      toolbar: {
        title: "テーマ色",
        icon: "paintbrush",
        items: Object.keys(PALETTES),
        dynamicTitle: true,
      },
    },
    colorScheme: {
      description: "ライト / ダーク",
      toolbar: {
        title: "カラーモード",
        icon: "mirror",
        items: [
          { value: "system", title: "OS 設定に従う" },
          { value: "light", title: "ライト", icon: "sun" },
          { value: "dark", title: "ダーク", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    palette: "purple",
    colorScheme: "light",
  },
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    createDecorator((Story, context) => {
      // アプリと同じ関数で切り替え、Storybook で見た色がアプリの色と食い違わないようにする。
      applyPalette(context.globals.palette as PaletteName);
      stopColorScheme();
      stopColorScheme = applyColorScheme(
        context.globals.colorScheme as ColorScheme,
      );
      // 幅はデザインのカラム幅（380px）に合わせる。
      return (
        <div class="c-primary min-h-screen bg-secondary p-6 font-sans">
          <div class="w-95 overflow-hidden bg-primary">
            <Story />
          </div>
        </div>
      );
    }),
  ],
};

export default preview;
