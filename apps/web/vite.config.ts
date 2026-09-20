import { execFileSync } from "node:child_process";
import { devtools } from "@tanstack/devtools-vite";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const commitSha = (): string => {
  const provided = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (provided) return provided.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
};

export default defineConfig({
  define: {
    "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(commitSha()),
  },
  plugins: [...devtools(), UnoCSS(), solid()],
  server: {
    port: 5173,
  },
});
