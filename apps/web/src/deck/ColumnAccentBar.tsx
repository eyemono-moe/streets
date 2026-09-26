import type { Component } from "solid-js";

/**
 * カラムの上端の色の帯。一時カラム（デッキに保存していないカラム）は破線にして、
 * 残したカラムと見分けられるようにする。
 */
const ColumnAccentBar: Component<{ temporary?: boolean }> = (props) => (
  <div
    class="c-accent-5 h-0.75 shrink-0"
    style={{
      background: props.temporary
        ? "repeating-linear-gradient(90deg, currentColor 0 8px, transparent 8px 14px)"
        : "currentColor",
    }}
  />
);

export default ColumnAccentBar;
