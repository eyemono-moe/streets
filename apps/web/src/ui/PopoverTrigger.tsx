import { Popover, type PopoverTriggerProps } from "@ark-ui/solid/popover";
import type { Component } from "solid-js";

/**
 * `Popover.Trigger` の代わりに使う。Ark UI の Trigger は開いている間
 * `aria-controls="false"` を出す。ダイアログのフォーカストラップは aria-controls で
 * body の末尾に出たポップオーバーを自分の一部と見なすので、正しい値が無いと
 * ポップオーバーの中の入力欄へ移ったフォーカスを奪い返してしまう。
 */
const PopoverTrigger: Component<PopoverTriggerProps> = (props) => (
  <Popover.Context>
    {(api) => (
      <Popover.Trigger
        {...props}
        aria-controls={
          api().open ? api().getTriggerProps()["aria-controls"] : undefined
        }
      />
    )}
  </Popover.Context>
);

export default PopoverTrigger;
