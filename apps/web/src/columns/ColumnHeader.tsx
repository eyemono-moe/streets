import type { ColumnDef } from "@streets/core/deck/deck";
import { type Component, Show } from "solid-js";
import { columnMeta } from "../deck/column-meta";
import ColumnIcon from "../deck/ColumnIcon";
import ColumnTitle from "../deck/ColumnTitle";
import { useDispatch } from "../ui-events";

export type StackedColumn = {
  backTo: ColumnDef;
};

export const ColumnHeader: Component<{
  column: ColumnDef;
  open: boolean;
  draggable?: boolean;
  temporary?: boolean;
  onTitle: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  const meta = () => columnMeta(props.column);
  return (
    <header
      class="flex h-11.25 shrink-0 items-center gap-2.5 border-primary border-b-1 bg-primary px-3"
      classList={{ "cursor-grab": props.draggable === true }}
      draggable={props.draggable === true}
      onDragStart={(event) => {
        event.dataTransfer?.setData("text/plain", props.column.id);
        dispatch({ type: "deck/drag-start", id: props.column.id });
      }}
      onDragEnd={() => dispatch({ type: "deck/drag-end" })}
    >
      <ColumnIcon
        column={props.column}
        class="c-secondary size-4.5 shrink-0"
        avatarClass="size-5 shrink-0 rounded-1.5"
      />
      <button
        type="button"
        title="先頭へ戻る"
        class="flex min-w-0 flex-1 cursor-pointer flex-col bg-transparent p-0 text-left"
        onClick={() => props.onTitle()}
      >
        <h2 class="w-full truncate font-600 text-body">
          <ColumnTitle column={props.column} />
        </h2>
        <p class="c-secondary w-full truncate text-caption">
          {meta().subtitle}
        </p>
      </button>
      <Show when={props.temporary}>
        <>
          <button
            type="button"
            class="c-secondary flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-2.5 font-600 text-caption"
            onClick={() => dispatch({ type: "deck/keep-temp" })}
          >
            <span
              class="i-material-symbols:bookmark-outline-rounded size-3.5"
              aria-hidden="true"
            />
            カラムに残す
          </button>
          <button
            type="button"
            aria-label="閉じる"
            class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
            onClick={() => dispatch({ type: "deck/close-temp" })}
          >
            <span
              class="i-material-symbols:close-rounded size-4.5"
              aria-hidden="true"
            />
          </button>
        </>
      </Show>
      <Show when={!props.temporary}>
        <button
          type="button"
          aria-label="カラムの設定"
          aria-expanded={props.open}
          class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
          onClick={() =>
            dispatch({ type: "deck/toggle-settings", id: props.column.id })
          }
        >
          <span
            class="size-4.5"
            classList={{
              "i-material-symbols:more-horiz": !props.open,
              "i-material-symbols:close-rounded": props.open,
            }}
            aria-hidden="true"
          />
        </button>
      </Show>
    </header>
  );
};

export const StackedColumnHeader: Component<{
  column: ColumnDef;
  stacked: StackedColumn;
  onTitle: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- キーボードからは題名のボタンで先頭へ戻る
    <header
      class="flex h-11.25 shrink-0 items-center gap-2.5 border-primary border-b-1 bg-primary px-3"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) {
          return;
        }
        props.onTitle();
      }}
    >
      <button
        type="button"
        aria-label="戻る"
        class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
        onClick={() => dispatch({ type: "stack/back" })}
      >
        <span
          class="i-material-symbols:chevron-left-rounded size-5.5"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        title="先頭へ戻る"
        class="flex min-w-0 flex-1 cursor-pointer flex-col bg-transparent p-0 text-left"
        onClick={() => props.onTitle()}
      >
        <h2 class="w-full truncate font-600 text-body">
          <ColumnTitle column={props.column} />
        </h2>
        <p class="c-secondary w-full truncate text-caption">
          <ColumnTitle column={props.stacked.backTo} />
          に戻る
        </p>
      </button>
      <button
        type="button"
        aria-label="デッキのカラムとして開く"
        title="デッキのカラムとして開く"
        class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
        onClick={() => {
          dispatch({ type: "stack/back" });
          dispatch({ type: "deck/add-column", column: props.column });
        }}
      >
        <span
          class="i-material-symbols:open-in-new-rounded size-4.5"
          aria-hidden="true"
        />
      </button>
    </header>
  );
};
