import { execFileSync } from "node:child_process";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";
import { visualizer } from "rollup-plugin-visualizer";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { unicodeEmojis } from "./emoji-data-plugin";
import { releaseNotes } from "./release-notes-plugin";

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

/**
 * Sentry へソースマップを送る。送り先の鍵（`SENTRY_AUTH_TOKEN`）が無ければ
 * 何もしない —— 手元のビルドや、鍵を持たない CI でも落ちないようにする。
 * 鍵と組織名は `VITE_` を付けない。付けると画面側へ混ざってしまう。
 */
const sentryUpload = (release: string) => {
  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!authToken || !org || !project) return [];
  return [
    sentryVitePlugin({
      authToken,
      org,
      project,
      // 画面側が送る `release` と同じ名前にしないと、送ったマップが結び付かない。
      release: { name: release },
      sourcemaps: {
        // 送ったあとは配らない。ソースが誰からでも読めてしまう。
        filesToDeleteAfterUpload: ["./dist/**/*.js.map"],
      },
      // 送れなくてもデプロイは続ける（読みにくいスタックのまま出る）。
      errorHandler: (error) => {
        console.warn("Sentry へソースマップを送れませんでした", error.message);
      },
    }),
  ];
};

/**
 * `pnpm build:analyze` のときだけ、チャンクの中身を面積で描いた図を `stats/` に出す。
 * `dist` に置くと、そのまま本番に配られてしまう。
 */
const analyze = (mode: string) =>
  mode === "analyze"
    ? [
        visualizer({
          filename: "stats/chunks.html",
          template: "treemap",
          gzipSize: true,
          brotliSize: true,
        }),
      ]
    : [];

const release = commitSha();

export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(release),
    // Sentry から、使っていない機能（重さの計測・デバッグ出力）を落とす。
    __SENTRY_TRACING__: "false",
    __SENTRY_DEBUG__: "false",
  },
  plugins: [
    ...devtools(),
    UnoCSS(),
    solid(),
    releaseNotes(),
    unicodeEmojis(),
    ...sentryUpload(release),
    ...analyze(mode),
  ],
  build: {
    // Vite 7 以降の既定（Baseline Widely Available）と同じ。Vite 6 の既定では
    // core のクラスの private フィールド（`#events` など）が WeakMap の呼び出しに
    // 書き換えられ、イベントを読むたびに余計な手間がかかる。
    target: ["chrome107", "edge107", "firefox104", "safari16"],
    // 送るときだけ作る。配らずに消すので、公開されるものは変わらない。
    sourcemap: Boolean(process.env.SENTRY_AUTH_TOKEN),
  },
  server: {
    port: 5173,
    // 本番では Worker（workers/app）が受ける /api を、`wrangler dev` へ渡す。
    // ルートの `pnpm dev` が両方を立ち上げる。
    proxy: { "/api": "http://localhost:8787" },
  },
}));
