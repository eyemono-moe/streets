import { type Component, For, Show } from "solid-js";

export type RingSegment = "pending" | "done" | "failed";

const SIZE = 18;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 区切りの隙間。1 つしかないときは隙間を作らない。 */
const GAP = 2.5;

const COLOR: Record<RingSegment, string> = {
  pending: "stroke-ui-2 dark:stroke-ui-7",
  // 接続の様子の点と同じ緑・赤。成功・失敗はテーマ色にしない。
  done: "stroke-[#188038]",
  failed: "stroke-[#C5221F] dark:stroke-[#F28B82]",
};

/**
 * 複数の相手へ送ったものの進み具合。1 つの相手を 1 区画にして輪を分け、
 * 結果が出たところから色を付ける。`segments` が無い間（まだ送り先が決まって
 * いない）は回り続ける。
 */
const ProgressRing: Component<{ segments?: readonly RingSegment[] }> = (
  props,
) => (
  <svg
    width={SIZE}
    height={SIZE}
    viewBox={`0 0 ${SIZE} ${SIZE}`}
    class="-rotate-90 shrink-0"
    aria-hidden="true"
  >
    <Show
      when={props.segments && props.segments.length > 0 && props.segments}
      fallback={
        <>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke-width={STROKE}
            class={COLOR.pending}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke-width={STROKE}
            stroke-linecap="round"
            stroke-dasharray={`${CIRCUMFERENCE / 4} ${CIRCUMFERENCE}`}
            class="animate-spin stroke-accent-5 [transform-origin:center]"
          />
        </>
      }
    >
      {(segments) => {
        const length = () => CIRCUMFERENCE / segments().length;
        // 区画が多いほど隙間を詰める。同じ幅のままだと、隙間ばかりの破線に見える。
        const gap = () =>
          segments().length > 1 ? Math.min(GAP, length() * 0.25) : 0;
        return (
          <For each={segments()}>
            {(segment, index) => (
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke-width={STROKE}
                stroke-dasharray={`${length() - gap()} ${CIRCUMFERENCE}`}
                stroke-dashoffset={-index() * length()}
                class={`transition-colors duration-150 ${COLOR[segment]}`}
              />
            )}
          </For>
        );
      }}
    </Show>
  </svg>
);

export default ProgressRing;
