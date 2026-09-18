import type { Component } from "solid-js";

/**
 * 押すたびに入り切りする小さなボタン。一覧の行の中で、その行の性質を切り替えるのに使う
 * （リレーを読み込みに使うか、など）。ラベルは短く、入っているときだけアクセントの色にする。
 */
const ToggleChip: Component<{
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  disabled?: boolean;
  /** 押せない理由。ポインタを載せると出る。 */
  disabledReason?: string;
}> = (props) => (
  <button
    type="button"
    aria-pressed={props.pressed}
    disabled={props.disabled}
    title={props.disabled ? props.disabledReason : undefined}
    class="h-6.5 shrink-0 whitespace-nowrap rounded-full px-3 font-600 text-caption transition-colors enabled:cursor-pointer disabled:cursor-not-allowed"
    classList={{
      "bg-accent-primary c-white enabled:hover:bg-accent-hover": props.pressed,
      "bg-secondary c-secondary enabled:hover:bg-tertiary": !props.pressed,
      "opacity-60": props.disabled,
    }}
    onClick={() => props.onChange(!props.pressed)}
  >
    {props.label}
  </button>
);

export default ToggleChip;
