import { type Component, type JSX, Show, createUniqueId } from "solid-js";
import Completion, { type CompletionSource } from "./Completion";

/**
 * 文字を打つ欄の見た目。名前を縦に添えない場所（一覧に 1 件足す欄など）でも
 * 同じ形になるよう、ここから配る。角を丸めきるのは検索窓（`SearchInput`）だけで、
 * フォームの入力欄はこの四角を使う。
 */
const inputBase =
  "c-primary placeholder:c-secondary rounded-2 border bg-primary px-2.5 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent-5";

export const textInputClass = `${inputBase} h-9 border-control`;

/** 誤りがあるときの `textInputClass`。枠の色だけを変える。 */
export const invalidTextInputClass = `${inputBase} h-9 border-danger`;

/**
 * 名前の付いた入力欄。名前・入力・（誤りか説明）の順に縦に並べる。誤りがあるときは
 * 説明の代わりに出し、読み上げでも入力欄と結び付ける。
 */
const TextField: Component<{
  label: string;
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  /** 入力の下に出す説明。誤りがあるときは出さない。詳しい説明へのリンクを含めてよい。 */
  hint?: JSX.Element;
  error?: string;
  /** 複数行（自己紹介など）。 */
  multiline?: boolean;
  type?: "text" | "url" | "email";
  /** 打つ途中で出す候補（スタンプなど）。 */
  completion?: readonly CompletionSource[];
  onBlur?: () => void;
  /** 説明や誤りの下に出す、入力を確かめた結果（ドメインに聞いた答えなど）。 */
  status?: JSX.Element;
  /** 入力欄の右に並べる道具（絵文字ピッカーなど）。 */
  trailing?: JSX.Element;
  /** 入力欄そのもの。道具から文字を入れるときに使う。 */
  fieldRef?: (field: HTMLInputElement | HTMLTextAreaElement) => void;
}> = (props) => {
  const id = createUniqueId();
  const noteId = `${id}-note`;
  // 枠の色は、誤りがあるときだけ変える。
  const border = () => (props.error ? "border-danger" : "border-control");
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <label for={id} class="c-secondary font-600 text-caption">
        {props.label}
      </label>
      <div class="flex items-center gap-1">
        <div class="min-w-0 flex-1">
          <Completion sources={props.completion ?? []} label="入れる候補">
            {(attach) => (
              <Show
                when={props.multiline}
                fallback={
                  <input
                    ref={(field) => {
                      attach(field);
                      props.fieldRef?.(field);
                    }}
                    id={id}
                    type={props.type ?? "text"}
                    class={`${inputBase} ${border()} h-9 w-full`}
                    placeholder={props.placeholder}
                    value={props.value}
                    aria-invalid={props.error !== undefined}
                    aria-describedby={
                      props.error || props.hint ? noteId : undefined
                    }
                    onInput={(event) =>
                      props.onInput(event.currentTarget.value)
                    }
                    onBlur={() => props.onBlur?.()}
                  />
                }
              >
                <textarea
                  ref={(field) => {
                    attach(field);
                    props.fieldRef?.(field);
                  }}
                  id={id}
                  rows={3}
                  class={`${inputBase} ${border()} w-full resize-y py-2`}
                  placeholder={props.placeholder}
                  value={props.value}
                  aria-invalid={props.error !== undefined}
                  aria-describedby={
                    props.error || props.hint ? noteId : undefined
                  }
                  onInput={(event) => props.onInput(event.currentTarget.value)}
                  onBlur={() => props.onBlur?.()}
                />
              </Show>
            )}
          </Completion>
        </div>
        {props.trailing}
      </div>
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
      <output class="empty:hidden">{props.status}</output>
    </div>
  );
};

export default TextField;
