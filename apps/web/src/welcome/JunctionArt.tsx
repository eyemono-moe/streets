import type { Component } from "solid-js";

/** 45° の道。ロゴの道と同じ向きにする。 */
const ROADS = [
  { x1: -120, y1: 260, x2: 260, y2: -120, width: 54 },
  { x1: 80, y1: 340, x2: 460, y2: -40, width: 54 },
  { x1: 300, y1: 300, x2: 640, y2: -40, width: 42 },
  { x1: -80, y1: -60, x2: 560, y2: 580, width: 46 },
];

/** ロゴの「S」をなぞるランプ。 */
const RAMP = "M196 -20 C 262 40, 262 96, 210 132 S 158 220, 226 290";

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
