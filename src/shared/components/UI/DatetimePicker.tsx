import { TextField as KTextField } from "@kobalte/core";
import {
  type Component,
  type JSX,
  Show,
  createMemo,
  splitProps,
} from "solid-js";
import HelpTooltip from "../HelpTooltip";

type DatetimePickerProps = {
  name?: string;
  label?: string;
  /** Unix timestamp */
  value?: number;
  help?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  ref?: (element: HTMLInputElement) => void;
  onInput?: JSX.EventHandler<HTMLInputElement, InputEvent>;
  onChange?: JSX.EventHandler<HTMLInputElement, Event>;
  onBlur?: JSX.EventHandler<HTMLInputElement, FocusEvent>;
};

const DatetimePicker: Component<DatetimePickerProps> = (props) => {
  const [rootProps, addedProps, inputProps] = splitProps(
    props,
    ["name", "value", "required", "disabled"],
    ["help"],
    ["ref", "onInput", "onChange", "onBlur"],
  );

  const strValue = createMemo(() => {
    if (!props.value) return "";
    if (Number.isNaN(props.value)) return "";
    // slice(0, 16) removes the seconds and milliseconds
    return new Date(props.value).toISOString().slice(0, 16);
  });

  return (
    <KTextField.Root
      {...rootProps}
      // undefined value causes the input to be uncontrolled
      // see: https://github.com/kobaltedev/kobalte/issues/413
      value={strValue()}
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
      <KTextField.Input
        {...inputProps}
        // datetime-localはlocalの日時を返すので、UTCに変換する必要がある
        type="datetime-local"
        class="b-1 w-full rounded bg-secondary px-1 py-0.5"
      />
      <KTextField.ErrorMessage class="font-500 text-caption text-red-5">
        {props.error}
      </KTextField.ErrorMessage>
    </KTextField.Root>
  );
};

export default DatetimePicker;
