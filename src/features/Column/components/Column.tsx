import { createPresence } from "@solid-primitives/presence";
import { type Component, Show } from "solid-js";
import { useI18n } from "../../../i18n";
import { useColumn } from "../context/column";
import type { ColumnState } from "../libs/deckSchema";
import ColumnContent from "./ColumnContent";
import type { HandleListeners } from "./Columns";

const Column: Component<{
  column: ColumnState;
  handleListeners: HandleListeners;
  isMoving: boolean;
}> = (props) => {
  const t = useI18n();

  const [, { closeTempColumn, backOrCloseTempColumn, transferTempColumn }] =
    // biome-ignore lint/style/noNonNullAssertion: Column component is always rendered inside ColumnProvider
    useColumn()!;

  const presence = createPresence(() => !!props.column.tempContent, {
    transitionDuration: 200,
  });

  return (
    <div
      class="relative flex h-full shrink-0 overflow-hidden bg-primary transition-width duration-100"
      classList={{
        "w-80": props.column.size === "small",
        "w-100": props.column.size === "medium",
        "w-120": props.column.size === "large",
      }}
    >
      <div
        class="c-secondary absolute m-1 h-7.5 cursor-move rounded-full hover:bg-alpha-hover data-[moving='true']:bg-alpha-active"
        data-moving={props.isMoving}
        {...props.handleListeners}
      >
        <div class="i-material-symbols:drag-indicator aspect-square h-full w-auto" />
      </div>
      <ColumnContent content={props.column.content} showHeader />
      <Show when={presence.isMounted()}>
        <button
          type="button"
          class="absolute inset-0 bg-op-80! bg-secondary data-[expanded='false']:animate-duration-200 data-[expanded='false']:animate-fade-out data-[expanded='true']:animate-duration-200 data-[expanded='true']:animate-fade-in"
          onClick={closeTempColumn}
          data-expanded={presence.isVisible()}
        />
        <div
          class="absolute inset-0 top-10 transition-transform duration-200 data-[expanded='false']:translate-y-100% data-[expanded='true']:translate-y-0"
          data-expanded={presence.isVisible()}
        >
          <div class="grid h-full grid-rows-[auto_minmax(0,1fr)] divide-y overflow-hidden rounded-t-2 bg-primary">
            <div class="flex items-center gap-1 p-1">
              <button
                type="button"
                class="c-secondary appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
                onClick={backOrCloseTempColumn}
              >
                <div class="i-material-symbols:chevron-left-rounded aspect-square h-6 w-auto" />
              </button>
              <button
                type="button"
                class="c-secondary ml-auto appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
                onClick={transferTempColumn}
                title={t("column.openInNextColumn")}
              >
                <div class="i-material-symbols:open-in-new-rounded aspect-square h-6 w-auto" />
              </button>
              <button
                type="button"
                class="c-secondary appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
                onClick={closeTempColumn}
              >
                <div class="i-material-symbols:close-rounded aspect-square h-6 w-auto" />
              </button>
            </div>
            <Show when={props.column.tempContent}>
              {/* biome-ignore lint/style/noNonNullAssertion: Show when props.column.tempContent is not null */}
              <ColumnContent content={props.column.tempContent!} />
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default Column;
