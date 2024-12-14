import { TextField as KTextField } from "@kobalte/core";
import { For, type JSX, Show, createUniqueId, splitProps } from "solid-js";
import HelpTooltip from "../HelpTooltip";

type Option = {
  value: string;
  label: string;
};

export type TextFieldProps = {
  name?: string;
  type?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  help?: string;
  error?: string;
  options?: Option[];
  multiline?: boolean;
  required?: boolean;
  disabled?: boolean;
  ref?: (element: HTMLInputElement | HTMLTextAreaElement) => void;
  onInput?: JSX.EventHandler<
    HTMLInputElement | HTMLTextAreaElement,
    InputEvent
  >;
  onChange?: JSX.EventHandler<HTMLInputElement | HTMLTextAreaElement, Event>;
  onBlur?: JSX.EventHandler<HTMLInputElement | HTMLTextAreaElement, FocusEvent>;
};

export function TextField(props: TextFieldProps) {
  const [rootProps, addedProps, inputProps] = splitProps(
    props,
    ["name", "value", "required", "disabled"],
    ["help"],
    ["placeholder", "ref", "onInput", "onChange", "onBlur"],
  );

  const dataListID = createUniqueId();

  return (
    <KTextField.Root
      {...rootProps}
      // undefined value causes the input to be uncontrolled
      // see: https://github.com/kobaltedev/kobalte/issues/413
      value={rootProps.value ?? ""}
      validationState={props.error ? "invalid" : "valid"}
      class="w-full"
    >
      <div class="flex items-center gap-1">
        <Show when={props.label}>
          <KTextField.Label class="c-secondary text-caption">
            {props.label}
          </KTextField.Label>
        </Show>
        <Show when={addedProps.help}>
          <HelpTooltip>{addedProps.help}</HelpTooltip>
        </Show>
      </div>
      <Show
        when={props.multiline}
        fallback={
          <KTextField.Input
            {...inputProps}
            list={dataListID}
            type={props.type}
            class="b-1 w-full rounded bg-secondary px-1 py-0.5"
          />
        }
      >
        <KTextField.TextArea
          {...inputProps}
          autoResize
          class="b-1 w-full rounded bg-secondary px-1 py-0.5"
        />
      </Show>
      <Show when={props.options}>
        <datalist id={dataListID}>
          <For each={props.options}>
            {(option) => <option value={option.value} label={option.label} />}
          </For>
        </datalist>
      </Show>
      <KTextField.ErrorMessage class="font-500 text-caption text-red-5">
        {props.error}
      </KTextField.ErrorMessage>
    </KTextField.Root>
  );
}
