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
import { EventRefView, type EventSize } from "./Event";
import { Frame, Notice } from "./EventFrame";
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
    <Show
      when={props.quote.form === "id" && props.quote}
      fallback={
        <Frame size="compact">
          <Notice>未対応の参照です</Notice>
        </Frame>
      }
    >
      {(ref) => <EventRefView target={ref()} size="compact" />}
    </Show>
  </div>
);

/** 実際の描画高が大きい本文だけを畳む。監視は全ノートで1つを共有する。 */
const CollapsibleBody: ParentComponent<{ size: EventSize }> = (props) => {
  const [body, setBody] = createSignal<HTMLDivElement>();
  const [height, setHeight] = createSignal(0);
  const [expanded, setExpanded] = createSignal(false);
  const maxHeight = () => MAX_CONTENT_HEIGHT[props.size];
  const overflows = () => height() >= maxHeight();

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
          "max-height": expanded() ? "none" : `${maxHeight()}px`,
        }}
      >
        {props.children}
      </div>
      <Show when={overflows() && !expanded()}>
        <button
          type="button"
          class="absolute bottom-0 flex w-full cursor-s-resize appearance-none justify-center bg-gradient-to-b bg-transparent from-white/0 to-white pt-4 text-caption dark:from-ui-950/0 dark:to-ui-950"
          onClick={() => setExpanded(true)}
        >
          <span class="flex items-center gap-1 rounded bg-tertiary px-2 py-0.5">
            <span
              class="i-material-symbols:expand-more-rounded h-1.25lh w-auto"
              aria-hidden="true"
            />
            <span>さらに表示</span>
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
  /** 本文の下に足すもの。 */
  media?: JSX.Element;
}> = (props) => {
  const layout = createMemo(() =>
    layoutNote(props.event, { quotes: props.size === "normal" }),
  );
  const [viewing, setViewing] = createSignal<number>();
  return (
    <>
      <Show when={layout().text.length > 0}>
        <CollapsibleBody size={props.size}>
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
        />
      </Show>
      {props.media}
      <LinkCards urls={layout().links} size={props.size} />
      <For each={layout().quotes}>{(quote) => <Quote quote={quote} />}</For>
    </>
  );
};
