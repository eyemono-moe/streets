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
        <KCheckbox.Control class="rounded outline-accent-5/50 group-has-focus-visible:outline">
          <KCheckbox.Indicator
            forceMount
            class="parent data-[checked]:c-accent-5 group-hover-not-disabled:data-[checked]:c-accent-6 children:aspect-square! children:h-1lh! children:w-auto!"
          >
            <div class="parent-data-[checked]:i-material-symbols:check-box-rounded i-material-symbols:check-box-outline-blank" />
          </KCheckbox.Indicator>
        </KCheckbox.Control>
        {props.label}
      </KCheckbox.Label>
    </KCheckbox.Root>
  );
}
