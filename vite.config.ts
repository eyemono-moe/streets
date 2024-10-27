import devtools from "solid-devtools/vite";
import UnoCSS from "unocss/vite";
import Unfonts from "unplugin-fonts/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
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
    VitePWA({
      srcDir: "src",
      filename: "service-worker.ts",
      strategies: "injectManifest",
      injectRegister: false,
      manifest: false,
      injectManifest: {
        injectionPoint: undefined,
      },
      devOptions: {
        enabled: true,
        type: "module",
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
