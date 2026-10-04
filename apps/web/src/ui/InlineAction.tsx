import type { Component } from "solid-js";

/** 説明文の中から画面操作を開く、文字だけのボタン。 */
const InlineAction: Component<{ label: string; onClick: () => void }> = (
  props,
) => (
  <button
    type="button"
    class="c-accent-5 inline cursor-pointer bg-transparent underline underline-offset-2 hover:c-accent-6 focus-visible:rounded-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-5"
    onClick={props.onClick}
  >
    {props.label}
  </button>
);

export default InlineAction;
