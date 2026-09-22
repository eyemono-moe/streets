import { type JSX, type ParentComponent, Show, splitProps } from "solid-js";

export type ChoiceButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** 先頭に置くアイコンの class（`i-material-symbols:…`）。 */
  icon: string;
  title: string;
  description?: string;
  /**
   * 末尾の印。`next` は押すと次の段へ進むもの、`expand` はその場で下に開くもの
   * （開いているかは親の `data-state` で回す）。
   */
  trailing?: "next" | "expand";
};

/**
 * いくつかの道から 1 つを選ぶ大きなボタン。名前と一行の説明を並べ、何が起きるかを
 * 押す前に読めるようにする。値を選ぶだけのものは `SegmentedControl` を使う。
 */
const ChoiceButton: ParentComponent<ChoiceButtonProps> = (props) => {
  const [own, rest] = splitProps(props, [
    "icon",
    "title",
    "description",
    "trailing",
    "class",
    "type",
  ]);
  return (
    <button
      type={own.type ?? "button"}
      class={`group c-primary flex w-full cursor-pointer items-center gap-3 rounded-2 border border-primary bg-primary px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-5 enabled:hover:bg-secondary disabled:cursor-default disabled:opacity-50 ${own.class ?? ""}`}
      {...rest}
    >
      <span
        class={`${own.icon} c-accent-5 size-6 shrink-0`}
        aria-hidden="true"
      />
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="font-600 text-body">{own.title}</span>
        <Show when={own.description}>
          <span class="c-secondary text-caption">{own.description}</span>
        </Show>
      </span>
      <Show when={own.trailing === "next"}>
        <span
          class="i-material-symbols:chevron-right-rounded c-secondary size-5 shrink-0"
          aria-hidden="true"
        />
      </Show>
      <Show when={own.trailing === "expand"}>
        <span
          class="i-material-symbols:expand-more-rounded c-secondary size-5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </Show>
    </button>
  );
};

export default ChoiceButton;
