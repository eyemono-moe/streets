import { Slider as ArkSlider } from "@ark-ui/solid/slider";
import type { Component } from "solid-js";

/**
 * 連続した値を選ぶ。矢印・Home・End キーでも動かせる。
 * `onChange` は動かしている間、`onChangeEnd` は離したときに呼ぶ —— 保存のように重い処理は後者に置く。
 */
const Slider: Component<{
  /** 項目名。折り返して、切らない。 */
  label: string;
  /** 見出しが外にあるとき、読み上げだけに使う。 */
  labelHidden?: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  /** 今の値を人に分かる形にする。 */
  format?: (value: number) => string;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  disabled?: boolean;
}> = (props) => {
  const format = (value: number) => props.format?.(value) ?? String(value);
  return (
    <ArkSlider.Root
      class="flex w-full flex-col gap-1 data-[disabled]:opacity-40"
      value={[props.value]}
      min={props.min}
      max={props.max}
      step={props.step}
      disabled={props.disabled}
      getAriaValueText={(details) => format(details.value)}
      onValueChange={(details) => {
        const [value] = details.value;
        if (value !== undefined) props.onChange(value);
      }}
      onValueChangeEnd={(details) => {
        const [value] = details.value;
        if (value !== undefined) props.onChangeEnd?.(value);
      }}
    >
      <ArkSlider.Label
        class="break-anywhere c-secondary text-caption"
        classList={{ "sr-only": props.labelHidden }}
      >
        {props.label}
      </ArkSlider.Label>
      {/* つまみの大きさ分の高さを持たせ、溝の外側にも触れるようにする。 */}
      <div class="flex items-center gap-3">
        <ArkSlider.Control class="flex h-6 min-w-0 flex-1 touch-none select-none items-center data-[disabled]:cursor-not-allowed">
          <ArkSlider.Track class="h-1.5 flex-1 rounded-full bg-tertiary">
            <ArkSlider.Range class="h-full rounded-full bg-accent-primary" />
          </ArkSlider.Track>
          <ArkSlider.Thumb
            index={0}
            class="size-4 cursor-pointer rounded-full bg-accent-primary shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-5 data-[disabled]:cursor-not-allowed"
          >
            <ArkSlider.HiddenInput />
          </ArkSlider.Thumb>
        </ArkSlider.Control>
        <ArkSlider.ValueText class="w-12 shrink-0 text-right c-primary text-caption font-600 tabular-nums">
          {format(props.value)}
        </ArkSlider.ValueText>
      </div>
    </ArkSlider.Root>
  );
};

export default Slider;
