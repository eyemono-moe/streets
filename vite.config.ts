import devtools from "solid-devtools/vite";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    devtools({
      autoname: true,
      locator: {
        targetIDE: "vscode",
      },
    }),
    UnoCSS(),
    solid(),
  ],
});
