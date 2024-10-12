import devtools from "solid-devtools/vite";
import UnoCSS from "unocss/vite";
import Unfonts from "unplugin-fonts/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    Unfonts({
      google: {
        families: [
          {
            name: "Noto Sans JP",
            styles: "wght@400,500,700",
            defer: true,
          },
        ],
      },
    }),
    devtools({
      autoname: true,
      locator: {
        targetIDE: "vscode",
      },
    }),
    UnoCSS(),
    solid(),
  ],
  server: {
    port: 5173,
  },
});
