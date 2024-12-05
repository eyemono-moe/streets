import { A, useNavigate } from "@solidjs/router";
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
  const [, , layout] = useDeck();

  const sortable = createSortable(props.state.id);
  const ctx = useDragDropContext();

  return (
    <div
      ref={sortable.ref}
      class="sortable"
      id={`col-${props.index}`}
      classList={{
        "transition-transform": !!ctx?.[0].active.draggable,
        "snap-start": layout() === "vertical",
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

  const [, , layout] = useDeck();

  const [state, { moveColumn }] = useDeck();
  const ids = () => state.columns.map((s) => s.id);
  const navigate = useNavigate();

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
    <div class="relative h-full w-full overflow-hidden">
      <DragDropProvider onDragEnd={onDragEnd} collisionDetector={closestCenter}>
        <DragDropSensors />
        <div class="children:b-r flex h-full w-full snap-x snap-mandatory overflow-x-scroll">
          <SortableProvider ids={ids()}>
            <For each={state.columns}>
              {(column, i) => <SortableColumn state={column} index={i()} />}
            </For>
          </SortableProvider>
          <A
            href="/add-column"
            classList={{
              "snap-start": layout() === "vertical",
            }}
          >
            <div
              class="flex h-full flex-col items-center justify-center"
              classList={{
                "w-80": layout() === "horizontal",
                "w-screen": layout() === "vertical",
              }}
            >
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
      <div class="absolute right-2 bottom-4">
        <button
          onClick={() => navigate("/post")}
          type="button"
          class="rounded-full bg-accent-primary p-2 shadow shadow-ui/25"
        >
          <div class="i-material-symbols:edit-square-outline-rounded aspect-square h-auto w-8" />
        </button>
      </div>
    </div>
  );
};

export default Columns;
