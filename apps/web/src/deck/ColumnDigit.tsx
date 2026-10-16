import type { Component } from "solid-js";

/** カラムのアイコンの右下に添える、数字キーの番号。読み上げはボタンの名前に任せる。 */
const ColumnDigit: Component<{ digit: number; class?: string }> = (props) => (
  <span
    class={`absolute font-600 text-[10px] leading-none ${props.class ?? ""}`}
    aria-hidden="true"
  >
    {props.digit}
  </span>
);

export default ColumnDigit;
