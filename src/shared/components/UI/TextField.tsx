import { TextField as KTextField } from "@kobalte/core";
import { type JSX, Show, splitProps } from "solid-js";

type TextFieldProps = {
  name?: string;
  type?: "text" | "email" | "tel" | "password" | "url" | "date" | undefined;
  label?: string | undefined;
  placeholder?: string | undefined;
  value: string | undefined;
  error?: string;
  multiline?: boolean | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  ref?: (element: HTMLInputElement | HTMLTextAreaElement) => void;
  onInput?: JSX.EventHandler<
    HTMLInputElement | HTMLTextAreaElement,
    InputEvent
  >;
  onChange?: JSX.EventHandler<HTMLInputElement | HTMLTextAreaElement, Event>;
  onBlur?: JSX.EventHandler<HTMLInputElement | HTMLTextAreaElement, FocusEvent>;
};

export function TextField(props: TextFieldProps) {
  const [rootProps, inputProps] = splitProps(
    props,
    ["name", "value", "required", "disabled"],
    ["placeholder", "ref", "onInput", "onChange", "onBlur"],
  );
  return (
    <KTextField.Root
      {...rootProps}
      validationState={props.error ? "invalid" : "valid"}
      class="w-full"
    >
      <Show when={props.label}>
        <KTextField.Label>{props.label}</KTextField.Label>
      </Show>
      <Show
        when={props.multiline}
        fallback={
          <KTextField.Input
            {...inputProps}
            type={props.type}
            class="b-1 w-full rounded px-1 py-0.5"
          />
        }
      >
        <KTextField.TextArea {...inputProps} autoResize />
      </Show>
      <KTextField.ErrorMessage class="font-500 text-3.5 text-red-6">
        {props.error}
      </KTextField.ErrorMessage>
    </KTextField.Root>
  );
}
