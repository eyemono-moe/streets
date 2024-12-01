import { A } from "@solidjs/router";
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
import { type Component, For } from "solid-js";
import { useI18n } from "../../../i18n";
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
  const sortable = createSortable(props.state.id);
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
          isMoving={ctx?.[0].active.draggable?.id === props.state.id}
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
  const t = useI18n();

  const [state, { moveColumn }] = useDeck();

  const ids = () => state.columns.map((s) => s.id);

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
        <A href="/add-column">
          <div class="flex h-full w-80 flex-col items-center justify-center">
            <div class="i-material-symbols:add-column-right-outline-rounded aspect-square h-auto w-12" />
            {t("addColumn.title")}
          </div>
        </A>
      </div>
      <DragOverlay>
        {/* DragOverlayを使用しない場合カラム全体を標示しようとして動作が重くなるため空文字列のDragOverlayを表示 */}
        {""}
      </DragOverlay>
    </DragDropProvider>
  );
};

export default Columns;
