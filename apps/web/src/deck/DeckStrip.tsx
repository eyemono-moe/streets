import { ScrollArea } from "@ark-ui/solid";
import type { JSX } from "solid-js";

/**
 * カラムを横に並べて送る帯。カラムの間の 1px は背景色で見せる。
 * カラムは CSS の order で並べるので、子は帯の中で兄弟として置く。
 */
const DeckStrip = (props: {
  /** 横に送る箱。並べ替えで測る位置の基準と、端で送る先にもなる。 */
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
  class?: string;
  onPointerDown?: (event: PointerEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  children: JSX.Element;
}) => (
  <ScrollArea.Root class={`relative ${props.class ?? ""}`}>
    {/* OS のスクロールバーは溝の分だけ帯の背景色がカラムの下に覗くので、
        消して細いつまみをカラムの上に重ねる。 */}
    {/* 見えている幅を、中の余白（DeckEndSpace）が cqw で読めるようにする。 */}
    <ScrollArea.Viewport
      ref={props.ref}
      class="scrollbar-none h-full bg-tertiary [container-type:inline-size]"
      onPointerDown={(event) => props.onPointerDown?.(event)}
      onKeyDown={(event) => props.onKeyDown?.(event)}
    >
      <ScrollArea.Content class="relative flex h-full w-max min-w-full">
        {props.children}
      </ScrollArea.Content>
    </ScrollArea.Viewport>
    <ScrollArea.Scrollbar
      orientation="horizontal"
      class="absolute inset-x-0 bottom-0 z-1 flex h-2 touch-none select-none p-0.5 opacity-0 transition-opacity data-[dragging]:opacity-100 data-[hover]:opacity-100 data-[scrolling]:opacity-100"
    >
      <ScrollArea.Thumb class="rounded-full bg-[var(--color-scrollbar-thumb)]" />
    </ScrollArea.Scrollbar>
  </ScrollArea.Root>
);

export default DeckStrip;
