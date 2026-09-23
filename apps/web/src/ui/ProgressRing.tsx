import { type Component, Show } from "solid-js";

export type RingCounts = { done: number; failed: number; pending: number };

const SIZE = 18;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 済んだ弧と失敗した弧の間に空ける隙間（丸めた端の分とは別）。 */
const GAP = 1.5;

type Arc = { length: number; offset: number; visible: boolean };

/**
 * 割合 `[from, to)`（0〜1）を、丸めた端が収まるように縮めた弧にする。
 * 丸めた端は線の太さの半分ずつ外へ伸びるので、その分と隙間を引いておく。
 * 輪を一周するときは縮めない（端が無い）。
 */
const arc = (from: number, to: number, gapped: boolean): Arc => {
  const span = (to - from) * CIRCUMFERENCE;
  if (span <= 0)
    return { length: 0, offset: -from * CIRCUMFERENCE, visible: false };
  if (to - from >= 1)
    return { length: CIRCUMFERENCE, offset: 0, visible: true };
  const trim = STROKE + (gapped ? GAP : 0);
  return {
    // 0 にすると丸めた端も消えるので、ごく小さい値にして点として残す。
    length: Math.max(span - trim, 0.01),
    offset: -(from * CIRCUMFERENCE + trim / 2),
    visible: true,
  };
};

const ArcCircle: Component<{ arc: Arc; class: string }> = (props) => (
  <circle
    cx={SIZE / 2}
    cy={SIZE / 2}
    r={RADIUS}
    fill="none"
    stroke-width={STROKE}
    stroke-linecap="round"
    // 割合が変わったとき、弧が伸び縮みして見えるように属性ではなく style で渡す。
    style={{
      "stroke-dasharray": `${props.arc.length} ${CIRCUMFERENCE}`,
      "stroke-dashoffset": `${props.arc.offset}`,
      opacity: props.arc.visible ? 1 : 0,
    }}
    class={`transition-[stroke-dasharray,stroke-dashoffset,opacity] duration-[180ms] ease-out ${props.class}`}
  />
);

/**
 * いくつもの相手へ送ったものの進み具合。済んだ（緑）・失敗した（赤）・待っている
 * （下地）の割合で塗り、相手の数が増えても区画は増やさない。`counts` が無い間
 * （送り先が決まる前）と、まだ何も結果が出ていない間は回り続ける。
 */
const ProgressRing: Component<{ counts?: RingCounts }> = (props) => {
  const total = () =>
    props.counts
      ? props.counts.done + props.counts.failed + props.counts.pending
      : 0;
  const settled = () =>
    props.counts ? props.counts.done + props.counts.failed : 0;
  const doneShare = () => (total() ? (props.counts?.done ?? 0) / total() : 0);
  const failedShare = () =>
    total() ? (props.counts?.failed ?? 0) / total() : 0;
  const both = () => doneShare() > 0 && failedShare() > 0;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      class="-rotate-90 shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke-width={STROKE}
        class="stroke-ui-2 dark:stroke-ui-7"
      />
      {/* 弧は常に置いておく。最初の結果が届いたとき、0 から伸びて見える。 */}
      <ArcCircle arc={arc(0, doneShare(), both())} class="stroke-status-ok" />
      <ArcCircle
        arc={arc(doneShare(), doneShare() + failedShare(), both())}
        class="stroke-danger"
      />
      <Show when={settled() === 0}>
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
      </Show>
    </svg>
  );
};

export default ProgressRing;
