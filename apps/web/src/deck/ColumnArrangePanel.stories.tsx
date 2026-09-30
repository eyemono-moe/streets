import { TIMELINE_KINDS } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import {
  type DeckUiState,
  deckUiTransition,
  emptyDeckUi,
} from "@streets/core/deck/deck-ui";
import { moveId } from "@streets/core/deck/sortable";
import { For, type JSX, createSignal } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ColumnHeader } from "../columns/ColumnHeader";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";
import { createSortable } from "../ui/sortable";
import { createColumnOrder } from "./column-order";
import ColumnArrangePanel from "./ColumnArrangePanel";
import DeckEditHeader, { type DeckSummary } from "./DeckEditHeader";
import NewDeckPanel from "./NewDeckPanel";
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
      case "deck/remove-column":
        setDeck(
          "columns",
          deck.columns.filter((c) => c.id !== event.id),
        );
        return true;
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

const DECKS: DeckSummary[] = [
  { id: "pc", name: "PC", columns: 5 },
  { id: "phone", name: "スマホ", columns: 2 },
  { id: "search", name: "調べもの", columns: 0 },
];

/** 名前が長く、数も多い。 */
const MANY_DECKS: DeckSummary[] = [
  {
    id: "pc",
    name: "とても長い名前のデッキで、パネルの幅に収まらないもの（イベントの実況用）",
    columns: 13,
  },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `d${index}`,
    name: `デッキ ${index + 2}`,
    columns: index,
  })),
];

type Props = {
  width: number;
  initial: readonly ColumnDef[];
  dragging?: DeckUiState["dragging"];
  decks?: DeckSummary[];
  initialRenaming?: boolean;
  initialConfirming?: boolean;
  initialPickerOpen?: boolean;
};

/** デッキの選び直し・名前・並び・削除だけを当てる。カラムの中身は変えない。 */
const DeckHeaderStub = (props: Props) => {
  const [decks, setDecks] = createSignal(props.decks ?? DECKS);
  const [activeId, setActiveId] = createSignal("pc");
  return (
    <Mediates
      handle={(event) => {
        switch (event.type) {
          case "deck/switch-deck":
            setActiveId(event.id);
            return true;
          case "deck/rename-deck":
            setDecks((list) =>
              list.map((deck) =>
                deck.id === event.id ? { ...deck, name: event.name } : deck,
              ),
            );
            return true;
          case "deck/move-deck":
            setDecks((list) => {
              const ids = moveId(
                list.map((deck) => deck.id),
                event.id,
                event.to,
              );
              return ids.flatMap((id) => list.find((d) => d.id === id) ?? []);
            });
            return true;
          case "deck/remove-deck":
            setDecks((list) => list.filter((deck) => deck.id !== event.id));
            return true;
          default:
            return false;
        }
      }}
    >
      <DeckEditHeader
        decks={decks()}
        activeId={activeId()}
        initialRenaming={props.initialRenaming}
        initialConfirming={props.initialConfirming}
        initialPickerOpen={props.initialPickerOpen}
      />
    </Mediates>
  );
};

const meta = {
  title: "デッキ/デッキを編集する",
  component: (props: Props) => (
    <DeckStub initial={props.initial} dragging={props.dragging}>
      {(current, ui) => (
        <div class="flex h-[560px]" style={{ width: `${props.width}px` }}>
          <SidePanel
            title="デッキを編集する"
            icon="i-material-symbols:dashboard-outline-rounded"
            full
          >
            <ColumnArrangePanel
              columns={current()}
              dragging={ui.dragging}
              header={<DeckHeaderStub {...props} />}
            />
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

/** 上のデッキを押すと、別のデッキを選び直せる。最後の項目から新しいデッキを作る。 */
export const デッキを選ぶメニュー: S = {
  args: { initialPickerOpen: true, width: 400 },
};

export const 名前を変えている: S = { args: { initialRenaming: true } };

export const デッキの削除を確かめている: S = {
  args: { initialConfirming: true },
};

export const デッキの名前が長く数が多い: S = {
  args: { decks: MANY_DECKS, initialPickerOpen: true, width: 400 },
};

export const デッキが一つだけ: S = {
  args: { decks: [{ id: "pc", name: "メイン", columns: 5 }] },
};

/** 「新しいデッキ…」から一段進んだところ。← で「デッキを編集する」へ戻る。 */
export const 新しいデッキ: S = {
  render: () => (
    <Mediates handle={() => true}>
      <div class="flex h-[560px] w-[360px]">
        <SidePanel
          title="新しいデッキ"
          icon="i-material-symbols:dashboard-outline-rounded"
          full
          onBack={() => {}}
        >
          <NewDeckPanel placeholder="デッキ 4" current="PC" />
        </SidePanel>
      </div>
    </Mediates>
  ),
};

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
