import { type Component, For } from "solid-js";

/**
 * 14 セグメントの 1 桁の線。数字は外周と中央の横線（7 セグメント）だけを使い、
 * 月の文字は斜めと縦の中央も使う。座標は 10×18 の枠。
 */
const SEGMENTS = {
  a: [2.5, 1.5, 7.5, 1.5],
  b: [8.5, 2.5, 8.5, 8],
  c: [8.5, 10, 8.5, 15.5],
  d: [2.5, 16.5, 7.5, 16.5],
  e: [1.5, 10, 1.5, 15.5],
  f: [1.5, 2.5, 1.5, 8],
  g1: [2.5, 9, 4.6, 9],
  g2: [5.4, 9, 7.5, 9],
  h: [2.6, 2.8, 4.5, 7.8],
  i: [5, 2.5, 5, 8],
  j: [7.4, 2.8, 5.5, 7.8],
  k: [4.5, 10.2, 2.6, 15.2],
  l: [5, 10, 5, 15.5],
  m: [5.5, 10.2, 7.4, 15.2],
} as const;

type Segment = keyof typeof SEGMENTS;

const ALL = Object.keys(SEGMENTS) as Segment[];

const g = ["g1", "g2"] as const;

/** 表示できる文字。英語の月の略称に出る文字と、数字と、消えた桁（`-`）だけ。 */
const GLYPHS: Record<string, readonly Segment[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", ...g, "e", "d"],
  "3": ["a", "b", ...g, "c", "d"],
  "4": ["f", ...g, "b", "c"],
  "5": ["a", "f", ...g, "c", "d"],
  "6": ["a", "f", ...g, "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", ...g],
  "9": ["a", "b", "c", "d", "f", ...g],
  "-": [...g],
  A: ["a", "b", "c", "e", "f", ...g],
  B: ["a", "b", "c", "d", "g2", "i", "l"],
  C: ["a", "d", "e", "f"],
  D: ["a", "b", "c", "d", "i", "l"],
  E: ["a", "d", "e", "f", "g1"],
  F: ["a", "e", "f", "g1"],
  G: ["a", "c", "d", "e", "f", "g2"],
  J: ["b", "c", "d", "e"],
  L: ["d", "e", "f"],
  M: ["b", "c", "e", "f", "h", "j"],
  N: ["b", "c", "e", "f", "h", "m"],
  O: ["a", "b", "c", "d", "e", "f"],
  P: ["a", "b", "e", "f", ...g],
  R: ["a", "b", "e", "f", ...g, "m"],
  S: ["a", "c", "d", "f", ...g],
  T: ["a", "i", "l"],
  U: ["b", "c", "d", "e", "f"],
  V: ["e", "f", "k", "j"],
  Y: ["h", "j", "l"],
};

/**
 * 光る線で文字を並べる。消えている線もうっすら描く（実物の表示器と同じく、
 * 桁の形が見えている）。色は `currentColor`。
 */
const SegmentDisplay: Component<{ text: string }> = (props) => (
  <span class="inline-flex gap-[0.15em]">
    <For each={props.text.split("")}>
      {(char) => {
        const lit = new Set(GLYPHS[char] ?? []);
        return (
          <svg
            viewBox="0 0 10 18"
            class="h-[1em] w-[0.56em] overflow-visible"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
          >
            {/* 実物の表示器のように少し傾ける。 */}
            <g transform="skewX(-6) translate(1 0)">
              <For each={ALL}>
                {(segment) => {
                  const [x1, y1, x2, y2] = SEGMENTS[segment];
                  return (
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      opacity={lit.has(segment) ? 1 : 0.08}
                    />
                  );
                }}
              </For>
            </g>
          </svg>
        );
      }}
    </For>
  </span>
);

export default SegmentDisplay;
