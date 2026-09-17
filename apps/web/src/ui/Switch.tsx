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
    class="flex min-h-8 w-full cursor-pointer items-center gap-2 text-body"
    checked={props.checked}
    onCheckedChange={(details) => props.onChange(details.checked)}
  >
    <ArkSwitch.Label class="flex min-w-0 flex-1 items-center gap-1.5">
      <span class="min-w-0 truncate">{props.label}</span>
      {props.aside}
    </ArkSwitch.Label>
    <ArkSwitch.Control class="flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors data-[state=checked]:bg-accent-primary data-[state=unchecked]:bg-tertiary">
      <ArkSwitch.Thumb class="size-4 rounded-full bg-primary transition-transform data-[state=checked]:translate-x-4" />
    </ArkSwitch.Control>
    <ArkSwitch.HiddenInput />
  </ArkSwitch.Root>
);

export default Switch;
