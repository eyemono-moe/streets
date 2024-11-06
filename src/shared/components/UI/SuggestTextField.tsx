import { Combobox } from "@kobalte/core/combobox";
import {
  type Component,
  type JSX,
  Show,
  createEffect,
  createSignal,
  splitProps,
} from "solid-js";
import HelpTooltip from "../HelpTooltip";

type Option = {
  value: string;
  label: string;
};

type SuggestTextFieldProps = {
  name?: string;
  label?: string;
  options: Option[];
  placeholder?: string;
  value?: string;
  help?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  ref?: (element: HTMLInputElement) => void;
  onInput?: JSX.EventHandler<HTMLInputElement, InputEvent>;
  onChange?: JSX.EventHandler<HTMLInputElement, Event>;
  onBlur?: JSX.EventHandler<HTMLInputElement, FocusEvent>;
};

const SuggestTextField: Component<SuggestTextFieldProps> = (props) => {
  const [rootProps, addedProps, inputProps] = splitProps(
    props,
    ["name", "value", "required", "disabled", "options"],
    ["help"],
    ["placeholder", "ref", "onInput", "onChange", "onBlur"],
  );

  const [value, setValue] = createSignal<Option>();
  createEffect(() => {
    const option = props.options.find((option) => option.value === props.value);
    if (option) {
      setValue(option);
    }
  });

  return (
    <Combobox<Option>
      {...rootProps}
      multiple={false}
      value={value()}
      onChange={setValue}
      validationState={props.error ? "invalid" : "valid"}
      optionValue={(option) => option.value}
      optionTextValue={(option) => option.label}
      optionLabel={(option) => option.label}
      class="w-full"
      itemComponent={(props) => (
        <Combobox.Item item={props.item} class="combobox__item">
          <Combobox.ItemLabel>{props.item.textValue}</Combobox.ItemLabel>
          <Combobox.ItemIndicator class="combobox__item-indicator">
            <div class="i-material-symbols:check-rounded aspect-square h-1lh w-auto" />
          </Combobox.ItemIndicator>
        </Combobox.Item>
      )}
    >
      <div class="flex items-center gap-1">
        <Show when={props.label}>
          <Combobox.Label class="c-secondary text-caption">
            {props.label}
          </Combobox.Label>
        </Show>
        <Show when={addedProps.help}>
          <HelpTooltip>{addedProps.help}</HelpTooltip>
        </Show>
      </div>
      <Combobox.Control>
        <Combobox.Input
          {...inputProps}
          class="b-1 w-full rounded bg-secondary px-1 py-0.5"
        />
        <Combobox.Trigger>
          <Combobox.Icon>
            <div class="i-material-symbols:expand-all-rounded aspect-square h-1lh w-auto" />
          </Combobox.Icon>
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.ErrorMessage class="font-500 text-caption text-red-5">
        {props.error}
      </Combobox.ErrorMessage>
      <Combobox.Portal>
        <Combobox.Content>
          <Combobox.Arrow />
          <Combobox.Listbox />
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox>
  );
};

export default SuggestTextField;
