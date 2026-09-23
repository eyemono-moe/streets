import { type Component, type JSX, Show } from "solid-js";
import { useDispatch } from "../ui-events";

/**
 * アイコン列の右に開くパネル。投稿・カラム追加・設定はここへ寄せる ——
 * 置き場所の規則を 1 つにし、デッキを閉じずに書けるようにするため。
 * 画面が狭いときはデッキの代わりに全面へ出す。
 */
const SidePanel: Component<{
  title: string;
  icon: string;
  children: JSX.Element;
  full?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <section
      class="flex h-full min-h-0 animate-panel-in flex-col border-primary bg-primary"
      classList={{
        "w-full": props.full,
        "w-90 shrink-0 border-r": !props.full,
      }}
    >
      <header class="flex h-12 shrink-0 items-center gap-2.5 pr-3 pl-4">
        <span
          class={`c-secondary size-4.5 shrink-0 ${props.icon}`}
          aria-hidden="true"
        />
        <h2 class="min-w-0 flex-1 truncate font-600 text-body">
          {props.title}
        </h2>
        <button
          type="button"
          aria-label="閉じる"
          class="c-secondary grid size-7 shrink-0 cursor-pointer place-items-center rounded-2 bg-secondary"
          onClick={() => dispatch({ type: "deck/close-panel" })}
        >
          <span
            class="i-material-symbols:close-rounded size-4.5"
            aria-hidden="true"
          />
        </button>
      </header>
      <Show when={props.children}>{props.children}</Show>
    </section>
  );
};

export default SidePanel;
