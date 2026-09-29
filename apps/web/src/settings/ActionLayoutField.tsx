import {
  ACTION_BAR_MAX,
  type ActionArrangeState,
  type ActionLayout,
  EVENT_ACTIONS,
  type EventActionId,
  MENU_DIVIDER,
  actionArrangeTransition,
  arrangedLayout,
  slotsOf,
} from "@streets/core/settings/action-layout";
import { type Component, For, createMemo } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { EVENT_ACTION_META } from "../note/event-ops";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import { createSortable } from "../ui/sortable";

/** タッチで行を掴むまでの長押し。 */
const HOLD_MS = 300;

/** DOM に並べる順。並べ替えても変えず、見た目の順は CSS の order で付ける。 */
const MOUNTED = [...EVENT_ACTIONS, MENU_DIVIDER] as const;

/** 端へ寄せたら送る箱。この欄を置いた設定のページの、縦に送れる箱。 */
const scrollerOf = (el: HTMLElement | undefined): HTMLElement | undefined => {
  for (let at = el?.parentElement; at; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY;
    if (overflow === "auto" || overflow === "scroll") return at;
  }
  return undefined;
};

const Row: Component<{
  id: EventActionId;
  position: number;
  inBar: boolean;
  /** アクション欄がいっぱいで、メニューから出せない。 */
  full: boolean;
  onGrab: (event: PointerEvent, handle: boolean) => void;
}> = (props) => {
  const dispatch = useDispatch();
  const meta = () => EVENT_ACTION_META[props.id];
  return (
    // 掴んだ行の見た目は、カラム整理パネルの行と揃える。
    <li
      data-action-slot={props.id}
      class="flex cursor-grab select-none items-center gap-2.5 rounded-2 border border-primary bg-primary pl-3 [-webkit-touch-callout:none] [transition-property:scale,box-shadow,border-color] duration-120 data-[dragging]:z-1 data-[dragging]:border-accent-5 data-[dragging]:shadow-xl data-[dragging]:[scale:1.02]"
      style={{ order: props.position }}
      onPointerDown={(event) => props.onGrab(event, false)}
    >
      <span
        class={`${meta().icon} c-secondary size-4.5 shrink-0`}
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 py-2 text-body">{meta().label}</span>
      <IconButton
        icon={
          props.inBar
            ? "i-material-symbols:arrow-downward-rounded"
            : "i-material-symbols:arrow-upward-rounded"
        }
        label={
          props.inBar
            ? `「${meta().label}」をメニューへ移す`
            : props.full
              ? `アクション欄は ${ACTION_BAR_MAX} 個までです`
              : `「${meta().label}」をアクション欄へ出す`
        }
        disabled={!props.inBar && props.full}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() =>
          dispatch({
            type: "action-layout/place",
            id: props.id,
            to: props.inBar ? "menu" : "bar",
          })
        }
      />
      {/* 右端は押してすぐ掴める。ほかの場所はタッチでは長押しで掴む。 */}
      <div
        class="grid touch-none place-items-center self-stretch px-2.5"
        onPointerDown={(event) => {
          event.stopPropagation();
          props.onGrab(event, true);
        }}
      >
        <IconButton
          icon="i-material-symbols:drag-indicator"
          label={`「${meta().label}」を動かす（${props.inBar ? "アクション欄" : "メニュー"}）`}
          title="掴んで上下に動かすか、↑↓ キーで動かす"
          aria-keyshortcuts="ArrowUp ArrowDown"
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            dispatch({
              type: "action-layout/move",
              id: props.id,
              direction: event.key === "ArrowUp" ? -1 : 1,
            });
          }}
        />
      </div>
    </li>
  );
};

/**
 * アクション欄とメニューに操作を振り分ける。2 つの枠は 1 本の並びで、境目の見出しを
 * 越えて動かすと、欄とメニューを行き来する。
 */
export const ActionLayoutView: Component<{
  state: ActionArrangeState;
}> = (props) => {
  const dispatch = useDispatch();
  const shown = createMemo(() => arrangedLayout(props.state));
  const slots = createMemo(() => slotsOf(shown()));
  const positionOf = (id: string) => slots().indexOf(id as EventActionId);
  let list: HTMLOListElement | undefined;
  const sort = createSortable({
    axis: "y",
    container: () => list,
    scroller: () => scrollerOf(list),
    element: (id) =>
      list?.querySelector<HTMLElement>(
        `[data-action-slot="${CSS.escape(id)}"]`,
      ) ?? undefined,
    order: slots,
    start: (id, index) =>
      dispatch({
        type: "action-layout/drag-start",
        id: id as EventActionId,
        index,
      }),
    move: (to) => dispatch({ type: "action-layout/drag-move", to }),
    drop: () => dispatch({ type: "action-layout/drop" }),
    cancel: () => dispatch({ type: "action-layout/drag-end" }),
  });
  const full = () => shown().bar.length >= ACTION_BAR_MAX;
  return (
    <div class="flex flex-col gap-1.5">
      <p class="c-secondary font-600 text-caption">
        アクション欄（{shown().bar.length} / {ACTION_BAR_MAX}）
      </p>
      {/* 並べ替えで測る位置の基準にするため、位置を持たせる。 */}
      <ol class="relative m-0 flex list-none flex-col gap-1.5 p-0" ref={list}>
        <For each={MOUNTED}>
          {(id) =>
            id === MENU_DIVIDER ? (
              <li
                data-action-slot={MENU_DIVIDER}
                class="c-secondary pt-3 font-600 text-caption"
                style={{ order: positionOf(MENU_DIVIDER) }}
              >
                右上のメニュー（{shown().menu.length}）
              </li>
            ) : (
              <Row
                id={id}
                position={positionOf(id)}
                inBar={shown().bar.includes(id)}
                full={full()}
                onGrab={(event, handle) =>
                  // タッチで行を押してすぐ掴むと、設定を送れなくなる。行は長押しで掴む。
                  sort.onPointerDown(
                    id,
                    event,
                    event.pointerType === "touch" && !handle
                      ? { hold: HOLD_MS }
                      : { lift: true },
                  )
                }
              />
            )
          }
        </For>
      </ol>
    </div>
  );
};

/** 並べ替えている途中の状態を持ち、確定した並びを上へ渡す。 */
const ActionLayoutField: Component<{ layout: ActionLayout }> = (props) => {
  const dispatch = useDispatch();
  const [state, setState] = createStore<Pick<ActionArrangeState, "dragging">>({
    dragging: undefined,
  });
  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "action-layout/drag-start":
      case "action-layout/drag-move":
      case "action-layout/drop":
      case "action-layout/drag-end":
      case "action-layout/move":
      case "action-layout/place": {
        const next = actionArrangeTransition(
          { layout: props.layout, dragging: state.dragging },
          event,
        );
        setState("dragging", reconcile(next.dragging));
        if (next.layout !== props.layout) {
          dispatch({ type: "deck/set-action-layout", layout: next.layout });
        }
        return true;
      }
      default:
        return false;
    }
  };
  return (
    <Mediates handle={handle}>
      <ActionLayoutView
        state={{ layout: props.layout, dragging: state.dragging }}
      />
    </Mediates>
  );
};

export default ActionLayoutField;
