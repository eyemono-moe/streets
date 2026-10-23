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
  Match,
  type ParentComponent,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { t } from "../i18n/locale";
import { lazyPart } from "../lazy-part";
import { useDispatch } from "../ui-events";
import ContentWarningGate from "./ContentWarningGate";
import { EventRefView, type EventSize } from "./Event";
import LinkCards from "./LinkCards";
import NoteMediaView, { NoteAudio } from "./NoteMedia";
import NoteText from "./NoteText";
import QuoteBox from "./QuoteBox";

const MediaViewer = lazyPart(() => import("./MediaViewer"));

/**
 * 畳んだときの高さと、畳むのに要る隠れる分。画像は 1 枚で最大 320px（compact は 240px）あり、
 * 隠れる分を見ずに畳むと、短い本文に画像が 1 枚付いただけの投稿まで畳まれる。
 */
const FOLD: Record<EventSize, { height: number; slack: number }> = {
  normal: { height: 480, slack: 160 },
  compact: { height: 280, slack: 120 },
};

const MediaUrl: Component<{ url: string }> = (props) => (
  <a
    href={props.url}
    target="_blank"
    rel="noopener noreferrer"
    class="break-all text-caption text-link"
  >
    {props.url}
  </a>
);

const Quote: Component<{ quote: EventRef }> = (props) => (
  <QuoteBox>
    <EventRefView target={props.quote} size="compact" gateMuted />
  </QuoteBox>
);

/**
 * 長い本文の扱い。`open` は押すと投稿を重ねたカラムで開く（一覧の既定）、`expand` は
 * その場で広げる、`full` は畳まない。
 */
export type LongBody = "open" | "expand" | "full";

/**
 * 実際の描画高が大きい本文だけを畳む。監視は全ノートで1つを共有する。高さを測るのは
 * 畳む箱ではなく中身で、畳んだ箱は切った高さしか返さず、どれだけ隠れているか分からない。
 */
const CollapsibleBody: ParentComponent<{
  size: EventSize;
  longBody: LongBody;
  onOpen: () => void;
}> = (props) => {
  const [body, setBody] = createSignal<HTMLDivElement>();
  const [height, setHeight] = createSignal(0);
  const [expanded, setExpanded] = createSignal(false);
  const fold = () => FOLD[props.size];
  const overflows = () => height() > fold().height + fold().slack;
  const folded = () => props.longBody !== "full" && !expanded() && overflows();

  createEffect(() => {
    const element = body();
    if (element) onCleanup(observeHeight(element, setHeight));
  });

  return (
    <div class="relative">
      <div
        class="overflow-hidden"
        style={{
          "max-height": folded() ? `${fold().height}px` : "none",
        }}
      >
        <div
          ref={setBody}
          class="flex flex-col"
          classList={{
            "gap-2": props.size === "normal",
            "gap-1.5": props.size === "compact",
          }}
        >
          {props.children}
        </div>
      </div>
      <Show when={folded()}>
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
              {props.longBody === "open"
                ? t("note.content.readMore")
                : t("note.content.showMore")}
            </span>
          </span>
        </button>
      </Show>
    </div>
  );
};

/**
 * 本文と、その中に書かれた位置の画像・音声・引用、末尾のリンクのカード。投稿の枠（アイコン・名前・操作）とは
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
      <Show when={layout().blocks.length > 0}>
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
          <For each={layout().blocks}>
            {(block) => (
              <Switch>
                <Match when={block.type === "text" && block}>
                  {(text) => (
                    <NoteText
                      tokens={text().tokens}
                      class="c-primary"
                      classList={{
                        "text-body": props.size === "normal",
                        "text-[14px]": props.size === "compact",
                      }}
                    />
                  )}
                </Match>
                <Match when={block.type === "media" && block}>
                  {(item) => (
                    <Show
                      when={props.expandMedia !== false}
                      fallback={
                        <MediaUrl url={layout().media[item().index].url} />
                      }
                    >
                      <NoteMediaView
                        media={layout().media[item().index]}
                        size={props.size}
                        onOpen={() => setViewing(item().index)}
                      />
                    </Show>
                  )}
                </Match>
                <Match when={block.type === "audio" && block}>
                  {(audio) => (
                    <Show
                      when={props.expandMedia !== false}
                      fallback={<MediaUrl url={audio().url} />}
                    >
                      <NoteAudio url={audio().url} />
                    </Show>
                  )}
                </Match>
                <Match when={block.type === "quote" && block}>
                  {(quote) => <Quote quote={quote().quote} />}
                </Match>
              </Switch>
            )}
          </For>
        </CollapsibleBody>
      </Show>
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
    </ContentWarningGate>
  );
};
