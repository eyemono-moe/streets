import { mergeRefs } from "@solid-primitives/refs";
import { type JSX, splitProps } from "solid-js";
import type { Option } from "../../libs/autoComplete";
import { createSuggestList } from "../../libs/createSuggestList";
import type { SuggestType } from "./SuggestItem";
import { TextField, type TextFieldProps } from "./TextField";

type SuggestItemProps<T extends string> = {
  autoComplete: {
    prefixes: T[];
    options: {
      [K in T]:
        | Option<SuggestType>[]
        | ((query: string) => Option<SuggestType>[])
        | ((query: string) => Promise<Option<SuggestType>[]>);
    };
    minQueryLength?: number;
  };
} & TextFieldProps;

const SuggestTextField = <T extends string>(
  props: SuggestItemProps<T>,
): JSX.Element => {
  const [local, textFieldProps] = splitProps(props, ["autoComplete"]);

  let ref: HTMLInputElement | HTMLTextAreaElement | undefined;

  const { SuggestList } = createSuggestList(
    () => ref,
    local.autoComplete.prefixes,
    local.autoComplete.options,
    local.autoComplete.minQueryLength ?? 2,
  );

  return (
    <>
      <TextField
        {...textFieldProps}
        ref={mergeRefs(textFieldProps.ref, (el) => {
          ref = el;
        })}
      />
      <SuggestList />
    </>
  );
};

export default SuggestTextField;
