import { Switch as ArkSwitch } from "@ark-ui/solid/switch";
import type { Component, JSX } from "solid-js";

/**
 * 1 行のスイッチ。色は data-state で切り替える —— bg-tertiary を固定で置くと、
 * ダークモードの `.dark .bg-tertiary` が checked の色を打ち消す。
 */
const Switch: Component<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 名前の横に置くもの（保存先のヒントなど）。 */
  aside?: JSX.Element;
}> = (props) => (
  <ArkSwitch.Root
    class="flex min-h-8 w-full cursor-pointer items-start gap-2 py-1.5 text-body"
    checked={props.checked}
    onCheckedChange={(details) => props.onChange(details.checked)}
  >
    {/* 項目名は切らずに折り返す。切れると、何を切り替えるのか分からなくなる。 */}
    <ArkSwitch.Label class="flex min-w-0 flex-1 items-start gap-1.5">
      <span class="break-anywhere min-w-0">{props.label}</span>
      {props.aside}
    </ArkSwitch.Label>
    {/* 名前が折り返しても、つまみは 1 行目の高さにそろえる。 */}
    <ArkSwitch.Control class="mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors data-[state=checked]:bg-accent-primary data-[state=unchecked]:bg-tertiary">
      <ArkSwitch.Thumb class="size-4 rounded-full bg-primary transition-transform data-[state=checked]:translate-x-4" />
    </ArkSwitch.Control>
    <ArkSwitch.HiddenInput />
  </ArkSwitch.Root>
);

export default Switch;
