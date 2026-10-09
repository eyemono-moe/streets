import { columnForEvent } from "@streets/core/deck/open-event";
import { CHANNEL_MESSAGE_KIND } from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { EventRef } from "@streets/core/nostr/event-refs";
import { layoutNote } from "@streets/core/view/note-layout";
import { observeHeight } from "@streets/core/view/shared-resize-observer";
import {
  type Component,
  For,
  type JSX,
  type ParentComponent,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { lazyPart } from "../lazy-part";
import { useDispatch } from "../ui-events";
import ContentWarningGate from "./ContentWarningGate";
import { EventRefView, type EventSize } from "./Event";
import LinkCards from "./LinkCards";
import NoteMediaView, { NoteAudio } from "./NoteMedia";
import NoteText from "./NoteText";

const MediaViewer = lazyPart(() => import("./MediaViewer"));

const MAX_CONTENT_HEIGHT: Record<EventSize, number> = {
  normal: 400,
  compact: 240,
};

const Quote: Component<{ quote: EventRef }> = (props) => (
  <div class="w-full overflow-hidden rounded-2 border border-primary">
    <EventRefView target={props.quote} size="compact" gateMuted />
  </div>
);

/**
 * 長い本文の扱い。`open` は押すと投稿を重ねたカラムで開く（一覧の既定）、`expand` は
 * その場で広げる、`full` は畳まない。
 */
export type LongBody = "open" | "expand" | "full";

/** 実際の描画高が大きい本文だけを畳む。監視は全ノートで1つを共有する。 */
const CollapsibleBody: ParentComponent<{
  size: EventSize;
  longBody: LongBody;
  onOpen: () => void;
}> = (props) => {
  const [body, setBody] = createSignal<HTMLDivElement>();
  const [height, setHeight] = createSignal(0);
  const [expanded, setExpanded] = createSignal(false);
  const maxHeight = () => MAX_CONTENT_HEIGHT[props.size];
  const overflows = () => height() >= maxHeight();
  const folded = () => props.longBody !== "full" && !expanded();

  createEffect(() => {
    const element = body();
    if (element) onCleanup(observeHeight(element, setHeight));
  });

  return (
    <div class="relative">
      <div
        ref={setBody}
        class="overflow-hidden"
        style={{
          "max-height": folded() ? `${maxHeight()}px` : "none",
        }}
      >
        {props.children}
      </div>
      <Show when={overflows() && folded()}>
        <button
          type="button"
          class="absolute bottom-0 flex w-full appearance-none justify-center bg-gradient-to-b bg-transparent from-white/0 to-white pt-4 text-caption dark:from-ui-950/0 dark:to-ui-950"
          classList={{
            "cursor-pointer": props.longBody === "open",
            "cursor-s-resize": props.longBody === "expand",
          }}
          onClick={() =>
            props.longBody === "open" ? props.onOpen() : setExpanded(true)
          }
        >
          <span class="flex items-center gap-1 rounded bg-tertiary px-2 py-0.5">
            <span
              class={
                props.longBody === "open"
                  ? "i-material-symbols:open-in-new-rounded h-1.25lh w-auto"
                  : "i-material-symbols:expand-more-rounded h-1.25lh w-auto"
              }
              aria-hidden="true"
            />
            <span>
              {props.longBody === "open" ? "続きを読む" : "さらに表示"}
            </span>
          </span>
        </button>
      </Show>
    </div>
  );
};

/**
 * 本文・画像・音声・リンクのカード・引用。投稿の枠（アイコン・名前・操作）とは
 * 分けてあり、チャンネルの発言も同じ本文の見せ方を使う。
 */
export const NoteContent: Component<{
  event: NostrEvent;
  size: EventSize;
  expandMedia?: boolean;
  /**
   * 長い本文の扱い。既定は重ねたカラムで開く。チャンネルの発言はスレッドを持たず、
   * 開き先が無いので、呼ぶ側が `expand` を選ぶ。
   */
  longBody?: LongBody;
  /** 本文の下に足すもの。 */
  media?: JSX.Element;
}> = (props) => {
  const layout = createMemo(() =>
    layoutNote(props.event, { quotes: props.size === "normal" }),
  );
  const [viewing, setViewing] = createSignal<number>();
  const dispatch = useDispatch();
  return (
    <ContentWarningGate event={props.event} size={props.size}>
      <Show when={layout().text.length > 0}>
        <CollapsibleBody
          size={props.size}
          longBody={props.longBody ?? "open"}
          onOpen={() =>
            dispatch({
              type: "stack/open",
              column: columnForEvent(props.event),
              from: props.event.id,
            })
          }
        >
          <NoteText
            tokens={layout().text}
            class="c-primary"
            classList={{
              "text-body": props.size === "normal",
              "text-[14px]": props.size === "compact",
            }}
          />
        </CollapsibleBody>
      </Show>
      <For each={layout().media}>
        {(item, index) => (
          <Show
            when={props.expandMedia !== false}
            fallback={
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                class="break-all text-caption text-link"
              >
                {item.url}
              </a>
            }
          >
            <NoteMediaView
              media={item}
              size={props.size}
              onOpen={() => setViewing(index())}
            />
          </Show>
        )}
      </For>
      <For each={layout().audio}>
        {(url) => (
          <Show
            when={props.expandMedia !== false}
            fallback={
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                class="break-all text-caption text-link"
              >
                {url}
              </a>
            }
          >
            <NoteAudio url={url} />
          </Show>
        )}
      </For>
      {/* 添付の無い投稿にまでダイアログの状態を持たせない。 */}
      <Show when={props.expandMedia !== false && viewing() !== undefined}>
        <MediaViewer
          media={layout().media}
          index={viewing()}
          onIndexChange={setViewing}
          onClose={() => setViewing(undefined)}
          origin={
            // チャンネルの発言はチャンネルの中で読むもので、1 件だけを開く先が無い。
            props.event.kind === CHANNEL_MESSAGE_KIND
              ? undefined
              : () => props.event
          }
        />
      </Show>
      {props.media}
      <LinkCards urls={layout().links} size={props.size} />
      <For each={layout().quotes}>{(quote) => <Quote quote={quote} />}</For>
    </ContentWarningGate>
  );
};
