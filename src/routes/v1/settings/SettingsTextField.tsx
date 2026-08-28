import { Field } from "@ark-ui/solid/field";
import {
  type Component,
  type ComponentProps,
  Show,
  splitProps,
} from "solid-js";

type SettingsTextFieldProps = Omit<ComponentProps<"input">, "class"> & {
  label: string;
  error?: string;
  labelVisible?: boolean;
  rootClass?: string;
};

/** Ark Field の label / invalid 配線と設定画面の入力面を揃える。 */
const SettingsTextField: Component<SettingsTextFieldProps> = (props) => {
  const [fieldProps, inputProps] = splitProps(props, [
    "label",
    "error",
    "labelVisible",
    "rootClass",
  ]);
  return (
    <Field.Root
      class={fieldProps.rootClass}
      disabled={inputProps.disabled}
      invalid={fieldProps.error !== undefined}
    >
      <Field.Label
        class={fieldProps.labelVisible ? "c-secondary text-caption" : "sr-only"}
      >
        {fieldProps.label}
      </Field.Label>
      <Field.Input
        {...inputProps}
        class="h-9 w-full rounded-2 border border-primary bg-secondary px-3 text-body outline-none focus:border-accent-5 data-[invalid]:border-red-6"
      />
      <Show when={fieldProps.error}>
        {(message) => (
          <Field.ErrorText class="mt-2 block text-caption text-red-8 dark:text-red-4">
            {message()}
          </Field.ErrorText>
        )}
      </Show>
    </Field.Root>
  );
};

export default SettingsTextField;
