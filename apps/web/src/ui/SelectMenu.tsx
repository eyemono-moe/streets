import { Menu } from "@ark-ui/solid/menu";
import { type Component, For } from "solid-js";
import Button from "./Button";
import { menuContentClass, menuIconClass, menuItemClass } from "./menu";
import { Portal } from "./Portal";

/**
 * 並びの長い選択肢から 1 つを選ぶ。押すとメニューが開き、いまの値に印を付ける。
 * 選択肢が 2〜4 個で幅に収まるなら `SegmentedControl` を使う。
 */
const SelectMenu: Component<{
  /** 読み上げの名前。見た目の名前は呼ぶ側が隣に置く。 */
  label: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
  /** 何も選んでいないときに出す文字。 */
  placeholder?: string;
  onChange: (value: string) => void;
}> = (props) => {
  const current = () =>
    props.options.find((option) => option.value === props.value)?.label ??
    props.placeholder ??
    "";
  return (
    <Menu.Root
      lazyMount
      unmountOnExit
      positioning={{ placement: "bottom-start" }}
      onSelect={(details) => props.onChange(details.value)}
    >
      <Menu.Trigger
        asChild={(trigger) => (
          <Button
            {...trigger()}
            variant="secondary"
            size="sm"
            trailingIcon="i-material-symbols:expand-more-rounded"
            aria-label={`${props.label}：${current()}`}
          >
            <span class="block max-w-48 truncate">{current()}</span>
          </Button>
        )}
      />
      <Portal>
        <Menu.Positioner>
          <Menu.Content class={`${menuContentClass} w-60`}>
            <For each={props.options}>
              {(option) => (
                <Menu.Item value={option.value} class={menuItemClass}>
                  <span
                    class={`${menuIconClass} ${
                      option.value === props.value
                        ? "i-material-symbols:check-rounded"
                        : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span class="truncate">{option.label}</span>
                </Menu.Item>
              )}
            </For>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

export default SelectMenu;
