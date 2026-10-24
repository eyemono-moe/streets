import type { ColumnAlert } from "@streets/core/deck/column-kinds";
import {
  ErrorBoundary,
  For,
  type ParentComponent,
  createMemo,
  createSignal,
} from "solid-js";
import { message, t } from "../i18n/locale";
import { reportError } from "../telemetry";
import {
  NewerItemsProvider,
  type NewerItemsReport,
  type NewerItemsReportValue,
  ScrollContainerProvider,
} from "../ui/VirtualList";
import NewerNotice from "./NewerNotice";

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 見えている最初の行。上端が見えている行を選び、無ければ（1 行が画面より高い）
 * 上端をまたいでいる行にする。
 */
const firstVisibleRow = (scroller: HTMLElement) => {
  const view = scroller.getBoundingClientRect();
  const rows = [...scroller.querySelectorAll<HTMLElement>("[data-virtual-row]")]
    .filter((row) => row.parentElement?.closest("[data-virtual-row]") == null)
    .map((row) => ({ row, rect: row.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top);
  return (
    rows.find(
      ({ rect }) => rect.top >= view.top - 1 && rect.top < view.bottom,
    ) ?? rows.find(({ rect }) => rect.top < view.top && rect.bottom > view.top)
  )?.row;
};

/** カラム本文の共通枠。警告はスクロール領域の外に置く。 */
const ColumnBody: ParentComponent<{
  columnId: string;
  alerts?: readonly ColumnAlert[];
  scrollsInternally?: boolean;
  scrollerRef: (element: HTMLDivElement) => void;
}> = (props) => {
  let scroller: HTMLDivElement | undefined;
  const [reports, setReports] = createSignal<
    ReadonlyMap<symbol, NewerItemsReportValue>
  >(new Map());
  const reportNewer: NewerItemsReport = (owner, newer) =>
    setReports((current) => {
      if (!newer && !current.has(owner)) return current;
      const next = new Map(current);
      if (newer) next.set(owner, newer);
      else next.delete(owner);
      return next;
    });
  const newer = createMemo(() => {
    const all = [...reports().values()].filter(
      (report) => report.items.length > 0,
    );
    const [first] = all;
    if (!first) return undefined;
    const items = all.flatMap((report) => report.items);
    return {
      noun: first.noun,
      count: items.length,
      authors: items.flatMap((item) => (item.author ? [item.author] : [])),
    };
  });
  // Tab で進む先を、見えている最初の行にする。カラムから入るときは、そのままだと
  // DOM の先頭（画面より上に先読みしてある行）へ進み、そこまでスクロールが戻る。
  // 読み進めてフォーカスを画面の外に置き去りにしたときも、そこへ戻ってしまう。
  const enterVisibleRow = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || event.ctrlKey) return;
    if (event.altKey || event.metaKey) return;
    if (!scroller || !(event.target instanceof HTMLElement)) return;
    const view = scroller.getBoundingClientRect();
    const inView = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > view.top && rect.top < view.bottom;
    };
    if (event.target === scroller) {
      // カラムから出ていく向きは止めない。
      if (event.shiftKey) return;
      const first = scroller.querySelector<HTMLElement>(TABBABLE);
      // 一覧より上にあるもの（プロフィールなど）が見えていれば、そこから辿る。
      if (
        first &&
        first.closest("[data-virtual-row]") === null &&
        inView(first)
      ) {
        return;
      }
    } else if (inView(event.target)) {
      return;
    }
    const row = firstVisibleRow(scroller);
    if (!row) return;
    event.preventDefault();
    row.focus({ preventScroll: true, focusVisible: true });
  };
  const scrollToTop = () => {
    for (const report of reports().values()) report.latest?.();
    scroller?.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  return (
    <>
      <For each={props.alerts}>
        {(alert) => (
          <p
            role="alert"
            class="c-secondary bg-secondary px-3 py-2 text-caption"
          >
            {t("columns.body.alertWithAction", {
              message: message(alert.message),
              action: message(alert.action),
            })}
          </p>
        )}
      </For>
      <div class="relative flex min-h-0 flex-1 flex-col">
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- スクロール領域そのもので、押せる部品ではない。Tab の行き先を見えている行へ直すだけ */}
        <div
          ref={(element) => {
            scroller = element;
            props.scrollerRef(element);
          }}
          data-scroll-container
          // キーで送るために入る口は、投稿に「押しても開かない場所」を作らずここに置く。
          // 投稿を押して開ける範囲を狭めると、広く押して開く操作が損なわれる。
          tabIndex={props.scrollsInternally === true ? undefined : 0}
          onKeyDown={enterVisibleRow}
          class="peer min-h-0 flex-1 outline-none"
          classList={{
            "flex flex-col overflow-hidden": props.scrollsInternally === true,
            // 表示中の行を保つのは VirtualList（TanStack の anchorTo）が受け持つ。
            // ブラウザの scroll anchoring も効かせると、両方が位置を直して行き違う。
            "overflow-y-auto overscroll-y-contain [overflow-anchor:none]":
              props.scrollsInternally !== true,
          }}
        >
          <ScrollContainerProvider value={() => scroller}>
            <NewerItemsProvider value={reportNewer}>
              <ErrorBoundary
                fallback={(error, reset) => {
                  console.error(
                    "カラムを描けませんでした",
                    props.columnId,
                    error,
                  );
                  reportError(error, "column-render");
                  return (
                    <div class="c-secondary flex flex-col items-start gap-2 p-4 text-caption">
                      <p>{t("columns.body.broken")}</p>
                      <button
                        type="button"
                        class="c-primary cursor-pointer rounded-full border border-control bg-primary px-3 py-1 font-600 hover:bg-secondary"
                        onClick={reset}
                      >
                        {t("columns.body.retry")}
                      </button>
                    </div>
                  );
                }}
              >
                {props.children}
              </ErrorBoundary>
            </NewerItemsProvider>
          </ScrollContainerProvider>
        </div>
        {/* 線はスクロール領域の上に重ねて引く。領域そのものの inset の影は投稿の背景に隠れる。 */}
        <div class="pointer-events-none absolute inset-0 hidden ring-2 ring-accent-5 ring-inset peer-focus-visible:block" />
        <NewerNotice newer={newer()} onClick={scrollToTop} />
      </div>
    </>
  );
};

export default ColumnBody;
