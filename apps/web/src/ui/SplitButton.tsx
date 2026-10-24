import { Menu } from "@ark-ui/solid/menu";
import { For, type JSX, Show } from "solid-js";
import {
  BUTTON_VARIANT,
  ButtonContents,
  type ButtonSize,
  buttonClassName,
} from "./Button";
import { menuContentClass, menuIconClass, menuItemClass } from "./menu";
import { Portal } from "./Portal";

export type SplitButtonOption<T extends string> = {
  value: T;
  label: string;
  /** 文字の前に置くアイコンの class（`i-material-symbols:…`）。 */
  icon: string;
  description?: string;
  disabled?: boolean;
  /** 選べない理由。押せない項目の説明の代わりに出す。 */
  hint?: string;
};

/**
 * 押すと主の操作をし、隣の ▾ から、その操作のやり方を 1 つ選び直せるボタン。
 * 選んだやり方は ▾ のメニューに印を付けるだけで、選んだだけでは何も起こさない。
 * 何をするかは主のボタンの文字とアイコンで伝える（呼ぶ側が選んだ値で変える）。
 */
const SplitButton = <T extends string>(props: {
  children: JSX.Element;
  icon?: string;
  size?: ButtonSize;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  /** ▾ の読み上げ名。 */
  menuLabel: string;
  options: readonly SplitButtonOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Storybook でメニューを開いた姿を並べるため。 */
  defaultOpen?: boolean;
}): JSX.Element => (
  <div class="inline-flex shrink-0 gap-px">
    <button
      type={props.type ?? "button"}
      class={buttonClassName(
        { variant: "primary", size: props.size },
        false,
        "start",
      )}
      disabled={props.disabled}
      onClick={() => props.onClick?.()}
    >
      <ButtonContents icon={props.icon} size={props.size}>
        {props.children}
      </ButtonContents>
    </button>
    <Menu.Root
      defaultOpen={props.defaultOpen}
      lazyMount
      unmountOnExit
      positioning={{ placement: "bottom-end" }}
    >
      <Menu.Trigger
        disabled={props.disabled}
        aria-label={props.menuLabel}
        title={props.menuLabel}
        // 主のボタンと同じ高さ・色で、文字の代わりに ▾ だけを置く。
        class={`inline-flex shrink-0 items-center justify-center rounded-r-full ${props.size === "sm" ? "h-7.5 w-7" : "h-8.5 w-8"} ${BUTTON_VARIANT.primary} enabled:cursor-pointer disabled:cursor-default disabled:opacity-50`}
      >
        <span
          class="i-material-symbols:expand-more-rounded size-4.5"
          aria-hidden="true"
        />
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content class={`${menuContentClass} w-max max-w-80`}>
            <Menu.RadioItemGroup
              value={props.value}
              onValueChange={(details) => props.onChange(details.value as T)}
            >
              <For each={props.options}>
                {(option) => (
                  <Menu.RadioItem
                    value={option.value}
                    disabled={option.disabled}
                    class={`${menuItemClass} items-start py-1.5`}
                  >
                    <span
                      class={`${option.icon} c-secondary mt-0.5 ${menuIconClass}`}
                      aria-hidden="true"
                    />
                    <span class="flex min-w-0 flex-1 flex-col">
                      <Menu.ItemText>{option.label}</Menu.ItemText>
                      <Show
                        when={
                          option.disabled ? option.hint : option.description
                        }
                      >
                        {(text) => (
                          <span class="c-secondary text-caption">{text()}</span>
                        )}
                      </Show>
                    </span>
                    <Menu.ItemIndicator class="mt-0.5">
                      <span
                        class={`i-material-symbols:check-rounded c-accent-5 ${menuIconClass}`}
                        aria-hidden="true"
                      />
                    </Menu.ItemIndicator>
                  </Menu.RadioItem>
                )}
              </For>
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  </div>
);

export default SplitButton;
