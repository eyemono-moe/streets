import {
  type ParentComponent,
  Show,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

/** 流れる速さ（px/秒）。読みながら目で追える遅さにする。 */
const SPEED = 30;
/** 流したときの、文と次の文の間（pr-8）。 */
const GAP = 32;

/**
 * 1 行に収める。収まらないときだけ、左へゆっくり流し、両端を薄く消す。
 * 触れている間とフォーカスがある間は止める（中のリンクを押せるように）。
 * 動きを減らす設定では流さず、末尾を … で切る。
 */
const Marquee: ParentComponent<{ class?: string }> = (props) => {
  let box: HTMLDivElement | undefined;
  let first: HTMLSpanElement | undefined;
  // 流すときの 1 周の幅（文と、次の文までの間）。収まるなら undefined。
  const [loop, setLoop] = createSignal<number>();

  onMount(() => {
    if (!box || !first) return;
    const measure = () => {
      if (!box || !first) return;
      const width = first.offsetWidth;
      // 間を含めた幅で比べると、ちょうど収まる文まで流してしまう。
      setLoop(width - GAP > box.clientWidth ? width : undefined);
    };
    // カスタム絵文字の画像が後から読み込まれて幅が変わるので、中身も見張る。
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(first);
    onCleanup(() => observer.disconnect());
  });

  const copyClass =
    "shrink-0 whitespace-nowrap pr-8 motion-reduce:min-w-0 motion-reduce:shrink motion-reduce:truncate motion-reduce:pr-0";

  return (
    <div
      ref={box}
      class={`group min-w-0 overflow-hidden ${props.class ?? ""}`}
      classList={{
        "[mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)] motion-reduce:[mask-image:none]":
          loop() !== undefined,
      }}
    >
      <div
        class="flex w-max motion-reduce:w-full group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]"
        classList={{ "animate-marquee": loop() !== undefined }}
        style={
          loop() === undefined
            ? undefined
            : { "animation-duration": `${(loop() ?? 0) / SPEED}s` }
        }
      >
        <span ref={first} class={copyClass}>
          {props.children}
        </span>
        <Show when={loop() !== undefined}>
          <span aria-hidden="true" class={`${copyClass} motion-reduce:hidden`}>
            {props.children}
          </span>
        </Show>
      </div>
    </div>
  );
};

export default Marquee;
