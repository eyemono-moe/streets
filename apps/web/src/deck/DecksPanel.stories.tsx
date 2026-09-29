import type { DeckSet } from "@streets/core/deck/deck";
import {
  activeDeck,
  addDeck,
  moveDeckTo,
  nextDeckName,
  removeDeck,
  renameDeck,
} from "@streets/core/deck/deck-set";
import { type Component, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import DeckMenu from "./DeckMenu";
import DecksPanel from "./DecksPanel";
import SidePanel from "./SidePanel";

const deckOf = (id: string, name: string, columns: number) => ({
  id,
  name,
  columns: Array.from({ length: columns }, (_, index) => ({
    id: `${id}-${index}`,
    title: `${index}`,
    source: { kind: "notifications" as const },
  })),
});

const ONE: DeckSet = { version: 3, decks: [deckOf("main", "メイン", 3)] };

const SEVERAL: DeckSet = {
  version: 3,
  decks: [
    deckOf("main", "PC", 8),
    deckOf("phone", "スマホ", 2),
    deckOf("search", "調べもの", 0),
  ],
};

const LONG: DeckSet = {
  version: 3,
  decks: [
    deckOf("main", "メイン", 4),
    deckOf(
      "long",
      "とても長い名前のデッキで、パネルの幅に収まらないもの（イベントの実況用）",
      12,
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      deckOf(`d${index}`, `デッキ ${index + 2}`, index),
    ),
  ],
};

type Props = {
  set: DeckSet;
  activeId: string;
  full: boolean;
  initialRenaming?: string;
  initialConfirming?: string;
};

/** パネルの操作を、アプリと同じ遷移関数で当てる。保存はしない。 */
const Demo: Component<Props> = (props) => {
  const [set, setSet] = createSignal(props.set);
  const [activeId, setActiveId] = createSignal(props.activeId);
  let added = 0;
  return (
    <Mediates
      handle={(event) => {
        switch (event.type) {
          case "deck/switch-deck":
            setActiveId(event.id);
            return true;
          case "deck/add-deck": {
            added += 1;
            const id = `added-${added}`;
            setSet((current) =>
              addDeck(current, {
                id,
                name: event.name,
                columns:
                  event.from === "copy"
                    ? activeDeck(current, activeId()).columns
                    : [],
              }),
            );
            setActiveId(id);
            return true;
          }
          case "deck/rename-deck":
            setSet((current) => renameDeck(current, event.id, event.name));
            return true;
          case "deck/move-deck":
            setSet((current) => moveDeckTo(current, event.id, event.to));
            return true;
          case "deck/remove-deck":
            setSet((current) => removeDeck(current, event.id));
            return true;
          case "deck/close-panel":
          case "deck/open-panel":
            return true;
          default:
            return false;
        }
      }}
    >
      <div
        class="flex h-[560px] border border-primary"
        classList={{
          "w-[360px]": props.full,
          "w-[720px]": !props.full,
        }}
      >
        <SidePanel
          title="デッキを編集する"
          icon="i-material-symbols:dashboard-outline-rounded"
          full={props.full}
        >
          <DecksPanel
            decks={set().decks.map((deck) => ({
              id: deck.id,
              name: deck.name,
              columns: deck.columns.length,
            }))}
            activeId={activeDeck(set(), activeId()).id}
            nextName={nextDeckName(set())}
            initialRenaming={props.initialRenaming}
            initialConfirming={props.initialConfirming}
          />
        </SidePanel>
        <div class="flex flex-1 items-start bg-tertiary p-3">
          <DeckMenu
            decks={set().decks}
            activeId={activeDeck(set(), activeId()).id}
            size="lg"
            variant="filled"
          />
        </div>
      </div>
    </Mediates>
  );
};

const meta = {
  title: "デッキ/デッキの編集",
  component: Demo,
  args: { set: SEVERAL, activeId: "main", full: false },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const いくつか持っている: S = {};
export const 一つだけ: S = { args: { set: ONE } };
export const 名前を変えている: S = { args: { initialRenaming: "phone" } };
export const 削除を確かめている: S = { args: { initialConfirming: "phone" } };
export const 長い名前と多いデッキ: S = { args: { set: LONG } };
export const 狭い画面: S = { args: { full: true } };

/** 切り替えのメニューを開いた姿。 */
export const 切り替えのメニュー: StoryObj = {
  render: () => (
    <Mediates handle={() => true}>
      <div class="h-[320px] p-3">
        <DeckMenu
          decks={LONG.decks}
          activeId="long"
          size="lg"
          variant="ghost"
          defaultOpen
        />
      </div>
    </Mediates>
  ),
};
