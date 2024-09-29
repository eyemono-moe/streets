import { type Component, For } from "solid-js";
import { ColumnProvider } from "../context/column";
import { useDeck } from "../context/deck";
import Column from "./Column";

const Columns: Component = () => {
  const [state] = useDeck();

  return (
    <div class="children:b-r flex h-full w-full overflow-x-scroll">
      <For each={state.columns}>
        {(column, i) => (
          <ColumnProvider index={i()}>
            <Column column={column} />
          </ColumnProvider>
        )}
      </For>
    </div>
  );
};

export default Columns;
