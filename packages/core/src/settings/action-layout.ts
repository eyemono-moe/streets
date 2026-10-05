import * as v from "valibot";
import { moveId } from "../deck/sortable";

/** 投稿の操作。アクション欄に出すか、右上のメニューに入れるかを選べる。 */
export const EVENT_ACTIONS = [
  "reply",
  "repost",
  "like",
  "react",
  "zap",
  "bookmark",
  "pin",
  "activity",
  "timeslip",
  "copy-link",
  "details",
  "mute-event",
  "broadcast",
] as const;

export type EventActionId = (typeof EVENT_ACTIONS)[number];

/**
 * 投稿の中身によらず出せる操作。アクション欄を出さない投稿（未ログイン・未対応の
 * kind）でも、メニューには必ず並べる。
 */
const EVENT_LEVEL: ReadonlySet<EventActionId> = new Set([
  "activity",
  "copy-link",
  "details",
  "mute-event",
  "broadcast",
]);

/** アクション欄に並べられる数。狭いカラムでも 1 行に収まる数。 */
export const ACTION_BAR_MAX = 6;

/** アクション欄に並べる操作と、メニューに入れる操作。どちらもその順に並べる。 */
export type ActionLayout = {
  bar: readonly EventActionId[];
  menu: readonly EventActionId[];
};

/** 呼ぶたびに新しく作る。 */
export const defaultActionLayout = (): ActionLayout => ({
  bar: ["reply", "repost", "like", "react", "zap", "bookmark"],
  menu: [
    "pin",
    "activity",
    "timeslip",
    "copy-link",
    "details",
    "mute-event",
    "broadcast",
  ],
});

/** 端末ごとの設定。スマホと PC で使う操作が違うことがある。 */
export const ACTION_LAYOUT_STORAGE_KEY = "streets.v1.actionLayout";

/** 並べる順の中で、アクション欄とメニューの境目。 */
export const MENU_DIVIDER = "divider";
type Slot = EventActionId | typeof MENU_DIVIDER;

const isAction = (value: string): value is EventActionId =>
  (EVENT_ACTIONS as readonly string[]).includes(value);

/**
 * 境目より前をアクション欄、後ろをメニューにする。欄が溢れたら、`keep`（いま動かした
 * もの）以外で欄の最後にあるものをメニューの先頭へ押し出す。欄にもメニューにも無い
 * 操作（後から増えたもの）はメニューの最後に足す。
 */
const layoutOf = (
  slots: readonly string[],
  keep?: EventActionId,
): ActionLayout => {
  const seen = new Set<EventActionId>();
  const bar: EventActionId[] = [];
  const menu: EventActionId[] = [];
  let inMenu = false;
  for (const slot of slots) {
    if (slot === MENU_DIVIDER) {
      inMenu = true;
      continue;
    }
    if (!isAction(slot) || seen.has(slot)) continue;
    seen.add(slot);
    (inMenu ? menu : bar).push(slot);
  }
  const pushed: EventActionId[] = [];
  while (bar.length > ACTION_BAR_MAX) {
    const last = bar.length - 1;
    const at = bar[last] === keep ? last - 1 : last;
    pushed.unshift(...bar.splice(at, 1));
  }
  const missing = EVENT_ACTIONS.filter((id) => !seen.has(id));
  return { bar, menu: [...pushed, ...menu, ...missing] };
};

/** 設定の画面に並べる順。アクション欄、境目、メニューの順。 */
export const slotsOf = (layout: ActionLayout): readonly Slot[] => [
  ...layout.bar,
  MENU_DIVIDER,
  ...layout.menu,
];

const schema = v.object({
  bar: v.array(v.string()),
  menu: v.array(v.string()),
});

/** 未保存・読めない値は既定の並び。知らない操作は捨て、足りない操作はメニューへ入れる。 */
export const loadActionLayout = (raw: string | null): ActionLayout => {
  if (raw === null) return defaultActionLayout();
  try {
    const result = v.safeParse(schema, JSON.parse(raw));
    if (!result.success) return defaultActionLayout();
    return layoutOf([
      ...result.output.bar,
      MENU_DIVIDER,
      ...result.output.menu,
    ]);
  } catch {
    return defaultActionLayout();
  }
};

export const saveActionLayout = (layout: ActionLayout): string =>
  JSON.stringify(layout);

/** 欄とメニューの並びがどちらも同じか。設定で「既定から変えたか」を見るのに使う。 */
export const sameActionLayout = (a: ActionLayout, b: ActionLayout): boolean =>
  a.bar.length === b.bar.length &&
  a.menu.length === b.menu.length &&
  a.bar.every((id, index) => id === b.bar[index]) &&
  a.menu.every((id, index) => id === b.menu[index]);

/**
 * この投稿のメニューに並べる操作。アクション欄を出す投稿では、欄に出していない
 * ものを入れる。出さない投稿では、中身によらない操作だけを、欄に選んだものも含めて入れる。
 */
export const menuActionsOf = (
  layout: ActionLayout,
  withBar: boolean,
): readonly EventActionId[] =>
  withBar
    ? layout.menu
    : [...layout.bar, ...layout.menu].filter((id) => EVENT_LEVEL.has(id));

/** 設定の画面で並べ替えている途中の状態。並び自体は `layout` に持つ。 */
export type ActionArrangeState = {
  layout: ActionLayout;
  /** 掴んでいる操作と、いま離したら入る位置（`slotsOf` の並びでの位置）。 */
  dragging: { id: EventActionId; to: number } | undefined;
};

export type ActionArrangeEvent =
  /** 掴んだ。`index` は掴んだ操作の今の位置。 */
  | { type: "action-layout/drag-start"; id: EventActionId; index: number }
  /** 動かしていて、離したら入る位置が変わった。 */
  | { type: "action-layout/drag-move"; to: number }
  /** 離した。動かした先で確定する。 */
  | { type: "action-layout/drop" }
  /** やめた（Esc・ポインタを奪われた）。並びは変えない。 */
  | { type: "action-layout/drag-end" }
  /** 1 つ前（-1）か後ろ（1）へずらす。境目を越えると、欄とメニューを行き来する。 */
  | { type: "action-layout/move"; id: EventActionId; direction: -1 | 1 }
  /** 欄の最後、またはメニューの先頭へ移す。 */
  | { type: "action-layout/place"; id: EventActionId; to: "bar" | "menu" };

const moved = (
  layout: ActionLayout,
  id: EventActionId,
  to: number,
): ActionLayout => layoutOf(moveId(slotsOf(layout), id, to), id);

/** いま見せる並び。掴んでいる間は、離したら入る位置へ動かした並びにする。 */
export const arrangedLayout = (state: ActionArrangeState): ActionLayout =>
  state.dragging
    ? moved(state.layout, state.dragging.id, state.dragging.to)
    : state.layout;

export const actionArrangeTransition = (
  state: ActionArrangeState,
  event: ActionArrangeEvent,
): ActionArrangeState => {
  switch (event.type) {
    case "action-layout/drag-start":
      return { ...state, dragging: { id: event.id, to: event.index } };
    case "action-layout/drag-move":
      return state.dragging
        ? { ...state, dragging: { ...state.dragging, to: event.to } }
        : state;
    case "action-layout/drop":
      return { layout: arrangedLayout(state), dragging: undefined };
    case "action-layout/drag-end":
      return { ...state, dragging: undefined };
    case "action-layout/move": {
      const slots = slotsOf(state.layout);
      const from = slots.indexOf(event.id);
      const to = Math.max(
        0,
        Math.min(slots.length - 1, from + event.direction),
      );
      return { ...state, layout: moved(state.layout, event.id, to) };
    }
    case "action-layout/place": {
      const without = slotsOf(state.layout).filter((id) => id !== event.id);
      const divider = without.indexOf(MENU_DIVIDER);
      return {
        ...state,
        layout: moved(
          state.layout,
          event.id,
          event.to === "bar" ? divider : divider + 1,
        ),
      };
    }
  }
};
