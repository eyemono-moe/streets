import { type Component, Show, createUniqueId } from "solid-js";

/**
 * 名前の付いた入力欄。名前・入力・（誤りか説明）の順に縦に並べる。誤りがあるときは
 * 説明の代わりに出し、読み上げでも入力欄と結び付ける。
 */
const TextField: Component<{
  label: string;
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  /** 入力の下に出す説明。誤りがあるときは出さない。 */
  hint?: string;
  error?: string;
  /** 複数行（自己紹介など）。 */
  multiline?: boolean;
  type?: "text" | "url" | "email";
}> = (props) => {
  const id = createUniqueId();
  const noteId = `${id}-note`;
  const inputClass =
    "c-primary placeholder:c-secondary w-full rounded-2 border bg-primary px-2.5 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent-5";
  const border = () =>
    props.error ? "border-[#C5221F] dark:border-[#F28B82]" : "border-primary";
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <label for={id} class="c-secondary font-600 text-caption">
        {props.label}
      </label>
      <Show
        when={props.multiline}
        fallback={
          <input
            id={id}
            type={props.type ?? "text"}
            class={`${inputClass} ${border()} h-9`}
            placeholder={props.placeholder}
            value={props.value}
            aria-invalid={props.error !== undefined}
            aria-describedby={props.error || props.hint ? noteId : undefined}
            onInput={(event) => props.onInput(event.currentTarget.value)}
          />
        }
      >
        <textarea
          id={id}
          rows={3}
          class={`${inputClass} ${border()} resize-y py-2`}
          placeholder={props.placeholder}
          value={props.value}
          aria-invalid={props.error !== undefined}
          aria-describedby={props.error || props.hint ? noteId : undefined}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
      </Show>
      <Show
        when={props.error}
        fallback={
          <Show when={props.hint}>
            <p id={noteId} class="c-secondary text-caption">
              {props.hint}
            </p>
          </Show>
        }
      >
        <p id={noteId} class="c-danger text-caption">
          {props.error}
        </p>
      </Show>
    </div>
  );
};

export default TextField;
