import type { StorybookConfig } from "storybook-solidjs-vite";
import type { PluginOption } from "vite";

const withoutPwa = (plugins: PluginOption[]): PluginOption[] =>
  plugins.flatMap((plugin) => {
    if (Array.isArray(plugin)) return withoutPwa(plugin);
    if (
      plugin &&
      typeof plugin !== "function" &&
      plugin.name.startsWith("vite-plugin-pwa")
    ) {
      return [];
    }
    return [plugin];
  });

const config = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "storybook-solidjs-vite",
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  viteFinal(viteConfig) {
    // 本体の Vite 設定から見た目に必要な UnoCSS・fonts・Solid は借りるが、
    // 独立したカタログに service worker を生成しても確認できる性質は増えない。
    viteConfig.plugins = viteConfig.plugins
      ? withoutPwa(viteConfig.plugins)
      : undefined;
    return viteConfig;
  },
} satisfies StorybookConfig;

export default config;
