import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";
import { type Preview, createDecorator } from "storybook-solidjs-vite";
import { MINIMAL_VIEWPORTS } from "storybook/viewport";
import {
  type ColorScheme,
  PALETTES,
  type PaletteName,
  applyColorScheme,
  applyPalette,
} from "../src/theme";

let stopColorScheme = () => {};

// カラム幅は可変にする予定なので、デザインの 380px の前後を並べる。高さは見本の置き場なので広めに取る。
const columnViewport = (width: number) => ({
  name: `カラム ${width}px`,
  styles: { width: `${width}px`, height: "900px" },
  type: "desktop" as const,
});

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
    viewport: { value: "column380", isRotated: false },
  },
  parameters: {
    layout: "fullscreen",
    viewport: {
      options: {
        column320: columnViewport(320),
        column380: columnViewport(380),
        column480: columnViewport(480),
        column640: columnViewport(640),
        ...MINIMAL_VIEWPORTS,
      },
    },
  },
  decorators: [
    createDecorator((Story, context) => {
      // アプリと同じ関数で切り替え、Storybook で見た色がアプリの色と食い違わないようにする。
      applyPalette(context.globals.palette as PaletteName);
      stopColorScheme();
      stopColorScheme = applyColorScheme(
        context.globals.colorScheme as ColorScheme,
      );
      // 幅はビューポートに任せ、見本はその幅いっぱいに描く。
      return (
        <div class="c-primary min-h-screen bg-primary font-sans">
          <Story />
        </div>
      );
    }),
  ],
};

export default preview;
