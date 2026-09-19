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
  framework: {
    name: "storybook-solidjs-vite",
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  viteFinal(viteConfig) {
    viteConfig.plugins = viteConfig.plugins
      ? withoutDevtools(viteConfig.plugins)
      : undefined;
    return viteConfig;
  },
} satisfies StorybookConfig;

export default config;
