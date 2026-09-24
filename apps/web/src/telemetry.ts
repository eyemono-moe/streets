import { scrubText, scrubUrl } from "@streets/core/telemetry/scrub";
import { errorReport } from "./error-report-setting";

/**
 * 壊れたときに気付けるようにする（Sentry）。送るのは「どこで何が起きたか」
 * だけで、鍵・公開鍵・イベント id・本文は落としてから送る。
 *
 * `VITE_SENTRY_DSN` が無ければ何もしない。開発中（vite dev）も送らない。
 * SDK は必要になってから読み込む —— 送らない人に 20KB を配らないため。
 */
let sentry: typeof import("@sentry/solid") | undefined;

export const startTelemetry = async () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || import.meta.env.DEV) return;
  if (!errorReport()) {
    // 設定で止めているときは送らない。読み込み済みなら、そこで閉じる。
    sentry?.close();
    sentry = undefined;
    return;
  }
  if (sentry) return;

  const Sentry = await import("@sentry/solid");
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENV ?? "production",
    release: import.meta.env.VITE_COMMIT_SHA,
    // IP アドレス・Cookie・ヘッダーを送らせない。
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false },
    // 重さの計測（#387）は別途。今は壊れたことだけを拾う。
    tracesSampleRate: 0,
    // 入力された文字や本文が混ざらないよう、操作とコンソールの記録は取らない。
    integrations: (defaults) => [
      ...defaults.filter((integration) => integration.name !== "Console"),
      Sentry.breadcrumbsIntegration({ dom: false }),
    ],
    beforeSend: (event) => {
      if (event.request?.url) {
        event.request.url = scrubUrl(event.request.url);
      }
      if (event.message) event.message = scrubText(event.message);
      for (const entry of event.exception?.values ?? []) {
        if (entry.value) entry.value = scrubText(entry.value);
      }
      // 誰が使っているかは要らない。
      event.user = undefined;
      return event;
    },
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.message) {
        breadcrumb.message = scrubText(breadcrumb.message);
      }
      const data = breadcrumb.data;
      if (data && typeof data.url === "string") data.url = scrubUrl(data.url);
      return breadcrumb;
    },
  });
  sentry = Sentry;
};

/** 画面を描けなかったときなど、こちらで掴んだ失敗を送る。送り先が無ければ何もしない。 */
export const reportError = (error: unknown, context: string) => {
  sentry?.captureException(error, { tags: { context } });
};
