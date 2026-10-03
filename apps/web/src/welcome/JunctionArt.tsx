import type { Component } from "solid-js";

/** 45° の道。ロゴの道と同じ向きにする。 */
const ROADS = [
  { x1: 58, y1: -30, x2: 278, y2: 190, width: 54 },
  { x1: 246, y1: -59, x2: 466, y2: 161, width: 54 },
  { x1: 217, y1: -76, x2: -53, y2: 194, width: 42 },
];

/** ロゴの「S」をなぞるランプ。 */
const RAMP = "M175 -54L287 58C342 113 342.5 162.2 289.7 215";

/**
 * 紹介のカラムの頭に敷く、上から見たジャンクション。Streets の名前とロゴの道を
 * なぞる。ライトでもダークでも同じ夜の色にして、ロゴの紫を立たせる。
 */
const JunctionArt: Component<{ class?: string }> = (props) => (
  <svg
    class={props.class}
    viewBox="0 0 400 160"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <rect width="400" height="160" fill="#221650" />
    <g fill="none">
      {ROADS.map(({ width, ...ends }) => (
        <>
          <line {...ends} stroke="#2b1d60" stroke-width={width + 6} />
          <line {...ends} stroke="#33246f" stroke-width={width} />
          <line
            {...ends}
            stroke="#cdb6f0"
            stroke-width="1.5"
            stroke-dasharray="12 10"
          />
        </>
      ))}
      <path d={RAMP} stroke="#2b1d60" stroke-width="40" />
      <path d={RAMP} stroke="#33246f" stroke-width="34" />
      <path
        d={RAMP}
        stroke="#cdb6f0"
        stroke-width="1.5"
        stroke-dasharray="10 8"
      />
    </g>
  </svg>
);

export default JunctionArt;
