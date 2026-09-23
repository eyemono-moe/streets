import { execFileSync } from "node:child_process";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";
import UnoCSS from "unocss/vite";
import { type Plugin, defineConfig } from "vite";
import solid from "vite-plugin-solid";
import {
  LINK_CARD_PATH,
  handleLinkCard,
} from "../../workers/app/src/link-card-handler";

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
 * 本番では Worker（`workers/app`）が受ける `/api/link-card` を、開発サーバーでも
 * 同じ処理で返す。回数の制限とキャッシュは無い。
 */
const linkCardApi = (): Plugin => ({
  name: "streets-link-card-api",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith(LINK_CARD_PATH)) return next();
      const response = await handleLinkCard(
        new Request(new URL(req.url, "http://localhost")),
        { fetch, skipSiteCheck: true },
      );
      res.statusCode = response.status;
      res.setHeader("content-type", "application/json");
      res.end(await response.text());
    });
  },
});

const release = commitSha();

export default defineConfig({
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
    linkCardApi(),
    ...sentryUpload(release),
  ],
  build: {
    // 送るときだけ作る。配らずに消すので、公開されるものは変わらない。
    sourcemap: Boolean(process.env.SENTRY_AUTH_TOKEN),
  },
  server: {
    port: 5173,
  },
});
