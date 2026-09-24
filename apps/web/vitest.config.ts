import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({ test: { include: ["src/**/*.test.{ts,tsx}"] } }),
  ),
);
