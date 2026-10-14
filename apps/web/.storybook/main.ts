import type { StorybookConfig } from "storybook-solidjs-vite";
import type { PluginOption } from "vite";

// devtools は起動中のアプリの読み取り層に繋ぐもので、固定のイベントを並べるカタログでは繋ぐ先が無い。
const withoutDevtools = (plugins: PluginOption[]): PluginOption[] =>
  plugins.flatMap((plugin) => {
    if (Array.isArray(plugin)) return withoutDevtools(plugin);
    if (
      plugin &&
      typeof plugin === "object" &&
      "name" in plugin &&
      plugin.name.startsWith("@tanstack/devtools")
    ) {
      return [];
    }
    return [plugin];
  });

const config = {
  stories: ["../src/**/*.stories.tsx"],
  // ロゴなど、アプリが /favicon.svg のように直に指すもの。
  staticDirs: ["../public"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "storybook-solidjs-vite",
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  // 画像や動画は fetch を通らないので、外の URL を指すと読みに行ってしまう。
  // 手元と data:・blob: に限る（fetch と WebSocket は offline-guard.ts が止める）。
  previewHead: (head) =>
    `${head}<meta http-equiv="Content-Security-Policy" content="img-src 'self' data: blob:; media-src 'self' data: blob:">`,
  viteFinal(viteConfig) {
    viteConfig.plugins = viteConfig.plugins
      ? withoutDevtools(viteConfig.plugins)
      : undefined;
    return viteConfig;
  },
} satisfies StorybookConfig;

export default config;
