import { type Component, type JSX, type ParentComponent } from "solid-js";
import type { EventSize } from "./Event";

export const Notice: Component<{ children: JSX.Element }> = (props) => (
  <p class="c-secondary text-caption">{props.children}</p>
);

export const Frame: ParentComponent<{
  size: EventSize;
  onOpen?: (event: MouseEvent) => void;
  onDown?: (event: MouseEvent) => void;
}> = (props) => (
  // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- キーボードでスレッドを開く経路はまだ無い（押せるのはポインタだけ）
  <article
    class="flex flex-col bg-primary"
    classList={{
      "cursor-pointer": props.onOpen !== undefined,
    }}
    onMouseDown={(event) => props.onDown?.(event)}
    onClick={(event) => {
      // 押された場所に一番近い投稿が自分のときだけ開く。引用の中を押したら
      // 引用元が起点になる。Solid は click を委譲するので stopPropagation では止まらない。
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("article") !== event.currentTarget
      ) {
        return;
      }
      props.onOpen?.(event);
    }}
  >
    {/*
      画面の外を飛ばすのは中身だけ。`article` そのものに当てると、下線が端数の
      位置で丸められて消えることがある（区切りが 2、3 本に 1 本抜ける）。
    */}
    <div
      class="offscreen-skip flex flex-col"
      classList={{
        "gap-2 p-3": props.size === "normal",
        "gap-1.5 p-2": props.size === "compact",
      }}
    >
      {props.children}
    </div>
  </article>
);
