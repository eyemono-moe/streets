import { type Component, type JSX, Show, splitProps } from "solid-js";
import Completion, { type CompletionSource } from "./Completion";
import IconButton from "./IconButton";

export type SearchInputProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onInput" | "class" | "ref" | "aria-label" | "type"
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** 何を探す欄か。読み上げに使う。 */
  label: string;
  /** 入っている間、末尾に × を出して空に戻せるようにする。Escape でも空に戻る。 */
  clearable?: boolean;
  /** 打つ途中で出す候補（人の名前など）。 */
  completion?: readonly CompletionSource[];
  /** 候補の一覧の名前。 */
  completionLabel?: string;
  /** 外側の箱に当てる class。幅を決めるのに使う。 */
  class?: string;
  ref?: (element: HTMLInputElement) => void;
};

/**
 * 検索窓。角を丸めきった箱に、虫眼鏡・入力・（入っていれば）× を横に並べる。
 * 枠と焦点は箱が持つので、× を入力の上に重ねずに済む。
 */
const SearchInput: Component<SearchInputProps> = (props) => {
  const [own, rest] = splitProps(props, [
    "value",
    "onValueChange",
    "label",
    "clearable",
    "completion",
    "completionLabel",
    "class",
    "ref",
    "onKeyDown",
  ]);
  let input: HTMLInputElement | undefined;
  const clearing = () => own.clearable === true && own.value !== "";
  const clear = () => {
    own.onValueChange("");
    input?.focus();
  };
  return (
    <div
      class={`flex h-9 items-center gap-2 rounded-full border border-primary bg-primary pl-3.5 focus-within:ring-2 focus-within:ring-accent-5 ${own.class ?? ""}`}
      classList={{ "pr-1.5": clearing(), "pr-3.5": !clearing() }}
    >
      <span
        class="i-material-symbols:search-rounded c-secondary size-4.5 shrink-0"
        aria-hidden="true"
      />
      <Completion
        sources={own.completion ?? []}
        label={own.completionLabel ?? "入れる候補"}
      >
        {(attach) => (
          <input
            {...rest}
            ref={(element) => {
              input = element;
              attach(element);
              own.ref?.(element);
            }}
            type="text"
            aria-label={own.label}
            class="c-primary placeholder:c-secondary h-full min-w-0 flex-1 bg-transparent text-body outline-none"
            value={own.value}
            onInput={(event) => own.onValueChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (typeof own.onKeyDown === "function") own.onKeyDown(event);
              if (event.defaultPrevented) return;
              if (event.key === "Escape" && clearing()) {
                event.preventDefault();
                clear();
              }
            }}
          />
        )}
      </Completion>
      <Show when={clearing()}>
        <IconButton
          icon="i-material-symbols:close-rounded"
          label="入力を消す"
          onClick={clear}
        />
      </Show>
    </div>
  );
};

export default SearchInput;
