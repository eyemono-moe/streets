import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";
import { QueryClientProvider } from "@tanstack/solid-query";
import { type Preview, createDecorator } from "storybook-solidjs-vite";
import { action } from "storybook/actions";
import { MINIMAL_VIEWPORTS } from "storybook/viewport";
import { createAppQueryClient } from "../src/query-client";
import {
  type ColorScheme,
  PALETTES,
  type PaletteName,
  applyColorScheme,
  applyPalette,
} from "../src/theme";
import { ErrorToaster } from "../src/toast";
import { Mediates } from "../src/ui-events";

let stopColorScheme = () => {};
const queryClient = createAppQueryClient();

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
        <QueryClientProvider client={queryClient}>
          <div class="c-primary min-h-screen bg-primary font-sans">
            {/*
            部品が上へ渡したイベントは、アプリなら Mediator が裁定する。ストーリーでは
            Actions パネルへ出すだけにして、何が起きるはずかを確かめられるようにする。
          */}
            <Mediates
              handle={(event) => {
                action(event.type)(event);
                return true;
              }}
            >
              <Story />
            </Mediates>
            {/* 失敗の知らせはアプリと同じくトーストに出る。ストーリーでも同じ場所に出す。 */}
            <ErrorToaster />
          </div>
        </QueryClientProvider>
      );
    }),
  ],
};

export default preview;
