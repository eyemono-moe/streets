import { devtools } from "@tanstack/devtools-vite";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [...devtools(), UnoCSS(), solid()],
  server: {
    port: 5173,
  },
});
