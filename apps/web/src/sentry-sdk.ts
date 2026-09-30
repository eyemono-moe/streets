import {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  browserSessionIntegration,
  browserTracingIntegration,
  captureException,
  close,
  cultureContextIntegration,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
  startInactiveSpan,
} from "@sentry/browser";

/**
 * `telemetry.ts` が後から読み込む Sentry の部品。`import("@sentry/browser")` で
 * パッケージを丸ごと読むと、使わない Replay や Feedback までビルドに残るので、
 * 使うものだけを名前で挙げる。
 */
export const sentrySdk = {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  browserSessionIntegration,
  browserTracingIntegration,
  captureException,
  close,
  cultureContextIntegration,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
  startInactiveSpan,
};
