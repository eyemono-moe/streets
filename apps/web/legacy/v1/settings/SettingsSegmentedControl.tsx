import { ToggleGroup } from "@ark-ui/solid/toggle-group";
import { type Component, For } from "solid-js";

export type SettingsSegmentedOption = {
  value: string;
  label: string;
  testId?: string;
};

type SettingsSegmentedControlProps = {
  ariaLabel: string;
  options: readonly SettingsSegmentedOption[];
  value: readonly string[];
  disabled?: boolean;
  multiple?: boolean;
  block?: boolean;
  compact?: boolean;
  onValueChange(value: string[]): void;
};

/** Ark ToggleGroup の選択状態と設定画面の segmented 表現を揃える。 */
const SettingsSegmentedControl: Component<SettingsSegmentedControlProps> = (
  props,
) => (
  <ToggleGroup.Root
    aria-label={props.ariaLabel}
    class={
      props.block
        ? "grid overflow-hidden rounded-2 border border-primary"
        : "flex overflow-hidden rounded-2 border border-primary"
    }
    style={
      props.block
        ? {
            "grid-template-columns": `repeat(${props.options.length}, minmax(0, 1fr))`,
          }
        : undefined
    }
    disabled={props.disabled}
    multiple={props.multiple}
    value={[...props.value]}
    onValueChange={(details) => props.onValueChange(details.value)}
  >
    <For each={props.options}>
      {(option, index) => (
        <ToggleGroup.Item
          class={
            props.compact
              ? "c-primary h-8 appearance-none bg-transparent px-3 text-caption enabled:cursor-pointer enabled:hover:bg-alpha-hover data-[state=on]:bg-accent-primary data-[state=on]:text-white"
              : "c-primary h-9 appearance-none bg-transparent px-3 text-caption enabled:cursor-pointer enabled:hover:bg-alpha-hover data-[state=on]:bg-accent-primary data-[state=on]:text-white"
          }
          classList={{ "border-primary border-l": index() > 0 }}
          data-testid={option.testId}
          value={option.value}
        >
          {option.label}
        </ToggleGroup.Item>
      )}
    </For>
  </ToggleGroup.Root>
);

export default SettingsSegmentedControl;
