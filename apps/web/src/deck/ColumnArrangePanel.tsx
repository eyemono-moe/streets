import type { ColumnDef } from "@streets/core/deck/deck";
import type { DeckUiState } from "@streets/core/deck/deck-ui";
import { type Component, For, Show } from "solid-js";
import { columnView } from "../columns/column-views";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import { createSortable } from "../ui/sortable";
import { createColumnOrder } from "./column-order";
import ColumnIcon from "./ColumnIcon";
import ColumnTitle, { useColumnTitle } from "./ColumnTitle";

/** タッチで行を掴むまでの長押し。 */
const HOLD_MS = 300;

const Row: Component<{
  column: ColumnDef;
  position: number;
  count: number;
  onGrab: (event: PointerEvent, handle: boolean) => void;
}> = (props) => {
  const dispatch = useDispatch();
  const title = useColumnTitle(() => props.column);
  const subtitle = () =>
    columnView(props.column.source).meta(props.column.source).subtitle;
  const move = (direction: -1 | 1) =>
    dispatch({ type: "deck/move-column", id: props.column.id, direction });
  return (
    // 掴んだら少し大きくして浮かせる。scale は transform と別の指定なので、掴んだ行を
    // 動かす transform と打ち消し合わない。
    <li
      data-arrange-id={props.column.id}
      class="flex cursor-grab select-none items-center gap-2.5 rounded-2 border border-primary bg-primary pl-3 [-webkit-touch-callout:none] transition-[scale,box-shadow,border-color] duration-120 data-[dragging]:z-1 data-[dragging]:border-accent-5 data-[dragging]:shadow-xl data-[dragging]:[scale:1.02]"
      style={{ order: props.position }}
      onPointerDown={(event) => props.onGrab(event, false)}
    >
      <ColumnIcon
        column={props.column}
        class="c-secondary size-4.5 shrink-0"
        avatarClass="size-5 shrink-0 rounded-1.5"
      />
      <span class="flex min-w-0 flex-1 flex-col py-2">
        <span class="truncate font-600 text-body">
          <ColumnTitle column={props.column} />
        </span>
        <Show when={subtitle()}>
          {(text) => (
            <span class="c-secondary truncate text-caption">{text()}</span>
          )}
        </Show>
      </span>
      {/*
        右端は、行の高さいっぱいを掴む場所にする。タッチでもここは押してすぐ掴める
        （ほかの場所は長押しで掴み、押してすぐ動かすと一覧を送る）。
      */}
      <div
        class="grid touch-none place-items-center self-stretch px-2.5"
        onPointerDown={(event) => {
          event.stopPropagation();
          props.onGrab(event, true);
        }}
      >
        <IconButton
          icon="i-material-symbols:drag-indicator"
          label={`「${title()}」を動かす（${props.position + 1} / ${props.count} 番目）`}
          title="掴んで上下に動かすか、↑↓ キーで動かす"
          aria-keyshortcuts="ArrowUp ArrowDown"
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-1);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(1);
            }
          }}
        />
      </div>
    </li>
  );
};

/**
 * カラムを上下に並べて、掴んで並べ替える。狭い画面ではカラムを横に並べて見られない
 * ので、ここで並びを変える。広い画面でも、カラムが多いと横に送るより早い。
 */
const ColumnArrangePanel: Component<{
  columns: readonly ColumnDef[];
  dragging: DeckUiState["dragging"];
}> = (props) => {
  const dispatch = useDispatch();
  const order = createColumnOrder(
    () => props.columns,
    () => props.dragging,
  );
  let scroller: HTMLDivElement | undefined;
  let list: HTMLOListElement | undefined;
  const sort = createSortable({
    axis: "y",
    container: () => list,
    scroller: () => scroller,
    element: (id) =>
      list?.querySelector<HTMLElement>(
        `[data-arrange-id="${CSS.escape(id)}"]`,
      ) ?? undefined,
    order: order.ids,
    start: (id, index) => dispatch({ type: "deck/drag-start", id, index }),
    move: (to) => dispatch({ type: "deck/drag-move", to }),
    drop: () => dispatch({ type: "deck/drop" }),
    cancel: () => dispatch({ type: "deck/drag-end" }),
  });
  return (
    <div ref={scroller} class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <Show
        when={props.columns.length > 0}
        fallback={
          <p class="c-secondary text-caption">
            カラムがありません。「カラムを追加」から足せます。
          </p>
        }
      >
        <p class="c-secondary mb-3 text-caption">
          行を掴んで上下に動かすと、カラムの並びが変わります。
        </p>
        {/* 並べ替えで測る位置の基準にするため、位置を持たせる。 */}
        <ol class="relative m-0 flex list-none flex-col gap-1.5 p-0" ref={list}>
          <For each={order.mounted()}>
            {(column) => (
              <Row
                column={column}
                position={order.indexOf(column.id)}
                count={props.columns.length}
                onGrab={(event, handle) =>
                  // タッチで行を押してすぐ掴むと、一覧を送れなくなる。行は長押しで掴む。
                  sort.onPointerDown(
                    column.id,
                    event,
                    event.pointerType === "touch" && !handle
                      ? { hold: HOLD_MS }
                      : { lift: true },
                  )
                }
              />
            )}
          </For>
        </ol>
      </Show>
    </div>
  );
};

export default ColumnArrangePanel;
