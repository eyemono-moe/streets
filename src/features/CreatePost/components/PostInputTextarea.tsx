import { TextField } from "@kobalte/core/text-field";
import { type Ref, mergeRefs } from "@solid-primitives/refs";
import type { Component, ComponentProps } from "solid-js";
import { useI18n } from "../../../i18n";
import {
  createSuggestList,
  useEmojiOptions,
  useUserOptions,
} from "../../../shared/libs/createSuggestList";

const PostInputTextarea: Component<
  ComponentProps<"textarea"> & {
    ref?: Ref<HTMLTextAreaElement>;
  }
> = (props) => {
  const t = useI18n();

  let ref: HTMLTextAreaElement | undefined;

  const emojiOption = useEmojiOptions();
  const userOption = useUserOptions();

  const { SuggestList } = createSuggestList(
    () => ref,
    [":", "@"],
    {
      ":": emojiOption,
      "@": userOption,
    },
    1,
  );

  return (
    <>
      <TextField
        class="b-1 relative rounded bg-secondary p-2 outline-accent-5 focus-within:outline"
        onClick={() => ref?.focus()}
      >
        {/* @ts-ignore (2322) TODO: onInputの型が誤っている? */}
        <TextField.TextArea
          {...props}
          ref={mergeRefs<HTMLTextAreaElement>(props.ref, (el) => {
            ref = el;
          })}
          rows={5}
          placeholder={t("postInput.placeholder")}
          autoResize
          class="w-full resize-none appearance-none bg-transparent focus:outline-none disabled:cursor-progress"
        />
        <TextField.Description class="c-secondary text-caption">
          {t("postInput.enterToAddNewLine")}
        </TextField.Description>
      </TextField>
      <SuggestList />
    </>
  );
};

export default PostInputTextarea;
