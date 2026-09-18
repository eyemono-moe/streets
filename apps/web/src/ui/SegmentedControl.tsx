import { SegmentGroup } from "@ark-ui/solid/segment-group";
import { For } from "solid-js";

/**
 * 排他の選択。ラジオグループなので、矢印キーでも選べる。
 * - `primary`：選んだものをアクセントの色で塗る（表示密度・幅など、選んだ結果が目に見えるもの）
 * - `secondary`：選んだものを白く浮かせる（公開範囲など、既定から変えることが少ないもの）
 */
const SegmentedControl = <T extends string>(props: {
  /** 読み上げ用の名前。見出しは外に置く。 */
  label: string;
  options: readonly {
    value: T;
    label: string;
    /** 今は選べない。 */
    disabled?: boolean;
    /** 選べない理由。ポインタを載せると出る。 */
    hint?: string;
  }[];
  value: T;
  onChange: (value: T) => void;
  variant?: "primary" | "secondary";
  /** 横幅いっぱいに広げ、項目を等分にする。 */
  block?: boolean;
}) => {
  const primary = () => props.variant !== "secondary";
  return (
    <SegmentGroup.Root
      // 既定は縦。横に並べるので、矢印キーの向きも合わせる。
      orientation="horizontal"
      class="flex gap-0.5 rounded-2 p-0.5"
      classList={{
        "w-full": props.block,
        "w-fit": !props.block,
        "border border-primary bg-primary": primary(),
        "bg-secondary": !primary(),
      }}
      value={props.value}
      onValueChange={(details) => {
        if (details.value) props.onChange(details.value as T);
      }}
    >
      <SegmentGroup.Label class="sr-only">{props.label}</SegmentGroup.Label>
      <For each={props.options}>
        {(option) => (
          <SegmentGroup.Item
            value={option.value}
            disabled={option.disabled}
            title={option.disabled ? option.hint : undefined}
            // 選んだ／選んでいないの色は、どちらも data-state で当てる。片方を固定の class に
            // すると、ダークモードの `.dark` 付きの規則に負けて選んだ色が消える。
            class="flex h-7.5 cursor-pointer items-center justify-center whitespace-nowrap rounded-1.5 px-3 text-caption transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
            classList={{
              "flex-1": props.block,
              "data-[state=checked]:bg-accent-primary data-[state=checked]:c-white data-[state=unchecked]:c-secondary":
                primary(),
              "data-[state=checked]:bg-primary data-[state=checked]:c-primary data-[state=checked]:font-600 data-[state=checked]:shadow-sm data-[state=unchecked]:c-secondary":
                !primary(),
            }}
          >
            <SegmentGroup.ItemText>{option.label}</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  );
};

export default SegmentedControl;
