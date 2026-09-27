import { scrubText, scrubUrl } from "@streets/core/telemetry/scrub";
import { errorReport } from "./error-report-setting";

/**
 * 壊れたときと重いときに気付けるようにする（Sentry）。送るのは「どこで何が
 * 起きたか」と「どれだけかかったか」だけで、鍵・公開鍵・イベント id・本文は
 * 落としてから送る。
 *
 * `VITE_SENTRY_DSN` が無ければ何もしない。開発中（vite dev）も送らない。
 * SDK は必要になってから読み込む —— 送らない人に 20KB を配らないため。
 */
let sentry: typeof import("@sentry/solid") | undefined;

/**
 * 重さを送る割合。プレビューは手元で試した分を必ず見られるよう全部送り、
 * 本番は無料枠に収まるよう 10 回に 1 回にする。
 */
const TRACES_SAMPLE_RATE: Record<string, number> = {
  production: 0.1,
  preview: 1,
};

export const startTelemetry = async () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || import.meta.env.DEV) return;
  if (!errorReport()) {
    // 設定で止めているときは送らない。読み込み済みなら、そこで閉じる。
    void sentry?.close();
    sentry = undefined;
    return;
  }
  if (sentry) return;

  const Sentry = await import("@sentry/solid");
  const environment = import.meta.env.VITE_SENTRY_ENV ?? "production";
  Sentry.init({
    dsn,
    environment,
    release: import.meta.env.VITE_COMMIT_SHA,
    // IP アドレス・Cookie・ヘッダーを送らせない。
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false },
    tracesSampleRate: TRACES_SAMPLE_RATE[environment] ?? 0,
    // 計測の印を、こちらの Worker を含めてどこへの通信にも付けない。
    tracePropagationTargets: [],
    // 入力された文字や本文が混ざらないよう、操作とコンソールの記録は取らない。
    integrations: (defaults) => [
      ...defaults.filter((integration) => integration.name !== "Console"),
      Sentry.breadcrumbsIntegration({ dom: false }),
      Sentry.browserTracingIntegration({
        // 画像やスクリプトの 1 つ 1 つ、通信の 1 本 1 本は送らない。アイコンの
        // 数だけ区間が増えて枠を食い、URL から誰の画像かも分かってしまう。
        ignoreResourceSpans: [
          "resource.img",
          "resource.script",
          "resource.css",
          "resource.link",
          "resource.fetch",
          "resource.other",
        ],
        traceFetch: false,
        traceXHR: false,
      }),
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
    // 区間は 1 つずつ届く。画面の読み込みの区間は名前が URL の道筋
    // （`/npub1…` など）になり、LCP の画像の URL なども属性に入る。
    beforeSendSpan: (span) => {
      span.name = scrubText(span.name);
      for (const [key, raw] of Object.entries(span.attributes)) {
        if (typeof raw === "string") {
          span.attributes[key] = scrubUrl(raw);
        } else if (
          typeof raw === "object" &&
          raw !== null &&
          "value" in raw &&
          typeof raw.value === "string"
        ) {
          span.attributes[key] = { ...raw, value: scrubUrl(raw.value) };
        }
      }
      return span;
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

const nowSeconds = () => (performance.timeOrigin + performance.now()) / 1000;

/**
 * 重い操作の区間を測り始め、終える関数を返す。始めた時刻は手元に持ち、送るのは
 * 終えたときだけ —— SDK はあとから読み込むので、始めた時点ではまだ無いことがある。
 * 2 回目以降の呼び出しは何もしない。
 */
export const startMeasure = (name: string, op: string) => {
  const startTime = nowSeconds();
  let ended = false;
  return (attributes?: Record<string, number | string>) => {
    if (ended) return;
    ended = true;
    sentry
      ?.startInactiveSpan({
        name,
        op,
        startTime,
        attributes,
        // 画面の読み込みの区間の子にすると、読み込みが終わった後の操作が落ちる。
        parentSpan: null,
        forceTransaction: true,
      })
      .end(nowSeconds());
  };
};

const painting = new Set<string>();

/**
 * 次の描画が済んだところで終える。描画の後のタスクで測ると、スタイルの計算と
 * 描画が入る。同じ名前の区間を測っている間は重ねない（スライダーを動かして
 * いる間など、1 回の描画に何度も来る）。
 */
export const measureUntilPaint = (name: string, op: string) => {
  if (painting.has(name)) return;
  painting.add(name);
  const end = startMeasure(name, op);
  requestAnimationFrame(() =>
    setTimeout(() => {
      painting.delete(name);
      end();
    }),
  );
};

/** 何も出ないまま待ち続ける区間は、この長さで送らずに捨てる。 */
const CONTENT_WAIT_LIMIT_MS = 60_000;
const contentWaiters = new Map<string, Set<() => void>>();

/** どれかのカラムに最初の中身が出たとき。 */
export const ANY_COLUMN = "*";

/**
 * カラム `columnId`（`ANY_COLUMN` ならどれか）に最初の中身が出たら `onShown` を
 * 呼ぶ。出ないまま `CONTENT_WAIT_LIMIT_MS` 経ったら呼ばずに忘れる。返す関数で
 * 待つのをやめる。
 */
export const whenColumnShows = (columnId: string, onShown: () => void) => {
  const waiters = contentWaiters.get(columnId) ?? new Set();
  contentWaiters.set(columnId, waiters);
  const forget = () => {
    clearTimeout(timer);
    waiters.delete(run);
    if (waiters.size === 0) contentWaiters.delete(columnId);
  };
  const run = () => {
    forget();
    onShown();
  };
  const timer = setTimeout(forget, CONTENT_WAIT_LIMIT_MS);
  waiters.add(run);
  return forget;
};

/** カラムに最初の中身が出た。 */
export const columnShowed = (columnId: string) => {
  for (const key of [columnId, ANY_COLUMN]) {
    for (const waiter of [...(contentWaiters.get(key) ?? [])]) waiter();
  }
};
