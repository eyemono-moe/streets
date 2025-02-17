import { createPresence } from "@solid-primitives/presence";
import { type Component, Show } from "solid-js";
import { useColumn } from "../context/column";
import { useDeck } from "../context/deck";
import type { ColumnState } from "../libs/deckSchema";
import ColumnContent from "./ColumnContent";
import type { HandleListeners } from "./Columns";

const Column: Component<{
  column: ColumnState;
  handleListeners: HandleListeners;
  isMoving: boolean;
}> = (props) => {
  const [, , layout] = useDeck();
  // biome-ignore lint/style/noNonNullAssertion: Column component is always rendered inside ColumnProvider
  const [, { closeTempColumn }] = useColumn()!;

  const presence = createPresence(() => !!props.column.tempContent, {
    transitionDuration: 200,
  });

  return (
    <div
      class="relative flex h-full shrink-0 overflow-hidden bg-primary transition-width duration-100"
      classList={{
        "w-80": layout() === "horizontal" && props.column.size === "small",
        "w-100": layout() === "horizontal" && props.column.size === "medium",
        "w-120": layout() === "horizontal" && props.column.size === "large",
        "w-100vw": layout() === "vertical",
      }}
    >
      <ColumnContent content={props.column.content} />
      <Show when={presence.isMounted()}>
        <div class="z-1">
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
            <div class="h-full divide-y overflow-hidden rounded-t-2 bg-primary">
              <Show when={props.column.tempContent}>
                <ColumnContent
                  // biome-ignore lint/style/noNonNullAssertion: Show when props.column.tempContent is not null
                  content={props.column.tempContent!}
                  isTempColumn
                />
              </Show>
            </div>
          </div>
        </div>
      </Show>
      <div
        class="c-secondary absolute m-1 h-7.5 cursor-move rounded-full hover:bg-alpha-hover data-[moving='true']:bg-alpha-active"
        data-moving={props.isMoving}
        {...props.handleListeners}
      >
        <div class="i-material-symbols:drag-indicator aspect-square h-full w-auto" />
      </div>
    </div>
  );
};

export default Column;
