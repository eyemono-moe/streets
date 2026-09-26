import type { Component } from "solid-js";

/** 端を丸めた 8px の棒と 6px の隙間。mask で抜くので、色は背景の色がそのまま出る。 */
const DASH = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="3"><rect width="8" height="3" rx="1.5"/></svg>',
)}")`;

/**
 * カラムの上端の色の帯。一時カラム（デッキに保存していないカラム）は破線にして、
 * 残したカラムと見分けられるようにする。
 */
const ColumnAccentBar: Component<{ temporary?: boolean }> = (props) => (
  <div
    class="h-0.75 shrink-0 bg-accent-primary"
    style={
      props.temporary
        ? {
            "mask-image": DASH,
            "mask-repeat": "repeat-x",
            "mask-size": "14px 3px",
          }
        : undefined
    }
  />
);

export default ColumnAccentBar;
