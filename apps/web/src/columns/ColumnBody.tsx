import type { ColumnAlert } from "@streets/core/deck/column-kinds";
import {
  ErrorBoundary,
  For,
  type ParentComponent,
  createMemo,
  createSignal,
} from "solid-js";
import {
  type NewerItem,
  NewerItemsProvider,
  type NewerItemsReport,
  ScrollContainerProvider,
} from "../ui/VirtualList";
import NewerNotice from "./NewerNotice";

/** カラム本文の共通枠。警告はスクロール領域の外に置く。 */
const ColumnBody: ParentComponent<{
  columnId: string;
  alerts?: readonly ColumnAlert[];
  scrollsInternally?: boolean;
  scrollerRef: (element: HTMLDivElement) => void;
}> = (props) => {
  let scroller: HTMLDivElement | undefined;
  const [reports, setReports] = createSignal<
    ReadonlyMap<symbol, { noun: string; items: readonly NewerItem[] }>
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
  const scrollToTop = () =>
    scroller?.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  return (
    <>
      <For each={props.alerts}>
        {(alert) => (
          <p
            role="alert"
            class="c-secondary bg-secondary px-3 py-2 text-caption"
          >
            {alert.message}
            {alert.action ? `。${alert.action}` : ""}
          </p>
        )}
      </For>
      <div class="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={(element) => {
            scroller = element;
            props.scrollerRef(element);
          }}
          data-scroll-container
          class="min-h-0 flex-1"
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
                  return (
                    <div class="c-secondary flex flex-col items-start gap-2 p-4 text-caption">
                      <p>このカラムを表示できませんでした。</p>
                      <button
                        type="button"
                        class="c-primary cursor-pointer rounded-full border border-primary bg-primary px-3 py-1 font-600 hover:bg-secondary"
                        onClick={reset}
                      >
                        もう一度表示する
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
        <NewerNotice newer={newer()} onClick={scrollToTop} />
      </div>
    </>
  );
};

export default ColumnBody;
