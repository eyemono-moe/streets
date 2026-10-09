import { Drawer } from "@ark-ui/solid/drawer";
import {
  type ColumnStackState,
  columnStackTransition,
  emptyColumnStack,
  openLayers,
  shownColumn,
} from "@streets/core/deck/column-stack";
import type { ColumnDef } from "@streets/core/deck/deck";
import { withKnownRelays } from "@streets/core/deck/known-relays";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { relaysSeenOn } from "@streets/core/read/seen-relays";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { type Component, For, Show, createEffect, onCleanup } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import ColumnContent from "../columns/ColumnContent";
import {
  ColumnHeader,
  type StackedColumn,
  StackedColumnHeader,
} from "../columns/ColumnHeader";
import { measureUntilPaint } from "../telemetry";
import { Mediates, type UiEvent } from "../ui-events";
import ColumnAccentBar from "./ColumnAccentBar";
import { useColumnTitle } from "./ColumnTitle";
import StackGrabber from "./StackGrabber";

export type ColumnProps = {
  column: ColumnDef;
  readLayer: ReadLayer;
  viewer: string;
  signedIn: boolean;
  followees: () => readonly string[];
  relayList: () => RelayListState;
  bookmarks: () => readonly string[];
  searchRelays: () => readonly RelayUrl[];
  settingsOpen: boolean;
  /** 見出しを掴んで並べ替えられる。 */
  grip?: boolean;
  temporary?: boolean;
  chrome?: boolean;
  stacked?: StackedColumn;
  /** 見えているカラム（重ねた一番上の段、無ければこのカラム）が変わった。 */
  onShown?: (id: string, shown: ColumnDef) => void;
  /**
   * 見出しを押したときの動き（重ねた段を戻す。無ければ先頭へ送る）を外へ渡す。
   * 狭い画面には見出しが無いので、選んでいるタブを押したときに代わりに呼ぶ。
   */
  registerHeader?: (id: string, press: () => void) => () => void;
};

/** 共通の枠とスタックを持ち、カラム固有の本文は `ColumnContent` に委ねる。 */
const Column: Component<ColumnProps> = (props) => {
  const [stack, setStack] = createStore<ColumnStackState>(emptyColumnStack());
  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "stack/open":
      case "stack/back":
      case "stack/closed":
        if (event.type === "stack/open") {
          measureUntilPaint("column.stack", "ui.column");
        }
        setStack(
          reconcile(
            columnStackTransition(
              unwrap(stack),
              event.type === "stack/open" && event.from
                ? {
                    ...event,
                    column: withKnownRelays(
                      event.column,
                      relaysSeenOn(props.readLayer.store, event.from),
                    ),
                  }
                : event,
              props.column,
            ),
            { key: "key" },
          ),
        );
        return true;
      default:
        return false;
    }
  };
  const opened = () => openLayers(stack).length > 0;
  createEffect(() => {
    if (!props.stacked) {
      props.onShown?.(props.column.id, shownColumn(stack, props.column));
    }
  });

  let scroller: HTMLDivElement | undefined;
  const scrollToTop = () =>
    scroller?.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  const onHeader = () =>
    opened() ? handle({ type: "stack/back" }) : scrollToTop();
  if (!props.stacked && props.registerHeader) {
    onCleanup(props.registerHeader(props.column.id, onHeader));
  }

  const body = () => (
    <ColumnContent
      column={props.column}
      readLayer={props.readLayer}
      viewer={props.viewer}
      signedIn={props.signedIn}
      followees={props.followees}
      relayList={props.relayList}
      bookmarks={props.bookmarks}
      searchRelays={props.searchRelays}
      remembersTabs={!props.stacked && !props.temporary}
      remembersParts={!props.stacked && !props.temporary}
      scrollerRef={(element) => {
        scroller = element;
      }}
    />
  );

  const chrome = () => (
    <>
      <Show when={props.chrome !== false && !props.stacked}>
        <ColumnAccentBar temporary={props.temporary} />
      </Show>
      <Show
        when={props.stacked}
        fallback={
          <Show when={props.chrome !== false}>
            {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- キーボードからは題名のボタンと「戻る」ボタンで操作する */}
            <div
              onClick={(event) => {
                const target = event.target;
                if (target instanceof Element && target.closest("button")) {
                  return;
                }
                onHeader();
              }}
            >
              <ColumnHeader
                column={props.column}
                open={props.settingsOpen}
                grip={props.grip}
                temporary={props.temporary}
                onTitle={onHeader}
              />
            </div>
          </Show>
        }
      >
        {(stacked) => (
          <StackedColumnHeader
            column={props.column}
            stacked={stacked()}
            onTitle={scrollToTop}
          />
        )}
      </Show>
    </>
  );

  const inner = () => (
    <section class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-primary">
      {chrome()}
      <Show when={!props.stacked} fallback={body()}>
        <div class="relative min-h-0 flex-1">
          <div
            class="absolute inset-0 isolate flex flex-col"
            inert={stack.layers.length > 0}
          >
            {body()}
          </div>
          <Show when={stack.layers.length > 0}>
            <button
              type="button"
              aria-label="重ねた表示を閉じる"
              class="motion-fade absolute inset-0 w-full cursor-pointer bg-ui-950/25"
              data-state={opened() ? "open" : "closed"}
              onClick={() => handle({ type: "stack/back" })}
            />
          </Show>
          <For each={stack.layers}>
            {(layer, index) => {
              const layerTitle = useColumnTitle(() => layer.column);
              return (
                <Drawer.Root
                  open={layer.open}
                  onOpenChange={(details) => {
                    if (!details.open) handle({ type: "stack/back" });
                  }}
                  onExitComplete={() =>
                    handle({ type: "stack/closed", key: layer.key })
                  }
                  lazyMount
                  unmountOnExit
                  modal={false}
                  trapFocus={false}
                  preventScroll={false}
                  closeOnInteractOutside={false}
                  // Ark UI は先に開いていた層（名刺のホバーカードなど）が閉じると、
                  // 後から開いた層も一緒に閉じる。名刺を出したままアイコンを押すと、
                  // 開いたばかりの段が名刺と一緒に閉じてしまう。段の開閉は stack が持つ。
                  onRequestDismiss={(event) => event.preventDefault()}
                  swipeDirection="down"
                >
                  <Drawer.Positioner class="absolute inset-0 isolate">
                    <Drawer.Content
                      aria-label={layerTitle()}
                      inert={index() < stack.layers.length - 1}
                      class="motion-stack absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-3 border-primary border-t bg-primary shadow-[0_-10px_30px_rgba(0,0,0,0.28)] outline-none transition-transform duration-180 ease-out dark:shadow-[0_-10px_30px_rgba(0,0,0,0.7)]"
                      style={{ top: `${Math.min(index() + 1, 3) * 8}px` }}
                    >
                      <StackGrabber />
                      <Column
                        {...props}
                        column={layer.column}
                        settingsOpen={false}
                        grip={false}
                        temporary={false}
                        stacked={{
                          backTo:
                            index() > 0
                              ? (stack.layers[index() - 1]?.column ??
                                props.column)
                              : props.column,
                        }}
                      />
                    </Drawer.Content>
                  </Drawer.Positioner>
                </Drawer.Root>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );

  return props.stacked ? (
    inner()
  ) : (
    <Mediates handle={handle}>{inner()}</Mediates>
  );
};

export default Column;
