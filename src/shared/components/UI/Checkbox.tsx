import { Checkbox as KCheckbox } from "@kobalte/core";
import { type JSX, splitProps } from "solid-js";

type CheckboxProps = {
  name: string;
  label?: string;
  checked: boolean | undefined;
  error: string;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  ref: (element: HTMLInputElement) => void;
  onInput: JSX.EventHandler<HTMLInputElement, InputEvent>;
  onChange: JSX.EventHandler<HTMLInputElement, Event>;
  onBlur: JSX.EventHandler<HTMLInputElement, FocusEvent>;
};

export function Checkbox(props: CheckboxProps) {
  const [rootProps, inputProps] = splitProps(
    props,
    ["name", "checked", "required", "disabled"],
    ["ref", "onInput", "onChange", "onBlur"],
  );

  return (
    <KCheckbox.Root
      {...rootProps}
      class="group inline-flex items-center"
      validationState={props.error ? "invalid" : "valid"}
    >
      <KCheckbox.Input {...inputProps} />
      <KCheckbox.Label class="p-1 group-not-disabled:cursor-pointer">
        <KCheckbox.Control class="rounded outline-purple-6/50 group-has-focus-visible:outline">
          <KCheckbox.Indicator forceMount class="parent">
            <div class="parent-data-[checked]:i-material-symbols:check-box-rounded parent-data-[checked]:c-purple-6 c-zinc-5 i-material-symbols:check-box-outline-blank aspect-square h-1lh parent-data-[checked]:h-1lh parent-data-[checked]:w-auto w-auto" />
          </KCheckbox.Indicator>
        </KCheckbox.Control>
        {props.label}
      </KCheckbox.Label>
    </KCheckbox.Root>
  );
}
