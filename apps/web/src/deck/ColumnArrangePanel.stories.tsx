import { TIMELINE_KINDS } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import {
  type DeckUiState,
  deckUiTransition,
  emptyDeckUi,
} from "@streets/core/deck/deck-ui";
import { moveId } from "@streets/core/deck/sortable";
import { For, type JSX } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ColumnHeader } from "../columns/ColumnHeader";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";
import { createSortable } from "../ui/sortable";
import { createColumnOrder } from "./column-order";
import ColumnArrangePanel from "./ColumnArrangePanel";
import SidePanel from "./SidePanel";

const friend = createStoryAuthor(91, {
  name: "friend",
  displayName: "ともだち",
});

const columns: ColumnDef[] = [
  {
    id: "home",
    title: "ホーム",
    source: { kind: "followees", kinds: [...TIMELINE_KINDS] },
  },
  {
    id: "nostr",
    title: "Nostr",
    source: { kind: "literal", filters: [{ "#t": ["nostr"] }] },
  },
  { id: "notifications", title: "通知", source: { kind: "notifications" } },
  {
    id: "friend",
    title: "ともだち",
    source: { kind: "user", pubkey: friend.pubkey },
  },
  { id: "bookmarks", title: "ブックマーク", source: { kind: "bookmarks" } },
];

/** 一覧が長くて、送らないと入りきらない。題名が長いものも混ぜる。 */
const many: ColumnDef[] = [
  ...columns,
  ...[
    "猫",
    "犬",
    "写真",
    "音楽",
    "旅行",
    "とても長いハッシュタグの名前で一覧の幅に収まらないもの",
    "料理",
    "本",
  ].map((tag, index): ColumnDef => ({
    id: `tag-${index}`,
    title: tag,
    source: { kind: "literal", filters: [{ "#t": [tag] }] },
  })),
];

/** デッキの段の代わり。掴んだ・動かした・離したを受けて、並びを変える。 */
const DeckStub = (props: {
  initial: readonly ColumnDef[];
  dragging?: DeckUiState["dragging"];
  children: (
    columns: () => readonly ColumnDef[],
    ui: DeckUiState,
  ) => JSX.Element;
}) => {
  const [deck, setDeck] = createStore({ columns: [...props.initial] });
  const [ui, setUi] = createStore<DeckUiState>({
    ...emptyDeckUi(),
    dragging: props.dragging,
  });
  const reorder = (ids: readonly string[]) =>
    setDeck(
      "columns",
      reconcile(
        ids.flatMap((id) => deck.columns.find((c) => c.id === id) ?? []),
        { key: "id" },
      ),
    );
  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "deck/drag-start":
      case "deck/drag-move":
      case "deck/drag-end":
        setUi(reconcile(deckUiTransition(unwrap(ui), event)));
        return true;
      case "deck/drop": {
        const dragging = ui.dragging;
        if (dragging) {
          reorder(
            moveId(
              deck.columns.map((c) => c.id),
              dragging.id,
              dragging.to,
            ),
          );
        }
        setUi(
          reconcile(deckUiTransition(unwrap(ui), { type: "deck/drag-end" })),
        );
        return true;
      }
      case "deck/move-column": {
        const ids = deck.columns.map((c) => c.id);
        const to = ids.indexOf(event.id) + event.direction;
        if (to >= 0 && to < ids.length) reorder(moveId(ids, event.id, to));
        return true;
      }
      default:
        return true;
    }
  };
  return (
    <EventSceneProvider scene={{ events: [friend.profile()] }}>
      <Mediates handle={handle}>
        {props.children(() => deck.columns, ui)}
      </Mediates>
    </EventSceneProvider>
  );
};

/** 広い画面のデッキの帯と同じ組み立て。カラムの中身は省く。 */
const WideStrip = (props: {
  columns: () => readonly ColumnDef[];
  dragging: () => DeckUiState["dragging"];
}) => {
  const dispatch = useDispatch();
  const order = createColumnOrder(props.columns, props.dragging);
  let strip: HTMLDivElement | undefined;
  const sort = createSortable({
    axis: "x",
    container: () => strip,
    scroller: () => strip,
    element: (id) =>
      strip?.querySelector<HTMLElement>(
        `[data-column-id="${CSS.escape(id)}"]`,
      ) ?? undefined,
    order: order.ids,
    start: (id, index) => dispatch({ type: "deck/drag-start", id, index }),
    move: (to) => dispatch({ type: "deck/drag-move", to }),
    drop: () => dispatch({ type: "deck/drop" }),
    cancel: () => dispatch({ type: "deck/drag-end" }),
  });
  return (
    <div
      ref={strip}
      class="relative flex h-[360px] w-[900px] overflow-x-auto bg-tertiary"
      onPointerDown={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const grip = target.closest("[data-column-grip]");
        if (!grip || target.closest("[data-no-grip]")) return;
        const id =
          grip.closest<HTMLElement>("[data-column-id]")?.dataset.columnId;
        if (id) sort.onPointerDown(id, event);
      }}
    >
      <For each={order.mounted()}>
        {(column) => (
          <div
            data-column-id={column.id}
            class="h-full w-80 shrink-0 border-primary border-r bg-primary data-[dragging]:z-1 data-[dragging]:shadow-[0_10px_30px_rgba(0,0,0,0.28)]"
            style={{ order: order.indexOf(column.id) }}
          >
            <ColumnHeader
              column={column}
              open={false}
              grip
              onTitle={() => {}}
            />
          </div>
        )}
      </For>
    </div>
  );
};

type Props = {
  width: number;
  initial: readonly ColumnDef[];
  dragging?: DeckUiState["dragging"];
};

const meta = {
  title: "デッキ/カラムを整理する",
  component: (props: Props) => (
    <DeckStub initial={props.initial} dragging={props.dragging}>
      {(current, ui) => (
        <div class="flex h-[560px]" style={{ width: `${props.width}px` }}>
          <SidePanel
            title="カラムを整理する"
            icon="i-material-symbols:reorder-rounded"
            full
          >
            <ColumnArrangePanel columns={current()} dragging={ui.dragging} />
          </SidePanel>
        </div>
      )}
    </DeckStub>
  ),
  args: { width: 360, initial: columns },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

/** 行を掴んで上下に動かすと、ほかの行が滑って空く。右端のつまみは ↑↓ キーでも動かせる。 */
export const ふつう: S = {};

/** 下の端へ寄せると、一覧が送られる。 */
export const カラムが多い: S = { args: { initial: many } };

export const 狭い幅: S = { args: { width: 300, initial: many } };

/** 掴んでいる途中。「Nostr」を先頭へ運んでいて、離すとこの並びになる。 */
export const 動かしている途中: S = {
  args: { dragging: { id: "nostr", to: 0 } },
};

export const カラムが無い: S = { args: { initial: [] } };

/**
 * 広い画面のデッキ。カラムの見出しを掴んで左右に動かすと、ほかのカラムが滑って空き、
 * 離すとその並びになる。Esc でやめると元に戻る。中身は省いている。
 */
export const 広い画面で見出しを掴む: S = {
  render: () => (
    <DeckStub initial={columns}>
      {(current, ui) => (
        <WideStrip columns={current} dragging={() => ui.dragging} />
      )}
    </DeckStub>
  ),
};
