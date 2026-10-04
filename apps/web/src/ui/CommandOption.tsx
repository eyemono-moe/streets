import type { Component } from "solid-js";

/** キーボードで選ぶ検索結果。設定名は切らずに折り返す。 */
const CommandOption: Component<{
  id: string;
  title: string;
  category: string;
  icon: string;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}> = (props) => (
  <button
    id={props.id}
    type="button"
    role="option"
    aria-selected={props.selected}
    class={`c-primary flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2 px-3 py-2 text-left text-body outline-none focus-visible:ring-2 focus-visible:ring-accent-5 hover:bg-secondary ${props.selected ? "bg-secondary" : "bg-transparent"}`}
    onClick={props.onSelect}
    onMouseEnter={props.onHover}
  >
    <span
      class={`${props.icon} c-secondary size-5 shrink-0`}
      aria-hidden="true"
    />
    <span class="min-w-0 flex-1 break-words">{props.title}</span>
    <span class="c-secondary shrink-0 text-caption">{props.category}</span>
  </button>
);

export default CommandOption;
