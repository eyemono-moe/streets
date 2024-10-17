import {
  DragDropProvider,
  DragDropSensors,
  type DragEventHandler,
  DragOverlay,
  SortableProvider,
  closestCenter,
  createSortable,
  transformStyle,
  useDragDropContext,
} from "@thisbeyond/solid-dnd";
import stringify from "safe-stable-stringify";
import { type Component, For } from "solid-js";
import { ColumnProvider } from "../context/column";
import { useDeck } from "../context/deck";
import type { ColumnState } from "../libs/deckSchema";
import Column from "./Column";

export type HandleListeners = ReturnType<
  typeof createSortable
>["dragActivators"];

const SortableColumn: Component<{
  state: ColumnState;
  index: number;
}> = (props) => {
  // @ts-ignore: TS6133 typescript can't detect use: directive
  const sortable = createSortable(stringify(props.state));
  const ctx = useDragDropContext();

  return (
    <div
      ref={sortable.ref}
      class="sortable"
      id={`col-${props.index}`}
      classList={{
        "transition-transform": !!ctx?.[0].active.draggable,
      }}
      style={transformStyle(sortable.transform)}
    >
      <ColumnProvider index={props.index}>
        <Column
          column={props.state}
          handleListeners={sortable.dragActivators}
          isMoving={ctx?.[0].active.draggable?.id === stringify(props.state)}
        />
      </ColumnProvider>
    </div>
  );
};

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      sortable: true;
    }
  }
}

const Columns: Component = () => {
  const [state, { moveColumn }] = useDeck();

  const ids = () => state.columns.map((s) => stringify(s));

  const onDragEnd: DragEventHandler = ({ draggable, droppable }) => {
    if (draggable && droppable) {
      const currentItems = ids();
      const fromIndex = currentItems.indexOf(draggable.id as string);
      const toIndex = currentItems.indexOf(droppable.id as string);
      if (fromIndex !== toIndex) {
        moveColumn(fromIndex, toIndex);
      }
    }
  };

  return (
    <DragDropProvider onDragEnd={onDragEnd} collisionDetector={closestCenter}>
      <DragDropSensors />
      <div class="children:b-r flex h-full w-full overflow-x-scroll">
        <SortableProvider ids={ids()}>
          <For each={state.columns}>
            {(column, i) => <SortableColumn state={column} index={i()} />}
          </For>
        </SortableProvider>
      </div>
      <DragOverlay>
        {/* DragOverlayを使用しない場合カラム全体を標示しようとして動作が重くなるため空文字列のDragOverlayを表示 */}
        {""}
      </DragOverlay>
    </DragDropProvider>
  );
};

export default Columns;
