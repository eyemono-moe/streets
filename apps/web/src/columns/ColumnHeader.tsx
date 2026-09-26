import type { ColumnDef } from "@streets/core/deck/deck";
import { type Component, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import ColumnIcon from "../deck/ColumnIcon";
import ColumnTitle from "../deck/ColumnTitle";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import { columnView } from "./column-views";

export type StackedColumn = {
  backTo: ColumnDef;
};

/**
 * カラムの見出しの右側。カラムの種類ごとの操作に続けて、一時カラムなら
 * 「カラムに残す」と閉じる、それ以外ならカラムの設定。広い画面のカラムの見出しと、
 * 狭い画面の上のバーの両方がこれを使う。
 */
export const ColumnHeaderActions: Component<{
  column: ColumnDef;
  /** カラムの設定を開いている。 */
  open: boolean;
  temporary?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <>
      <Show when={columnView(props.column.source).HeaderActions}>
        {(actions) => (
          <Dynamic component={actions()} source={props.column.source} />
        )}
      </Show>
      <Show when={props.temporary}>
        <>
          <Button
            size="sm"
            icon="i-material-symbols:bookmark-outline-rounded"
            onClick={() => dispatch({ type: "deck/keep-temp" })}
          >
            カラムに残す
          </Button>
          <IconButton
            icon="i-material-symbols:close-rounded"
            label="閉じる"
            onClick={() => dispatch({ type: "deck/close-temp" })}
          />
        </>
      </Show>
      <Show when={!props.temporary}>
        <IconButton
          icon={
            props.open
              ? "i-material-symbols:close-rounded"
              : "i-material-symbols:more-horiz"
          }
          label="カラムの設定"
          aria-expanded={props.open}
          onClick={() =>
            dispatch({ type: "deck/toggle-settings", id: props.column.id })
          }
        />
      </Show>
    </>
  );
};

export const ColumnHeader: Component<{
  column: ColumnDef;
  open: boolean;
  draggable?: boolean;
  temporary?: boolean;
  onTitle: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  const meta = () => columnView(props.column.source).meta(props.column.source);
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
      <ColumnHeaderActions
        column={props.column}
        open={props.open}
        temporary={props.temporary}
      />
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
      <IconButton
        icon="i-material-symbols:chevron-left-rounded"
        label="戻る"
        onClick={() => dispatch({ type: "stack/back" })}
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
          <ColumnTitle column={props.stacked.backTo} />
          に戻る
        </p>
      </button>
      <Show when={columnView(props.column.source).HeaderActions}>
        {(actions) => (
          <Dynamic component={actions()} source={props.column.source} />
        )}
      </Show>
      <IconButton
        icon="i-material-symbols:open-in-new-rounded"
        label="デッキのカラムとして開く"
        onClick={() => {
          dispatch({ type: "stack/back" });
          dispatch({ type: "deck/add-column", column: props.column });
        }}
      />
    </header>
  );
};
