import { type Component, Show } from "solid-js";
import { useColumn } from "../context/column";
import type { ColumnState } from "../libs/deckSchema";
import ColumnContent from "./ColumnContent";
import type { HandleListeners } from "./Columns";

const Column: Component<{
  column: ColumnState;
  handleListeners: HandleListeners;
  isMoving: boolean;
}> = (props) => {
  // biome-ignore lint/style/noNonNullAssertion: Column component is always rendered inside ColumnProvider
  const [, { closeTempColumn, backOrCloseTempColumn }] = useColumn()!;

  return (
    <div
      class="relative flex h-full shrink-0 bg-primary"
      classList={{
        "w-80": props.column.size === "small",
        "w-100": props.column.size === "medium",
        "w-120": props.column.size === "large",
      }}
    >
      <div
        class="c-secondary absolute m-1 h-6 cursor-move rounded-full hover:bg-alpha-hover data-[moving='true']:bg-alpha-active"
        data-moving={props.isMoving}
        {...props.handleListeners}
      >
        <div class="i-material-symbols:drag-indicator aspect-square h-full w-auto" />
      </div>
      <ColumnContent content={props.column.content} />
      <Show when={props.column.tempContent}>
        <button
          type="button"
          class="absolute inset-0 bg-op-50! bg-secondary"
          onClick={closeTempColumn}
        />
        <div class="absolute inset-0 top-10">
          <div class="grid h-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-t-2 bg-primary">
            <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center">
              <button
                type="button"
                class="c-secondary appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
                onClick={backOrCloseTempColumn}
              >
                <div class="i-material-symbols:chevron-left-rounded aspect-square h-6 w-auto" />
              </button>
              <div>test</div>
              <button
                type="button"
                class="c-secondary appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
                onClick={closeTempColumn}
              >
                <div class="i-material-symbols:close-rounded aspect-square h-6 w-auto" />
              </button>
            </div>
            {/* biome-ignore lint/style/noNonNullAssertion: open when props.column.tempContent is not null */}
            <ColumnContent content={props.column.tempContent!} />
          </div>
        </div>
      </Show>
    </div>
  );
};

export default Column;
